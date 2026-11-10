import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { makeSeed } from './data/seed';
import { CategoryId, Incident, Zone } from './data/types';
import {
  apiConfirmIncident,
  apiCreateIncident,
  apiFlagIncident,
  apiGetConfig,
  apiGetIncidents,
  apiResolveIncident,
  apiStillThere,
} from './lib/api';
import { ApiError } from './lib/api';
import { CONFIRMED_AT, parseStoredIncidents, pruneExpired, setVerifiedAt } from './lib/dataQuality';
import { H, expiresAtOf } from './lib/lifetime';
import { askPushOnce } from './lib/push';

const KEY = 'av.incidents.v1';
/** Último umbral de verificación que dijo el servidor: se usa mientras no responde. */
const VERIFIED_KEY = 'av.verified_at.v1';
/** Lo que tarda en desaparecer un aviso resuelto (espejo del servidor). */
const RESOLVED_GRACE_MS = 2 * H;
/** Tope del caché local: evita crecer sin límite en dispositivos antiguos. */
const CACHE_CAP = 200;

interface Store {
  incidents: Incident[];
  ready: boolean;
  refresh: () => Promise<void>;
  addIncident: (p: { category: CategoryId; zone: Zone; description: string; photo?: string }) => Incident;
  confirm: (id: string) => void;
  flag: (id: string) => void;
  /** El autor da su aviso por resuelto. */
  resolve: (id: string) => void;
  /** «¿Sigue ahí?»: here = true lo amplía, false pide cerrarlo. Devuelve el aviso actualizado. */
  stillThere: (id: string, here: boolean) => Promise<{ extended: boolean; resolved: boolean } | null>;
  reset: () => void;
  isConfirmed: (i: Incident) => boolean;
}

const Ctx = createContext<Store | null>(null);

/** Estado saludable: caducados fuera y sin duplicados de id. */
const sanitizeState = (list: Incident[]): Incident[] => {
  const alive = pruneExpired(list);
  const seen = new Set<string>();
  return alive.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))).slice(0, CACHE_CAP);
};

const getInitialSeed = (): Incident[] => (__DEV__ ? makeSeed() : []);

export const IncidentsProvider = ({ children }: { children: React.ReactNode }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ready, setReady] = useState(false);
  // El umbral de verificación lo decide el servidor; al cambiar, se vuelve a pintar todo lo que lo usa.
  const [verifiedAt, setVerifiedAtState] = useState(CONFIRMED_AT);

  useEffect(() => {
    AsyncStorage.getItem(VERIFIED_KEY)
      .then((v) => {
        if (v) {
          setVerifiedAt(Number(v));
          setVerifiedAtState(CONFIRMED_AT);
        }
      })
      .catch(() => {});
    apiGetConfig()
      .then((cfg) => {
        setVerifiedAt(cfg.verifiedAt);
        setVerifiedAtState(CONFIRMED_AT);
        AsyncStorage.setItem(VERIFIED_KEY, String(CONFIRMED_AT)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const loadFromBackend = useCallback(async () => {
    try {
      const serverData = await apiGetIncidents();
      const healthy = sanitizeState(Array.isArray(serverData) ? serverData : []);
      setIncidents((prev) => {
        const serverIds = new Set(healthy.map((i) => i.id));
        const pendingMine = prev.filter((i) => i.mine && !serverIds.has(i.id));
        return sanitizeState([...pendingMine, ...healthy]);
      });
      await AsyncStorage.setItem(KEY, JSON.stringify(healthy)).catch(() => {});
    } catch (err) {
      console.warn('Backend unavailable, using cached data:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const { incidents: cached, stats } = parseStoredIncidents(raw);
        if (stats.invalid > 0 || stats.expired > 0 || stats.corrupt) {
          console.warn(
            `[datos] caché saneado: ${stats.kept} válidos, ${stats.invalid} inválidos, ` +
              `${stats.expired} caducados${stats.corrupt ? ', JSON corrupto' : ''}`,
          );
        }
        setIncidents(raw === null ? getInitialSeed() : cached);
      } catch {
        setIncidents(getInitialSeed());
      } finally {
        setReady(true);
        loadFromBackend();
      }
    })();
  }, [loadFromBackend]);

  // Re-sync al volver al primer plano: el caché puede estar desfasado.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && ready) loadFromBackend();
    });
    return () => sub.remove();
  }, [loadFromBackend, ready]);

  useEffect(() => {
    if (!ready) return;
    const persistable = pruneExpired(incidents).slice(0, CACHE_CAP);
    AsyncStorage.setItem(KEY, JSON.stringify(persistable)).catch((e) =>
      console.warn('[datos] No se pudo guardar el caché local:', e),
    );
  }, [incidents, ready]);

  const addIncident: Store['addIncident'] = useCallback((p) => {
    const tempId = `u${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inc: Incident = {
      id: tempId,
      category: p.category,
      zone: p.zone,
      description: p.description.trim(),
      createdAt: Date.now(),
      confirmations: 0,
      mine: true,
      hasPhoto: Boolean(p.photo),
    };
    setIncidents((prev) => [inc, ...prev]);

    apiCreateIncident(p)
      .then((created) => {
        setIncidents((prev) => prev.map((item) => (item.id === tempId ? created : item)));
        // Primer aviso publicado: buen momento para pedir permiso de notificaciones.
        askPushOnce();
      })
      .catch((err) => {
        // Veracidad: si el servidor rechaza, el optimista se elimina y se
        // muestra el motivo (dedup, anti-spam, privacidad, validación).
        setIncidents((prev) => prev.filter((item) => item.id !== tempId));
        const message =
          err instanceof ApiError
            ? err.message
            : 'No se pudo contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
        Alert.alert('Aviso no publicado', message);
        console.warn('[datos] publicación rechazada:', err instanceof ApiError ? err.code : err);
      });

    return inc;
  }, []);

  const confirm = useCallback((id: string) => {
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === id && !i.confirmedByMe && !i.mine
          ? { ...i, confirmations: i.confirmations + 1, confirmedByMe: true }
          : i,
      ),
    );

    apiConfirmIncident(id).catch((err: unknown) => {
      // Revertir el optimista si el servidor rechaza.
      setIncidents((prev) =>
        prev.map((i) =>
          i.id === id && i.confirmedByMe
            ? { ...i, confirmations: Math.max(0, i.confirmations - 1), confirmedByMe: false }
            : i,
        ),
      );
      console.warn('Error confirming incident on backend:', err);
    });
  }, []);

  const flag = useCallback((id: string) => {
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, flaggedByMe: true } : i)));

    apiFlagIncident(id).catch((err: unknown) => {
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, flaggedByMe: false } : i)));
      console.warn('Error flagging incident on backend:', err);
    });
  }, []);

  const resolve = useCallback((id: string) => {
    let before: Incident | undefined;
    setIncidents((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        before = i;
        return { ...i, resolved: true, expiresAt: Math.min(expiresAtOf(i), Date.now() + RESOLVED_GRACE_MS) };
      }),
    );
    apiResolveIncident(id)
      .then((res) => setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, resolved: true, expiresAt: res.expiresAt } : i))))
      .catch((err: unknown) => {
        if (before) setIncidents((prev) => prev.map((i) => (i.id === id ? before! : i)));
        Alert.alert('No se pudo marcar como resuelto', err instanceof ApiError ? err.message : 'Inténtalo de nuevo en un momento.');
      });
  }, []);

  const stillThere = useCallback(async (id: string, here: boolean) => {
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, presenceVote: here } : i)));
    try {
      const res = await apiStillThere(id, here);
      setIncidents((prev) =>
        prev.map((i) => (i.id === id ? { ...i, presenceVote: here, resolved: res.resolved, expiresAt: res.expiresAt } : i)),
      );
      return { extended: res.extended, resolved: res.resolved };
    } catch (err) {
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, presenceVote: undefined } : i)));
      Alert.alert('No se pudo enviar tu respuesta', err instanceof ApiError ? err.message : 'Inténtalo de nuevo en un momento.');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setIncidents(getInitialSeed());
    loadFromBackend();
  }, [loadFromBackend]);

  const value = useMemo<Store>(
    () => ({
      incidents,
      ready,
      refresh: loadFromBackend,
      addIncident,
      confirm,
      flag,
      resolve,
      stillThere,
      reset,
      isConfirmed: (i) => i.confirmations >= verifiedAt,
    }),
    [incidents, ready, verifiedAt, loadFromBackend, addIncident, confirm, flag, resolve, stillThere, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useIncidents = (): Store => {
  const v = useContext(Ctx);
  if (!v) throw new Error('IncidentsProvider missing');
  return v;
};
