import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryById } from '../data/categories';
import { areaName } from '../data/neighborhood';
import { Incident } from '../data/types';
import { readableAddress } from '../lib/address';
import { timeAgo } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor } from '../theme';
import { AppIcon } from './AppIcon';
import { CategoryIcon } from './CategoryIcon';
import { useIdentity } from './IdentityGate';

/** Fila compacta de un aviso (panel del mapa): abre el detalle y permite confirmar sin salir. */
export const IncidentRow = ({
  incident,
  onOpen,
  highlighted,
}: {
  incident: Incident;
  onOpen: (id: string) => void;
  highlighted?: boolean;
}) => {
  const { confirm } = useIncidents();
  const { requireIdentity } = useIdentity();
  const cat = categoryById(incident.category);
  const sev = severityColor[cat.severity];
  const place = readableAddress(incident.zone.address) ?? areaName(incident.zone);

  const onConfirm = async () => {
    if (!(await requireIdentity())) return;
    confirm(incident.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <Pressable
      onPress={() => onOpen(incident.id)}
      accessibilityRole="button"
      accessibilityLabel={`${cat.label}, ${place}, ${timeAgo(incident.createdAt)}. Abrir aviso`}
      style={({ pressed }) => [styles.row, highlighted && styles.rowOn, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.icon, { backgroundColor: sev + '26' }]}>
        <CategoryIcon id={incident.category} color={sev} size={20} strokeWidth={2.2} />
      </View>

      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {cat.label}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {place} · {timeAgo(incident.createdAt)}
        </Text>
        <Text style={styles.desc} numberOfLines={2}>
          {incident.description}
        </Text>
      </View>

      {incident.mine ? (
        <Text style={styles.mine}>Tu aviso</Text>
      ) : (
        <Pressable
          onPress={onConfirm}
          disabled={incident.confirmedByMe}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={incident.confirmedByMe ? 'Aviso confirmado por ti' : 'Confirmar que has visto este aviso'}
          style={({ pressed }) => [styles.confirm, incident.confirmedByMe && styles.confirmDone, pressed && { opacity: 0.8 }]}
        >
          <AppIcon name="check" color={incident.confirmedByMe ? colors.ok : colors.primary} size={14} strokeWidth={2.6} />
          <Text style={[styles.confirmText, incident.confirmedByMe && { color: colors.ok }]}>
            {incident.confirmedByMe ? 'Visto' : 'Lo he visto'}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rowOn: { borderColor: colors.accent, backgroundColor: colors.primarySoft },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 1 },
  title: { color: colors.text, fontSize: 15, fontFamily: 'PlusJakartaSans_800ExtraBold' },
  meta: { color: colors.muted, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  desc: { color: colors.textMuted, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18, marginTop: 2 },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  confirmDone: { backgroundColor: 'rgba(16,185,129,0.12)' },
  confirmText: { color: colors.primary, fontSize: 12, fontFamily: 'PlusJakartaSans_800ExtraBold' },
  mine: { color: colors.accent, fontSize: 11, fontFamily: 'PlusJakartaSans_800ExtraBold', backgroundColor: colors.surface2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, overflow: 'hidden' },
});
