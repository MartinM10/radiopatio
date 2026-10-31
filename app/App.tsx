import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { IdentityProvider } from './src/components/IdentityGate';
import { OnboardingModal } from './src/components/OnboardingModal';
import { TabBar, TabId } from './src/components/TabBar';
import { FeedScreen } from './src/screens/FeedScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { IncidentDetailScreen } from './src/screens/IncidentDetailScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { IncidentsProvider } from './src/store';
import { colors } from './src/theme';

export default function App() {
  const [tab, setTab] = useState<TabId>('map');
  const [reporting, setReporting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Aviso abierto en su página de detalle (se llega desde el mapa o desde la lista).
  const [detailId, setDetailId] = useState<string | null>(null);
  // Aviso a centrar en el mapa cuando se llega desde «Ver en el mapa».
  const [mapFocus, setMapFocus] = useState<{ id: string; nonce: number } | null>(null);

  const showOnMap = useCallback((id: string) => {
    setDetailId(null);
    setMapFocus({ id, nonce: Date.now() });
    setTab('map');
  }, []);

  return (
    <SafeAreaProvider>
      <IncidentsProvider>
        <IdentityProvider>
          <StatusBar style="dark" />
          <SafeAreaView style={styles.root} edges={['top']}>
            {/* Las tres pestañas siguen montadas: el mapa conserva su posición y zoom al cambiar de pestaña. */}
            <View style={[styles.screen, tab !== 'map' && styles.hidden]}>
              <HomeScreen
                focusId={mapFocus?.id ?? null}
                focusNonce={mapFocus?.nonce ?? 0}
                onOpenIncident={setDetailId}
              />
            </View>
            <View style={[styles.screen, tab !== 'feed' && styles.hidden]}>
              <FeedScreen onOpenIncident={setDetailId} onShowOnMap={showOnMap} />
            </View>
            <View style={[styles.screen, tab !== 'help' && styles.hidden]}>
              <HelpScreen onOpenOnboarding={() => setShowOnboarding(true)} />
            </View>
            <TabBar active={tab} onChange={setTab} onReport={() => setReporting(true)} />
          </SafeAreaView>

          <Modal visible={detailId !== null} animationType="slide" onRequestClose={() => setDetailId(null)}>
            {detailId && (
              <IncidentDetailScreen incidentId={detailId} onClose={() => setDetailId(null)} onShowOnMap={showOnMap} />
            )}
          </Modal>

          <Modal visible={reporting} animationType="slide" onRequestClose={() => setReporting(false)}>
            <ReportScreen onClose={() => setReporting(false)} />
          </Modal>

          <OnboardingModal forceShow={showOnboarding} onDismiss={() => setShowOnboarding(false)} />
        </IdentityProvider>
      </IncidentsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  hidden: { display: 'none' },
});
