import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/AppIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { useIdentity } from '../components/IdentityGate';
import { categoryById } from '../data/categories';
import { areaName } from '../data/neighborhood';
import { readableAddress } from '../lib/address';
import { apiAppealIncident } from '../lib/api';
import { HOURS_VISIBLE, timeAgo } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor, severityLabel } from '../theme';

interface Props {
  incidentId: string;
  onClose: () => void;
  /** «Ver en el mapa»: cierra el detalle y centra el mapa en este aviso. */
  onShowOnMap: (id: string) => void;
}

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

const expiresIn = (createdAt: number): string => {
  const left = Math.max(0, HOURS_VISIBLE * 3_600_000 - (Date.now() - createdAt));
  const h = Math.floor(left / 3_600_000);
  if (h >= 1) return `Caduca en ${h} h`;
  return `Caduca en ${Math.max(1, Math.round(left / 60_000))} min`;
};

export const IncidentDetailScreen = ({ incidentId, onClose, onShowOnMap }: Props) => {
  const insets = useSafeAreaInsets();
  const { incidents, confirm, flag, isConfirmed } = useIncidents();
  const { requireIdentity } = useIdentity();
  const incident = incidents.find((i) => i.id === incidentId);

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Volver"
        style={styles.back}
      >
        <AppIcon name="chevron-left" color={colors.text} size={22} />
      </Pressable>
      <Text style={styles.headerTitle}>Aviso</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (!incident) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        {header}
        <View style={styles.gone}>
          <Text style={styles.goneTitle}>Este aviso ya no está disponible</Text>
          <Text style={styles.goneText}>Los avisos desaparecen a las 72 horas o cuando se ocultan tras varias denuncias.</Text>
        </View>
      </View>
    );
  }

  const cat = categoryById(incident.category);
  const sev = severityColor[cat.severity];
  const verified = isConfirmed(incident);
  const street = readableAddress(incident.zone.address);
  const place = street ?? areaName(incident.zone);

  const onConfirm = async () => {
    if (!(await requireIdentity())) return;
    confirm(incident.id);
    tap();
  };

  const onFlag = () =>
    Alert.alert('Denunciar aviso', 'Se ocultará para ti y se enviará a moderación si identifica a personas, es falso o incita al odio.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Denunciar',
        style: 'destructive',
        onPress: async () => {
          if (!(await requireIdentity())) return;
          flag(incident.id);
          tap();
          onClose();
        },
      },
    ]);

  const onAppeal = () =>
    apiAppealIncident(incident.id)
      .then(() => Alert.alert('Recurso enviado', 'Tu aviso volverá a revisión. Gracias por tu paciencia.'))
      .catch(() => Alert.alert('Error', 'No se pudo enviar el recurso.'));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: sev + '22', borderColor: sev + '55' }]}>
            <CategoryIcon id={incident.category} color={sev} size={34} strokeWidth={2.2} />
          </View>
          <Text style={styles.title}>{cat.label}</Text>
          <View style={styles.pills}>
            <View style={[styles.pill, { backgroundColor: sev + '18', borderColor: sev + '60' }]}>
              <Text style={[styles.pillText, { color: sev }]}>{severityLabel[cat.severity]}</Text>
            </View>
            <View style={styles.pill}>
              <AppIcon name="clock" color={colors.muted} size={12} />
              <Text style={styles.pillText}>{timeAgo(incident.createdAt)}</Text>
            </View>
            <View style={[styles.pill, verified && styles.pillOk]}>
              <AppIcon name={verified ? 'shield-check' : 'clock'} color={verified ? colors.ok : colors.muted} size={12} />
              <Text style={[styles.pillText, verified && { color: colors.ok }]}>
                {verified ? `Confirmado (${incident.confirmations})` : 'Sin confirmar'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.place}>
            <AppIcon name="map-pin" color={colors.accent} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeMain}>{place}</Text>
              <Text style={styles.placeSub}>Zona aproximada (~450 m). La posición exacta no se publica.</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Qué ha ocurrido</Text>
          <Text style={styles.desc}>{incident.description}</Text>
          <Text style={styles.expiry}>{expiresIn(incident.createdAt)}</Text>
        </View>

        {incident.mine ? (
          incident.status === 'hidden' ? (
            <Pressable onPress={onAppeal} accessibilityRole="button" style={styles.secondary}>
              <Text style={styles.secondaryText}>Recurrir ocultación</Text>
            </Pressable>
          ) : (
            <View style={styles.mineBox}>
              <Text style={styles.mineText}>Este aviso es tuyo. Otros vecinos pueden confirmarlo.</Text>
            </View>
          )
        ) : (
          <Pressable
            onPress={onConfirm}
            disabled={incident.confirmedByMe}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, incident.confirmedByMe && styles.primaryDone, pressed && { opacity: 0.85 }]}
          >
            <AppIcon name="check" color={incident.confirmedByMe ? colors.ok : '#fff'} size={18} strokeWidth={2.6} />
            <Text style={[styles.primaryText, incident.confirmedByMe && { color: colors.ok }]}>
              {incident.confirmedByMe ? 'Lo has confirmado' : 'Lo he visto'}
            </Text>
          </Pressable>
        )}

        {incident.zone.lat != null && incident.zone.lng != null && (
          <Pressable onPress={() => onShowOnMap(incident.id)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}>
            <AppIcon name="map-pin" color={colors.primary} size={16} />
            <Text style={styles.secondaryText}>Ver en el mapa</Text>
          </Pressable>
        )}

        {!incident.mine && (
          <Pressable onPress={onFlag} accessibilityRole="button" hitSlop={8} style={styles.flag}>
            <AppIcon name="flag" color={colors.muted} size={15} />
            <Text style={styles.flagText}>Denunciar este aviso</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  content: { padding: 20, gap: 14 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent' },
  pillOk: { backgroundColor: 'rgba(16,185,129,0.12)' },
  pillText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  place: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  placeMain: { color: colors.text, fontSize: 16, fontWeight: '800' },
  placeSub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  desc: { color: colors.text, fontSize: 16, lineHeight: 24 },
  expiry: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.primary },
  primaryDone: { backgroundColor: 'rgba(16,185,129,0.12)' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary + '66' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  mineBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 14 },
  mineText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  flag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44 },
  flagText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  gone: { padding: 28, alignItems: 'center', gap: 10 },
  goneTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  goneText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
