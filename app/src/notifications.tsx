import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { InboxItem, apiGetInbox, apiMarkNotificationsRead } from './lib/api';
import { configurePush, pushSupported, registerForPush } from './lib/push';

/**
 * Bandeja de notificaciones: se consulta al abrir la app, al volver a ella y
 * cada minuto mientras está abierta (el push cubre el resto del tiempo).
 */
interface Ctx {
  items: InboxItem[];
  unread: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
}

const NotificationsCtx = createContext<Ctx | null>(null);

const POLL_MS = 60_000;

export const NotificationsProvider = ({
  children,
  onOpenIncident,
}: {
  children: React.ReactNode;
  /** Se llama al tocar una notificación push: abre ese aviso. */
  onOpenIncident: (id: string) => void;
}) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(onOpenIncident);
  openRef.current = onOpenIncident;

  const refresh = useCallback(async () => {
    try {
      const inbox = await apiGetInbox();
      setItems(inbox.items);
      setUnread(inbox.unread);
    } catch {
      // Sin red o servidor caído: se conserva lo que había.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((l) => l.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await apiMarkNotificationsRead().catch(() => {});
  }, []);

  const markRead = useCallback(async (id: number) => {
    let wasUnread = false;
    setItems((l) => l.map((n) => (n.id === id ? ((wasUnread ||= !n.read), { ...n, read: true }) : n)));
    setUnread((u) => Math.max(0, u - (wasUnread ? 1 : 0)));
    await apiMarkNotificationsRead([id]).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Si ya había permiso, el token se renueva en silencio (puede cambiar).
    registerForPush(false).catch(() => {});
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  // Tocar un push (con la app cerrada, en segundo plano o abierta) abre el aviso.
  useEffect(() => {
    if (!pushSupported) return;
    configurePush().catch(() => {});
    const open = (res: Notifications.NotificationResponse | null) => {
      const id = res?.notification.request.content.data?.incidentId;
      if (typeof id === 'string') {
        openRef.current(id);
        refresh();
      }
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        open(r);
        Notifications.clearLastNotificationResponse();
      }
    });
    const tapSub = Notifications.addNotificationResponseReceivedListener(open);
    const recvSub = Notifications.addNotificationReceivedListener(() => refresh());
    return () => {
      tapSub.remove();
      recvSub.remove();
    };
  }, [refresh]);

  const value = useMemo(() => ({ items, unread, refresh, markAllRead, markRead }), [items, unread, refresh, markAllRead, markRead]);
  return <NotificationsCtx.Provider value={value}>{children}</NotificationsCtx.Provider>;
};

export const useNotifications = (): Ctx => {
  const ctx = useContext(NotificationsCtx);
  if (!ctx) throw new Error('useNotifications fuera de NotificationsProvider');
  return ctx;
};
