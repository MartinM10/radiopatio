import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDeviceVerified } from '../lib/api';
import { isGoogleSignInAvailable, signInWithGoogle } from '../lib/googleAuth';
import { colors, radius } from '../theme';
import { AppIcon } from './AppIcon';

interface IdentityContext {
  /**
   * Resuelve `true` si el usuario puede escribir (publicar, confirmar,
   * denunciar). Si aún no ha verificado su identidad, muestra la hoja de
   * inicio de sesión y espera a que termine.
   */
  requireIdentity: () => Promise<boolean>;
}

const Ctx = createContext<IdentityContext | null>(null);

export const IdentityProvider = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const finish = (ok: boolean) => {
    setVisible(false);
    setBusy(false);
    setError(null);
    pending.current?.(ok);
    pending.current = null;
  };

  const requireIdentity = useCallback(async () => {
    if (await isDeviceVerified()) return true;
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setError(null);
      setVisible(true);
    });
  }, []);

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    if (result.ok) return finish(true);
    setBusy(false);
    if (!result.cancelled) setError(result.message ?? 'No se pudo iniciar sesión.');
  };

  return (
    <Ctx.Provider value={{ requireIdentity }}>
      {children}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => {
          if (!busy) finish(false);
        }}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.iconGlow}>
              <AppIcon name="shield-check" color={colors.accent} size={34} />
            </View>
            <Text style={styles.title}>Verifica que eres un vecino real</Text>
            <Text style={styles.body}>
              Para publicar o valorar avisos te pedimos una cuenta de Google una sola vez. Así evitamos avisos falsos
              y que alguien manipule lo que se dice de tu barrio.
            </Text>

            <View style={styles.points}>
              <Point text="Nadie verá quién publica: ni otros vecinos ni los moderadores." />
              <Point text="No guardamos tu nombre, tu email ni tu foto." />
              <Point text="Para ver el mapa y los avisos no necesitas cuenta." />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={onGoogle}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Continuar con Google</Text>}
            </Pressable>
            <Pressable onPress={() => finish(false)} disabled={busy} hitSlop={8} style={styles.later}>
              <Text style={styles.laterText}>Ahora no</Text>
            </Pressable>
            {/* Expo Go no incluye el módulo nativo de Google: solo en desarrollo
                se permite seguir con la identidad anónima para probar la app. */}
            {__DEV__ && !isGoogleSignInAvailable() && (
              <Pressable onPress={() => finish(true)} disabled={busy} hitSlop={8}>
                <Text style={styles.devSkip}>Continuar sin verificar (solo desarrollo)</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
};

const Point = ({ text }: { text: string }) => (
  <View style={styles.point}>
    <AppIcon name="check" color={colors.ok} size={16} />
    <Text style={styles.pointText}>{text}</Text>
  </View>
);

export const useIdentity = (): IdentityContext => {
  const v = useContext(Ctx);
  if (!v) throw new Error('IdentityProvider missing');
  return v;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 24,
    gap: 14,
    alignItems: 'center',
  },
  iconGlow: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(79,70,229,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  points: {
    alignSelf: 'stretch',
    gap: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 14,
  },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pointText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  cta: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  later: { paddingVertical: 6 },
  laterText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  devSkip: { color: colors.warn, fontSize: 12, fontWeight: '700' },
});
