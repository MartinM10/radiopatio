import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/AppIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { OpenStreetMap } from '../components/OpenStreetMap';
import { categories, categoryById } from '../data/categories';
import { areaName } from '../data/neighborhood';
import { CategoryId, Zone } from '../data/types';
import { checkText } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor } from '../theme';

const MIN = 10;
const MAX = 280;

export const ReportScreen = ({ onClose }: { onClose: () => void }) => {
  const insets = useSafeAreaInsets();
  const { incidents, addIncident } = useIncidents();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [text, setText] = useState('');
  const [ack, setAck] = useState(false);
  const [mapFocused, setMapFocused] = useState(false);

  const problem = text.length >= 3 ? checkText(text) : null;
  const canSend = !!cat && !!zone && text.trim().length >= MIN && !problem && ack;

  const send = () => {
    if (!canSend || !cat || !zone) return;
    addIncident({ category: cat, zone, description: text });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStep(3);
  };

  const back = () => (step === 2 ? setStep(1) : onClose());

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={styles.hBtn}>
          <Text style={styles.hBtnText}>{step === 2 ? '‹' : '✕'}</Text>
        </Pressable>
        <Text style={styles.hTitle}>{step === 3 ? 'Aviso publicado' : 'Nuevo aviso'}</Text>
        <Text style={styles.hStep}>{step < 3 ? `${step}/2` : ''}</Text>
      </View>

      {step === 1 && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.urgent} onPress={() => Linking.openURL('tel:112').catch(() => {})}>
            <View style={styles.urgentIconWrap}>
              <AppIcon name="shield-alert" color={colors.primary} size={26} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.urgentTitle}>¿Peligro ahora mismo?</Text>
              <Text style={styles.urgentText}>Llama al 112. Esta app no avisa a la policía.</Text>
            </View>
            <Text style={styles.urgentCall}>Llamar</Text>
          </Pressable>

          <Text style={styles.q}>¿Qué ha ocurrido?</Text>
          <View style={styles.grid}>
            {categories.map((c) => {
              const isSelected = cat === c.id;
              const col = isSelected ? colors.primary : severityColor[c.severity];
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setCat(c.id);
                    Haptics.selectionAsync().catch(() => {});
                    setStep(2);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Categoría ${c.label}`}
                  style={({ pressed }) => [
                    styles.tile,
                    isSelected && { borderColor: colors.primary, backgroundColor: colors.surface },
                    pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <View style={[styles.tileIconWrap, { backgroundColor: isSelected ? colors.primarySoft : '#0B1020' }]}>
                    <CategoryIcon id={c.id} color={col} size={26} />
                  </View>
                  <Text style={styles.tileTitle}>{c.label}</Text>
                  <Text style={styles.tileHint}>{c.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {step === 2 && cat && (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!mapFocused}
        >
          <View style={styles.selCat}>
            <CategoryIcon id={cat} color={colors.primary} size={20} />
            <Text style={styles.selCatText}>{categoryById(cat).label}</Text>
          </View>

          <Text style={styles.q}>¿Dónde ocurrió? <Text style={styles.qSub}>(calle o zona)</Text></Text>
          <OpenStreetMap
            incidents={incidents.filter((i) => !i.flaggedByMe)}
            pickMode
            picked={zone}
            onPick={setZone}
            height={290}
            onFocusMap={setMapFocused}
          />
          {zone && (
            <View style={styles.zoneRow}>
              <AppIcon name="map-pin" color={colors.accent} size={15} />
              <Text style={styles.zoneText}>
                {zone.address || areaName(zone)} · aproximada (~450m)
              </Text>
            </View>
          )}

          <Text style={styles.q}>Cuéntalo en pocas palabras</Text>
          <TextInput
            value={text}
            onChangeText={(t) => setText(t.slice(0, MAX))}
            placeholder="Ej.: Han forzado varios coches en el tramo final de la calle…"
            placeholderTextColor={colors.muted}
            multiline
            style={[styles.input, problem ? { borderColor: colors.danger } : null]}
          />
          <View style={styles.inputFoot}>
            <View style={styles.errRow}>
              {problem ? (
                <AppIcon name="alert-triangle" color={colors.danger} size={14} />
              ) : text.length > 0 && text.trim().length < MIN ? (
                <AppIcon name="info" color={colors.warn} size={14} />
              ) : text.trim().length >= MIN ? (
                <AppIcon name="check" color={colors.ok} size={14} />
              ) : null}
              <Text style={[styles.err, !problem && { color: text.trim().length >= MIN ? colors.ok : colors.muted }]}>
                {problem ??
                  (text.length > 0 && text.trim().length < MIN
                    ? `Mínimo ${MIN} caracteres (faltan ${MIN - text.trim().length})`
                    : 'Cuenta qué pasó, no quién. Sin nombres, matrículas ni teléfonos.')}
              </Text>
            </View>
            <Text style={[styles.count, text.length >= 260 && { color: colors.warn }]}>{text.length}/{MAX}</Text>
          </View>

          <Pressable style={styles.ackRow} onPress={() => setAck(!ack)}>
            <View style={[styles.check, ack && styles.checkOn]}>
              {ack && <AppIcon name="check" color="#fff" size={14} />}
            </View>
            <Text style={styles.ackText}>
              Lo que cuento es cierto y no identifica a ninguna persona. Entiendo que esto no es una denuncia formal.
            </Text>
          </Pressable>

          <Pressable
            disabled={!canSend}
            onPress={send}
            accessibilityRole="button"
            accessibilityLabel="Publicar aviso anónimo"
            style={({ pressed }) => [
              styles.cta,
              !canSend && styles.ctaOff,
              canSend && pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={styles.ctaText}>Publicar aviso anónimo</Text>
          </Pressable>
          {!zone && <Text style={styles.needs}>Marca la zona en el mapa para continuar.</Text>}
        </ScrollView>
      )}

      {step === 3 && cat && (
        <View style={[styles.content, { alignItems: 'center', paddingTop: 30 }]}>
          <View style={[styles.okCircle, { borderColor: colors.ok }]}>
            <AppIcon name="shield-check" color={colors.ok} size={50} />
          </View>
          <Text style={styles.okTitle}>¡Gracias por avisar a tus vecinos!</Text>
          <View style={styles.selCat}>
            <CategoryIcon id={cat} color={severityColor[categoryById(cat).severity]} size={18} />
            <Text style={styles.selCatText}>{categoryById(cat).label}</Text>
          </View>
          <Text style={styles.okText}>
            Tu aviso es anónimo y estará visible 72 horas para mantener informada a la comunidad. Aparecerá como «sin confirmar» hasta que otros vecinos lo verifiquen.
          </Text>
          <View style={styles.legal}>
            <Text style={styles.legalText}>
              Para denunciar formalmente con validez judicial, contacta con Policía Nacional (091) o Guardia Civil (062).
            </Text>
          </View>
          <Pressable style={styles.cta} onPress={onClose}>
            <Text style={styles.ctaText}>Volver al mapa</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  hBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hBtnText: { color: colors.text, fontSize: 20, fontWeight: '600' },
  hTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800' },
  hStep: { width: 40, textAlign: 'right', color: colors.muted, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 50, gap: 14 },
  urgent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary + '66',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
  },
  urgentIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0B1020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  urgentText: { color: colors.muted, fontSize: 12, marginTop: 2 },
  urgentCall: { color: '#fff', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, fontWeight: '800', overflow: 'hidden' },
  q: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 },
  qSub: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47.8%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  tileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  tileHint: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  selCat: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.line },
  selCatText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  zoneText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  input: {
    minHeight: 110,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: 14,
    fontSize: 15,
    lineHeight: 21,
  },
  inputFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -6 },
  errRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  err: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  count: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  ackRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  ackText: { flex: 1, color: '#CBD2EC', fontSize: 13, lineHeight: 19 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', alignSelf: 'stretch' },
  ctaOff: { opacity: 0.35 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  needs: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  okCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginBottom: 8 },
  okTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  okText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  legal: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginVertical: 6, borderWidth: 1, borderColor: colors.line },
  legalText: { color: '#CBD2EC', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
