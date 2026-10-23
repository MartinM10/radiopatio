import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiAppealIncident } from '../lib/api';
import { categoryById } from '../data/categories';
import { areaName } from '../data/neighborhood';
import { Incident } from '../data/types';
import { timeAgo } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor, severityLabel } from '../theme';

interface Props {
  incident: Incident;
  compact?: boolean;
}

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export const IncidentCard = ({ incident, compact }: Props) => {
  const { confirm, flag, isConfirmed } = useIncidents();
  const cat = categoryById(incident.category);
  const sev = severityColor[cat.severity];
  const confirmed = isConfirmed(incident);

  const onFlag = () =>
    Alert.alert('Denunciar aviso', 'Se ocultará para ti y se enviará a moderación si identifica a personas, es falso o incita al odio.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Denunciar',
        style: 'destructive',
        onPress: () => {
          flag(incident.id);
          tap();
        },
      },
    ]);

  return (
    <View style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: sev }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={[styles.emoji, { backgroundColor: sev + '26' }]}>
            <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{cat.label}</Text>
            <Text style={styles.meta}>
              {incident.zone.address || areaName(incident.zone)} · {timeAgo(incident.createdAt)}
            </Text>
          </View>
          <View style={[styles.sevPill, { borderColor: sev }]}>
            <Text style={[styles.sevText, { color: sev }]}>{severityLabel[cat.severity]}</Text>
          </View>
        </View>

        <Text style={styles.desc} numberOfLines={compact ? 3 : undefined}>
          {incident.description}
        </Text>

        <View style={styles.footer}>
          <View style={[styles.status, { backgroundColor: confirmed ? 'rgba(52,211,153,0.15)' : colors.surface2 }]}>
            <Text style={[styles.statusText, { color: confirmed ? colors.ok : colors.muted }]}>
              {confirmed ? `✓ Confirmado por ${incident.confirmations} vecinos` : 'Sin confirmar'}
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
              <Text style={styles.mine}>Tu aviso</Text>
            )
          ) : (
            <>
              <Pressable
                disabled={incident.confirmedByMe}
                onPress={() => {
                  confirm(incident.id);
                  tap();
                }}
                style={[styles.btn, incident.confirmedByMe && styles.btnDone]}
              >
                <Text style={[styles.btnText, incident.confirmedByMe && { color: colors.ok }]}>
                  {incident.confirmedByMe ? 'Confirmado' : 'Yo también lo vi'}
                </Text>
              </Pressable>
              <Pressable onPress={onFlag} hitSlop={8} style={styles.flag}>
                <Text style={styles.flagText}>⚑</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
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
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sevPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  sevText: { fontSize: 11, fontWeight: '700' },
  desc: { color: '#CBD2EC', fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  mine: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  btn: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnDone: { backgroundColor: 'rgba(52,211,153,0.12)' },
  btnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  flag: { padding: 4 },
  flagText: { color: colors.muted, fontSize: 16 },
});
