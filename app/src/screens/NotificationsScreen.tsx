import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/AppIcon';
import { LocationPicker } from '../components/LocationPicker';
import {
  ApiError,
  InboxItem,
  NotifySettings,
  apiAddWatchedZone,
  apiGetNotifySettings,
  apiRemoveWatchedZone,
  apiUpdateNotifySettings,
} from '../lib/api';
import { timeAgo } from '../lib/privacy';
import { PushStatus, getPushStatus, registerForPush } from '../lib/push';
import { getUserLocation } from '../lib/userLocation';
import { useNotifications } from '../notifications';
import { colors, radius } from '../theme';

interface Props {
  onClose: () => void;
  onOpenIncident: (id: string) => void;
}

const KIND_ICON: Record<InboxItem['kind'], 'check' | 'locate' | 'map-pin'> = {
  confirmation: 'check',
  nearby: 'locate',
  watched: 'map-pin',
};
const KIND_COLOR: Record<InboxItem['kind'], string> = {
  confirmation: colors.ok,
  nearby: colors.primary,
  watched: colors.accent,
};

const tap = () => Haptics.selectionAsync().catch(() => {});

export const NotificationsScreen = ({ onClose, onOpenIncident }: Props) => {
  const insets = useSafeAreaInsets();
  const { items, unread, refresh, markAllRead, markRead } = useNotifications();
  const [settings, setSettings] = useState<NotifySettings | null>(null);
  const [push, setPush] = useState<PushStatus>('undetermined');
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<{ lat: number; lng: number; suggestion: string | null } | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await apiGetNotifySettings());
    } catch (e) {
      console.warn('[notificaciones] ajustes no disponibles:', e);
    }
    setPush(await getPushStatus());
  }, []);

  useEffect(() => {
    load();
    refresh();
  }, [load, refresh]);

  // «Cerca de ti» necesita saber dónde estás: se refresca la celda al abrir (el permiso ya está dado).
  useEffect(() => {
    if (!settings?.nearby || !settings.area) return;
    getUserLocation(true).then((loc) => {
      if (loc) apiUpdateNotifySettings({ area: loc }).then(setSettings).catch(() => {});
    });
    // Solo al cargar los ajustes por primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings === null]);

  const fail = (e: unknown) => Alert.alert('No se pudo guardar', e instanceof ApiError ? e.message : 'Inténtalo de nuevo en un momento.');

  const toggle = async (key: 'confirmations' | 'watched', value: boolean) => {
    tap();
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    try {
      setSettings(await apiUpdateNotifySettings({ [key]: value }));
      if (value && push === 'undetermined') setPush(await registerForPush(true));
    } catch (e) {
      fail(e);
      load();
    }
  };

  const toggleNearby = async (value: boolean) => {
    tap();
    try {
      if (value) {
        const loc = await getUserLocation(true);
        if (!loc) {
          Alert.alert(
            'Necesitamos tu ubicación',
            'Para avisarte de lo que pasa cerca, Radio Patio debe saber en qué zona estás. Activa la ubicación del móvil y dale permiso a la app.',
          );
          return;
        }
        setSettings(await apiUpdateNotifySettings({ nearby: true, area: loc }));
        if (push === 'undetermined') setPush(await registerForPush(true));
      } else {
        setSettings(await apiUpdateNotifySettings({ nearby: false, area: null }));
      }
    } catch (e) {
      fail(e);
      load();
    }
  };

  const enablePush = async () => {
    tap();
    const res = await registerForPush(true);
    setPush(res);
    if (res === 'denied') {
      Alert.alert('Avisos desactivados en el móvil', 'Actívalos en Ajustes del móvil → Aplicaciones → Radio Patio → Notificaciones.');
    }
    load();
  };

  const saveZone = async () => {
    if (!pending || !label.trim() || busy) return;
    setBusy(true);
    try {
      const zones = await apiAddWatchedZone({ label: label.trim(), lat: pending.lat, lng: pending.lng });
      setSettings((s) => (s ? { ...s, zones } : s));
      setPending(null);
      setLabel('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (push === 'undetermined') setPush(await registerForPush(true));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const removeZone = (id: number, name: string) => {
    Alert.alert(`Dejar de vigilar «${name}»`, 'Ya no te avisaremos de lo que pase en esa zona.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Dejar de vigilar',
        style: 'destructive',
        onPress: async () => {
          try {
            const zones = await apiRemoveWatchedZone(id);
            setSettings((s) => (s ? { ...s, zones } : s));
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);
  };

  const openItem = (n: InboxItem) => {
    tap();
    markRead(n.id);
    if (n.incidentId) onOpenIncident(n.incidentId);
  };

  const zones = settings?.zones ?? [];
  const canAddZone = !!settings && zones.length < settings.maxZones;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver" style={styles.back}>
          <AppIcon name="chevron-left" color={colors.text} size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Notificaciones</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {(push === 'undetermined' || push === 'denied') && (
          <Pressable onPress={enablePush} accessibilityRole="button" style={({ pressed }) => [styles.banner, pressed && { opacity: 0.9 }]}>
            <AppIcon name="bell" color="#fff" size={22} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Recibe los avisos en el móvil</Text>
              <Text style={styles.bannerText}>
                {push === 'denied' ? 'Están bloqueados en los ajustes del móvil. Toca para ver cómo activarlos.' : 'Toca para permitir las notificaciones aunque la app esté cerrada.'}
              </Text>
            </View>
          </Pressable>
        )}

        {/* ── Bandeja ─────────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.section}>Recientes{unread > 0 ? ` · ${unread} sin leer` : ''}</Text>
          {unread > 0 && (
            <Pressable onPress={markAllRead} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Marcar leídas</Text>
            </Pressable>
          )}
        </View>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Todo tranquilo por ahora</Text>
            <Text style={styles.emptyText}>
              Aquí verás cuando alguien confirme un aviso tuyo, y lo que pase cerca de ti o en las zonas que vigilas.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {items.map((n, idx) => (
              <Pressable
                key={n.id}
                onPress={() => openItem(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}. ${n.body}. ${timeAgo(n.createdAt)}`}
                style={({ pressed }) => [styles.item, idx > 0 && styles.itemBorder, pressed && { backgroundColor: colors.surface2 }]}
              >
                <View style={[styles.itemIcon, { backgroundColor: KIND_COLOR[n.kind] + '22' }]}>
                  <AppIcon name={KIND_ICON[n.kind]} color={KIND_COLOR[n.kind]} size={18} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.itemTitle, !n.read && styles.itemTitleUnread]} numberOfLines={2}>
                    {n.title}
                  </Text>
                  <Text style={styles.itemBody} numberOfLines={2}>
                    {n.body}
                  </Text>
                  <Text style={styles.itemTime}>{timeAgo(n.createdAt)}</Text>
                </View>
                {!n.read && <View style={styles.unreadDot} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Qué quiero que me avisen ────────────────────────────────── */}
        <Text style={[styles.section, { marginTop: 22 }]}>Avisarme de…</Text>
        {!settings ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : (
          <View style={styles.card}>
            <Row
              title="Confirmaciones de mis avisos"
              text="Cuando un vecino confirma un aviso que has publicado."
              value={settings.confirmations}
              onChange={(v) => toggle('confirmations', v)}
            />
            <Row
              border
              title="Avisos cerca de ti"
              text={`Un aviso nuevo a menos de ${(settings.radiusM / 1000).toFixed(0)} km de donde estás. Solo compartimos la zona aproximada (~450 m), no tu posición exacta.`}
              value={settings.nearby && !!settings.area}
              onChange={toggleNearby}
            />
            <Row
              border
              title="Zonas que vigilo"
              text="Avisos nuevos en los sitios de la lista de abajo, aunque no estés allí."
              value={settings.watched}
              onChange={(v) => toggle('watched', v)}
            />
          </View>
        )}

        {/* ── Zonas vigiladas ─────────────────────────────────────────── */}
        <View style={[styles.sectionHead, { marginTop: 22 }]}>
          <Text style={styles.section}>Zonas que vigilo</Text>
          {settings && <Text style={styles.count}>{zones.length}/{settings.maxZones}</Text>}
        </View>
        <Text style={styles.sectionHelp}>Para saber qué ocurre donde vive un familiar, tu trabajo o cualquier sitio que te importe.</Text>

        {zones.length > 0 && (
          <View style={styles.card}>
            {zones.map((z, idx) => (
              <View key={z.id} style={[styles.item, idx > 0 && styles.itemBorder]}>
                <View style={[styles.itemIcon, { backgroundColor: colors.accent + '22' }]}>
                  <AppIcon name="map-pin" color={colors.accent} size={18} />
                </View>
                <Text style={[styles.itemTitle, styles.itemTitleUnread, { flex: 1 }]} numberOfLines={1}>
                  {z.label}
                </Text>
                <Pressable onPress={() => removeZone(z.id, z.label)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Dejar de vigilar ${z.label}`} style={styles.trash}>
                  <AppIcon name="trash" color={colors.muted} size={18} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {pending ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>¿Cómo la llamamos?</Text>
            <Text style={styles.formSub} numberOfLines={2}>
              {pending.suggestion ?? 'Zona marcada en el mapa'}
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Casa de mamá, Trabajo…"
              placeholderTextColor={colors.muted}
              maxLength={60}
              autoFocus
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={saveZone}
            />
            <View style={styles.formActions}>
              <Pressable onPress={() => { setPending(null); setLabel(''); }} accessibilityRole="button" style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={saveZone}
                disabled={!label.trim() || busy}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, (!label.trim() || busy) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.primaryText}>{busy ? 'Guardando…' : 'Vigilar zona'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => { tap(); setPicking(true); }}
            disabled={!canAddZone}
            accessibilityRole="button"
            style={({ pressed }) => [styles.add, !canAddZone && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
          >
            <AppIcon name="map-pin" color={colors.accent} size={18} />
            <Text style={styles.addText}>{canAddZone || !settings ? 'Vigilar una zona' : 'Has llegado al máximo de zonas'}</Text>
          </Pressable>
        )}
      </ScrollView>

      <LocationPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onConfirm={(point, suggestion) => {
          setPicking(false);
          setPending({ ...point, suggestion });
          setLabel('');
        }}
      />
    </View>
  );
};

const Row = ({ title, text, value, onChange, border }: { title: string; text: string; value: boolean; onChange: (v: boolean) => void; border?: boolean }) => (
  <View style={[styles.row, border && styles.itemBorder]}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.line, true: colors.primary }}
      thumbColor="#fff"
      accessibilityLabel={title}
    />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accent, borderRadius: radius.md, padding: 14, marginBottom: 18 },
  bannerTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  bannerText: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  section: { color: colors.text, fontSize: 17, fontWeight: '800' },
  sectionHelp: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  count: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  itemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: colors.textMuted, fontSize: 14.5, fontWeight: '600' },
  itemTitleUnread: { color: colors.text, fontWeight: '800' },
  itemBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  itemTime: { color: colors.muted, fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  empty: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 4 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowText: { color: colors.muted, fontSize: 12.5, lineHeight: 17 },
  trash: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, marginTop: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed' },
  addText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  form: { marginTop: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  formTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  formSub: { color: colors.muted, fontSize: 12.5 },
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, paddingHorizontal: 14, color: colors.text, fontSize: 16 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondary: { flex: 1, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  primary: { flex: 1.4, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
