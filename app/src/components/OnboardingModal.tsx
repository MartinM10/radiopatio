import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { AppIcon } from './AppIcon';

const STORAGE_KEY = 'av.onboarded.v1';

interface Props {
  visible?: boolean;
  onDismiss?: () => void;
  forceShow?: boolean;
}

export const OnboardingModal: React.FC<Props> = ({
  visible: controlledVisible,
  onDismiss,
  forceShow = false,
}) => {
  const insets = useSafeAreaInsets();
  const [internalVisible, setInternalVisible] = useState(false);

  useEffect(() => {
    if (forceShow) {
      setInternalVisible(true);
      return;
    }
    // Check if user already saw onboarding
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (!val) {
          setInternalVisible(true);
        }
      })
      .catch(() => {});
  }, [forceShow]);

  const isVisible = controlledVisible !== undefined ? controlledVisible : internalVisible;

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
    setInternalVisible(false);
    onDismiss?.();
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={handleComplete}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Header Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconGlow}>
                <AppIcon name="shield-check" color={colors.primary} size={42} strokeWidth={2.2} />
              </View>
            </View>

            <Text style={styles.title}>Bienvenido a Alerta Vecinal</Text>
            <Text style={styles.subtitle}>
              Información de seguridad comunitaria en tiempo real para proteger tu barrio.
            </Text>

            {/* Feature 1: No Accounts */}
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: '#4E80EE22', borderColor: '#4E80EE55' }]}>
                <AppIcon name="lock" color={colors.accent} size={22} />
              </View>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureTitle}>100% Anónimo y sin registro</Text>
                <Text style={styles.featureDesc}>
                  Sin correos, contraseñas ni números de teléfono. Nadie sabe quién eres ni recopilamos datos personales.
                </Text>
              </View>
            </View>

            {/* Feature 2: Privacy Zone */}
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: '#FF5A4F22', borderColor: '#FF5A4F55' }]}>
                <AppIcon name="map-pin" color={colors.primary} size={22} />
              </View>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureTitle}>Privacidad de tu hogar (~450 m)</Text>
                <Text style={styles.featureDesc}>
                  Tu posición exacta nunca se publica ni se guarda. Los avisos se agrupan en celdas hexagonales aproximadas.
                </Text>
              </View>
            </View>

            {/* Feature 3: Non-emergency Disclaimer */}
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: '#22C55E22', borderColor: '#22C55E55' }]}>
                <AppIcon name="shield-alert" color={colors.ok} size={22} />
              </View>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureTitle}>Colaboración, no policía (112)</Text>
                <Text style={styles.featureDesc}>
                  Los avisos se eliminan a las 72 h. No sustituye la denuncia formal. Ante peligro inmediato, llama siempre al 112.
                </Text>
              </View>
            </View>

            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                Al continuar, te comprometes a publicar únicamente hechos reales verificados y abstenerte de publicar nombres, matrículas o acusaciones directas.
              </Text>
            </View>

            <Pressable style={styles.ctaButton} onPress={handleComplete}>
              <Text style={styles.ctaText}>Entendido y comenzar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 16, 0.88)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.line,
    maxHeight: '92%',
  },
  scroll: {
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  iconGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0B1020',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '66',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0B1020',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 14,
    alignSelf: 'stretch',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextCol: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  featureDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  disclaimerBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    padding: 12,
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  disclaimerText: {
    color: '#CBD2EC',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
