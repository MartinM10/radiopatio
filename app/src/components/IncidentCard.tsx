import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiAppealIncident } from '../lib/api';
import { categoryById } from '../data/categories';
import { areaName } from '../data/neighborhood';
import { Incident } from '../data/types';
import { readableAddress } from '../lib/address';
import { timeAgo } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor, severityLabel } from '../theme';
import { AppIcon } from './AppIcon';
import { useIdentity } from './IdentityGate';
import { CategoryIcon } from './CategoryIcon';

interface Props {
  incident: Incident;
  compact?: boolean;
  /** Si se pasa, tocar la tarjeta abre el detalle del aviso. */
  onOpen?: (id: string) => void;
  /** Si se pasa, la tarjeta ofrece «Ver en el mapa». */
  onShowOnMap?: (id: string) => void;
  /** «450 m»: se muestra junto a la zona cuando la lista está ordenada por cercanía. */
  distanceText?: string | null;
}

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export const IncidentCard = ({ incident, compact, onOpen, onShowOnMap, distanceText }: Props) => {
  const { confirm, flag, isConfirmed } = useIncidents();
  const { requireIdentity } = useIdentity();
  const cat = categoryById(incident.category);
  const sev = severityColor[cat.severity];
  const confirmed = isConfirmed(incident);

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
        },
      },
    ]);

  return (
    <Pressable
      onPress={onOpen ? () => onOpen(incident.id) : undefined}
      disabled={!onOpen}
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={onOpen ? `${cat.label}. Abrir aviso` : undefined}
      style={({ pressed }) => [styles.card, pressed && onOpen && { opacity: 0.93 }]}
    >
      <View style={[styles.stripe, { backgroundColor: sev }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: sev + '20', borderColor: sev + '40' }]}>
            <CategoryIcon id={incident.category} color={sev} size={22} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{cat.label}</Text>
            <View style={styles.metaRow}>
              <AppIcon name="map-pin" color={colors.muted} size={12} />
              <Text style={styles.meta} numberOfLines={1}>
                {readableAddress(incident.zone.address) ?? areaName(incident.zone)}
                {distanceText ? ` · ${distanceText}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.pills}>
            <View style={[styles.sevPill, { borderColor: sev + '60', backgroundColor: sev + '15' }]}>
              <Text style={[styles.sevText, { color: sev }]}>{severityLabel[cat.severity]}</Text>
            </View>
            <View style={styles.timePill}>
              <AppIcon name="clock" color={colors.muted} size={11} />
              <Text style={styles.timeText}>{timeAgo(incident.createdAt)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.desc} numberOfLines={compact ? 3 : undefined}>
          {incident.description}
        </Text>

        {onShowOnMap && incident.zone.lat != null && incident.zone.lng != null && (
          <Pressable
            onPress={() => onShowOnMap(incident.id)}
            accessibilityRole="button"
            accessibilityLabel="Ver este aviso en el mapa"
            hitSlop={8}
            style={styles.mapLink}
          >
            <AppIcon name="map-pin" color={colors.primary} size={13} />
            <Text style={styles.mapLinkText}>Ver en el mapa</Text>
          </Pressable>
        )}

        <View style={styles.footer}>
          <View
            style={[
              styles.status,
              {
                backgroundColor: confirmed ? 'rgba(52,211,153,0.14)' : colors.surface2,
                borderColor: confirmed ? 'rgba(52,211,153,0.3)' : colors.line,
              },
            ]}
          >
            <AppIcon
              name={confirmed ? 'shield-check' : 'clock'}
              color={confirmed ? colors.ok : colors.muted}
              size={13}
            />
            <Text style={[styles.statusText, { color: confirmed ? colors.ok : colors.muted }]}>
              {confirmed ? `Confirmado (${incident.confirmations})` : 'Sin confirmar'}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {incident.mine ? (
            incident.status === 'hidden' ? (
              <Pressable
                onPress={() => {
                  apiAppealIncident(incident.id)
                    .then(() => {
                      Alert.alert('Recurso enviado', 'Tu aviso volverá a revisión. Gracias por tu paciencia.');
                    })
                    .catch(() => {
                      Alert.alert('Error', 'No se pudo enviar el recurso.');
                    });
                }}
                style={styles.btn}
              >
                <Text style={styles.btnText}>Recurrir ocultación</Text>
              </Pressable>
            ) : (
              <View style={styles.mineBadge}>
                <Text style={styles.mine}>Tu aviso</Text>
              </View>
            )
          ) : (
            <View style={styles.actions}>
              <Pressable
                disabled={incident.confirmedByMe}
                onPress={async () => {
                  if (!(await requireIdentity())) return;
                  confirm(incident.id);
                  tap();
                }}
                accessibilityRole="button"
                accessibilityLabel={incident.confirmedByMe ? 'Aviso confirmado por ti' : 'Confirmar que has visto este aviso'}
                style={({ pressed }) => [
                  styles.btn,
                  incident.confirmedByMe && styles.btnDone,
                  pressed && !incident.confirmedByMe && styles.btnPressed,
                ]}
              >
                <AppIcon
                  name="check"
                  color={incident.confirmedByMe ? colors.ok : colors.primary}
                  size={13}
                />
                <Text style={[styles.btnText, incident.confirmedByMe && { color: colors.ok }]}>
                  {incident.confirmedByMe ? 'Confirmado' : 'Lo he visto'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onFlag}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Denunciar aviso a moderación"
                style={({ pressed }) => [styles.flag, pressed && styles.flagPressed]}
              >
                <AppIcon name="flag" color={colors.muted} size={15} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 12 },
  pills: { alignItems: 'flex-end', gap: 6 },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  timeText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  mapLinkText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  sevPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  sevText: { fontSize: 11, fontWeight: '700' },
  desc: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  mineBadge: { backgroundColor: colors.surface2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  mine: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    minHeight: 36,
  },
  btnDone: { backgroundColor: 'rgba(52,211,153,0.12)' },
  btnPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  btnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  flag: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagPressed: { backgroundColor: colors.line, transform: [{ scale: 0.96 }] },
});
