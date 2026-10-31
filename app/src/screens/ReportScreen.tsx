import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useIdentity } from '../components/IdentityGate';
import { LocationPicker } from '../components/LocationPicker';
import { categories, categoryById } from '../data/categories';
import { CategoryId, Zone } from '../data/types';
import { MAX_ADDRESS, sanitizeAddress } from '../lib/address';
import { apiReverseGeocode } from '../lib/api';
import { getUserLocation } from '../lib/userLocation';
import { checkText } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor } from '../theme';

const MIN = 10;
const MAX = 280;

export const ReportScreen = ({ onClose }: { onClose: () => void }) => {
  const insets = useSafeAreaInsets();
  const { incidents, addIncident } = useIncidents();
  const { requireIdentity } = useIdentity();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeTab, setActiveTab] = useState<'all' | 'seguridad' | 'servicios'>('all');
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [text, setText] = useState('');
  const [ack, setAck] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  // Calle (opcional): llega sugerida a partir del pin y el vecino puede
  // corregirla, escribirla a mano o borrarla.
  const [street, setStreet] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const streetTouched = useRef(false);

  const displayedCategories = useMemo(() => {
    if (activeTab === 'all') return categories;
    return categories.filter((c) => (c.group ?? 'general') === activeTab || (activeTab === 'servicios' && c.group === 'general'));
  }, [activeTab]);

  const applyPoint = (point: { lat: number; lng: number }, suggestion: string | null) => {
    setZone({ gx: 5, gy: 5, lat: point.lat, lng: point.lng });
    // Lo que el vecino haya escrito o corregido a mano no se pisa.
    if (!streetTouched.current) setStreet(suggestion ?? '');
  };

  const onPicked = (point: { lat: number; lng: number }, suggestion: string | null) => {
    applyPoint(point, suggestion);
    setPickerOpen(false);
    Haptics.selectionAsync().catch(() => {});
  };

  /** Atajo: usa la ubicación del móvil sin pasar por el mapa. Sin permiso, abre el mapa. */
  const fromMyLocation = async () => {
    setLocating(true);
    const loc = await getUserLocation(true);
    if (!loc) {
      setLocating(false);
      setPickerOpen(true);
      return;
    }
    setSuggesting(true);
    const s = await apiReverseGeocode(loc.lat, loc.lng);
    applyPoint(loc, s?.label ?? null);
    setSuggesting(false);
    setLocating(false);
  };

  const problem = text.length >= 3 ? checkText(text) : null;
  const streetProblem = street.length >= 3 ? checkText(street) : null;
  const canSend = !!cat && !!zone && text.trim().length >= MIN && !problem && !streetProblem && ack;

  const send = async () => {
    if (!canSend || !cat || !zone) return;
    // Publicar exige identidad verificada (se pide una sola vez).
    if (!(await requireIdentity())) return;
    addIncident({ category: cat, zone: { ...zone, address: sanitizeAddress(street) || undefined }, description: text });
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

          <View style={styles.groupFilterRow}>
            <Pressable
              onPress={() => {
                setActiveTab('all');
                Haptics.selectionAsync().catch(() => {});
              }}
              style={[styles.groupFilterPill, activeTab === 'all' && styles.groupFilterPillActive]}
            >
              <Text style={[styles.groupFilterText, activeTab === 'all' && styles.groupFilterTextActive]}>
                Todos ({categories.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActiveTab('seguridad');
                Haptics.selectionAsync().catch(() => {});
              }}
              style={[styles.groupFilterPill, activeTab === 'seguridad' && styles.groupFilterPillActive]}
            >
              <Text style={[styles.groupFilterText, activeTab === 'seguridad' && styles.groupFilterTextActive]}>
                🛡️ Seguridad (7)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActiveTab('servicios');
                Haptics.selectionAsync().catch(() => {});
              }}
              style={[styles.groupFilterPill, activeTab === 'servicios' && styles.groupFilterPillActive]}
            >
              <Text style={[styles.groupFilterText, activeTab === 'servicios' && styles.groupFilterTextActive]}>
                ⚡ Servicios y Vía (7)
              </Text>
            </Pressable>
          </View>

          <View style={styles.grid}>
            {displayedCategories.map((c) => {
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
                  <View style={[styles.tileIconWrap, { backgroundColor: isSelected ? colors.primarySoft : colors.surface2 }]}>
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
        >
          <View style={styles.selCat}>
            <CategoryIcon id={cat} color={colors.primary} size={20} />
            <Text style={styles.selCatText}>{categoryById(cat).label}</Text>
          </View>

          <Text style={styles.q}>¿Dónde ocurrió?</Text>
          {!zone ? (
            <View style={styles.locCard}>
              <Text style={styles.locText}>Marca el lugar en el mapa. La zona se mostrará aproximada (~450 m); tu posición exacta nunca se publica.</Text>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.locPrimary, pressed && { opacity: 0.85 }]}
              >
                <AppIcon name="map-pin" color="#fff" size={18} />
                <Text style={styles.locPrimaryText}>Marcar en el mapa</Text>
              </Pressable>
              <Pressable
                onPress={fromMyLocation}
                disabled={locating}
                accessibilityRole="button"
                style={({ pressed }) => [styles.locSecondary, pressed && { opacity: 0.85 }]}
              >
                {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <AppIcon name="locate" color={colors.text} size={18} />}
                <Text style={styles.locSecondaryText}>Usar mi ubicación</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.streetBox}>
              <View style={styles.locDone}>
                <AppIcon name="check" color={colors.ok} size={16} strokeWidth={2.6} />
                <Text style={styles.locDoneText}>Ubicación marcada · zona aproximada (~450 m)</Text>
                <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cambiar la ubicación">
                  <Text style={styles.locChange}>Cambiar</Text>
                </Pressable>
              </View>
              <Text style={styles.streetLabel}>Calle (opcional)</Text>
              <View style={styles.streetInputRow}>
                <TextInput
                  value={street}
                  onChangeText={(t) => {
                    streetTouched.current = true;
                    setStreet(t.slice(0, MAX_ADDRESS));
                  }}
                  placeholder="Ej.: Calle Mayor"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  accessibilityLabel="Calle donde ocurrió, opcional"
                  style={[styles.streetInput, streetProblem ? { borderColor: colors.danger } : null]}
                />
                {suggesting && <ActivityIndicator size="small" color={colors.muted} />}
              </View>
              <Text style={[styles.streetHint, streetProblem ? { color: colors.danger } : null]}>
                {streetProblem ??
                  'Sugerida a partir del punto: corrígela si no es exacta o bórrala si prefieres no indicarla. Sin número de portal.'}
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

      <LocationPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={onPicked}
        initial={zone?.lat != null && zone?.lng != null ? { lat: zone.lat, lng: zone.lng } : null}
        fallback={(() => {
          const z = incidents.find((i) => i.zone.lat != null && i.zone.lng != null)?.zone;
          return z?.lat != null && z?.lng != null ? { lat: z.lat, lng: z.lng } : null;
        })()}
      />
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  urgentText: { color: colors.muted, fontSize: 12, marginTop: 2 },
  urgentCall: { color: '#fff', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, fontWeight: '800', overflow: 'hidden' },
  q: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 },
  qSub: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  groupFilterRow: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  groupFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  groupFilterPillActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  groupFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  groupFilterTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
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
  locCard: { gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16 },
  locText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  locPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.primary },
  locPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  locSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  locSecondaryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  locDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locDoneText: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '600' },
  locChange: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  streetLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  streetBox: { gap: 8 },
  streetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streetInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  streetHint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
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
  ackText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', alignSelf: 'stretch' },
  ctaOff: { opacity: 0.35 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  needs: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  okCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginBottom: 8 },
  okTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  okText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  legal: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginVertical: 6, borderWidth: 1, borderColor: colors.line },
  legalText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
