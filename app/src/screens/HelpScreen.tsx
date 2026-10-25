import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { useIncidents } from '../store';
import { colors, radius } from '../theme';

const numbers = [
  { n: '112', title: 'Emergencias', desc: 'Peligro inmediato, cualquier emergencia', color: colors.primary },
  { n: '091', title: 'Policía Nacional', desc: 'Denuncias e incidentes en ciudad', color: colors.accent },
  { n: '062', title: 'Guardia Civil', desc: 'Denuncias e incidentes en zona rural', color: colors.ok },
  { n: '016', title: 'Violencia de género', desc: 'Gratuito, 24 h y no deja rastro en la factura', color: colors.warn },
];

const rules = [
  ['Cuenta qué pasó, no quién', 'Nunca nombres, apodos, matrículas, teléfonos ni descripciones por origen o etnia.'],
  ['Solo lo que has visto', 'No compartas rumores. Si dudas, no publiques.'],
  ['Cero justicia por tu mano', 'Avisar no es investigar ni enfrentarse. Llama al 112.'],
  ['Todo es anónimo y temporal', 'Sin cuentas. Ubicación solo por zonas de ~450 m. Los avisos desaparecen a las 72 h.'],
];

export const HelpScreen = ({ onOpenOnboarding }: { onOpenOnboarding?: () => void }) => {
  const { reset } = useIncidents();
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(() => {});

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Ayuda y seguridad</Text>

      {onOpenOnboarding && (
        <Pressable style={styles.onboardingBtn} onPress={onOpenOnboarding}>
          <AppIcon name="shield-check" color={colors.primary} size={20} />
          <Text style={styles.onboardingBtnText}>Ver principios y privacidad de la app</Text>
        </Pressable>
      )}

      <Text style={styles.h}>Teléfonos útiles</Text>
      {numbers.map((x) => (
        <Pressable key={x.n} style={styles.num} onPress={() => call(x.n)}>
          <Text style={[styles.numBig, { color: x.color }]}>{x.n}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.numTitle}>{x.title}</Text>
            <Text style={styles.numDesc}>{x.desc}</Text>
          </View>
          <Text style={[styles.call, { backgroundColor: x.color }]}>Llamar</Text>
        </Pressable>
      ))}

      <Text style={styles.h}>Normas de la comunidad</Text>
      <View style={styles.box}>
        {rules.map(([t, d]) => (
          <View key={t} style={styles.rule}>
            <Text style={styles.ruleT}>{t}</Text>
            <Text style={styles.ruleD}>{d}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h}>Privacidad</Text>
      <View style={styles.box}>
        <Text style={styles.ruleD}>
          Alerta Vecinal no pide registro ni guarda tu identidad, tu posición exacta ni datos de terceros. No registra personas, antecedentes ni procesos judiciales: solo hechos y zonas aproximadas. Esta app no sustituye a la denuncia ante la Policía ni al 112.
        </Text>
      </View>

      <Pressable
        style={styles.privacyLink}
        onPress={() => Linking.openURL('https://github.com/MartinM10/radio-patio/blob/main/docs/LEGAL.md').catch(() => {})}
      >
        <AppIcon name="lock" color={colors.accent} size={15} />
        <Text style={styles.privacyLinkText}>Consultar Política de Privacidad y Normativa</Text>
      </Pressable>

      {__DEV__ && (
        <Pressable
          style={styles.reset}
          onPress={() =>
            Alert.alert('Restablecer demo', 'Se borrarán tus avisos y se cargarán los datos de ejemplo.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Restablecer', style: 'destructive', onPress: reset },
            ])
          }
        >
          <Text style={styles.resetText}>Restablecer datos de demostración</Text>
        </Pressable>
      )}
      <Text style={styles.ver}>
        {__DEV__
          ? 'Modo desarrollo · Datos locales'
          : 'Alerta Vecinal · v0.1.0 · Iniciativa vecinal de código abierto'}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 12 },
  num: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14 },
  numBig: { fontSize: 28, fontWeight: '900', width: 66 },
  numTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  numDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  call: { color: '#0B1020', fontWeight: '800', fontSize: 12, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, overflow: 'hidden' },
  box: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 14 },
  rule: { gap: 3 },
  ruleT: { color: colors.text, fontWeight: '800', fontSize: 14 },
  ruleD: { color: '#CBD2EC', fontSize: 13, lineHeight: 19 },
  onboardingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary + '55',
    padding: 14,
    marginBottom: 6,
  },
  onboardingBtnText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  privacyLink: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  privacyLinkText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  reset: { marginTop: 10, alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  resetText: { color: colors.muted, fontWeight: '700' },
  ver: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
