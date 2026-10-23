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
  apiGetIncidents,
} from './lib/api';
import { ApiError } from './lib/api';
import { parseStoredIncidents, pruneExpired } from './lib/dataQuality';

const KEY = 'av.incidents.v1';
/** Confirmaciones vecinales necesarias para quitar la etiqueta "sin confirmar". */
const CONFIRMED_AT = 2;
/** Tope del caché local: evita crecer sin límite en dispositivos antiguos. */
const CACHE_CAP = 200;

interface Store {
  incidents: Incident[];
  ready: boolean;
  refresh: () => Promise<void>;
  addIncident: (p: { category: CategoryId; zone: Zone; description: string }) => Incident;
  confirm: (id: string) => void;
  flag: (id: string) => void;
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

export const IncidentsProvider = ({ children }: { children: React.ReactNode }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ready, setReady] = useState(false);

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
        setIncidents(raw === null ? makeSeed() : cached);
      } catch {
        setIncidents(makeSeed());
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
    };
    setIncidents((prev) => [inc, ...prev]);

    apiCreateIncident(p)
      .then((created) => {
        setIncidents((prev) => prev.map((item) => (item.id === tempId ? created : item)));
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

  const reset = useCallback(() => {
    setIncidents(makeSeed());
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
      reset,
      isConfirmed: (i) => i.confirmations >= CONFIRMED_AT,
    }),
    [incidents, ready, loadFromBackend, addIncident, confirm, flag, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useIncidents = (): Store => {
  const v = useContext(Ctx);
  if (!v) throw new Error('IncidentsProvider missing');
  return v;
};
