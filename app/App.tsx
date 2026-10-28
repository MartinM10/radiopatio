import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { IdentityProvider } from './src/components/IdentityGate';
import { OnboardingModal } from './src/components/OnboardingModal';
import { TabBar, TabId } from './src/components/TabBar';
import { FeedScreen } from './src/screens/FeedScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { IncidentsProvider } from './src/store';
import { colors } from './src/theme';

export default function App() {
  const [tab, setTab] = useState<TabId>('map');
  const [reporting, setReporting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <SafeAreaProvider>
      <IncidentsProvider>
        <IdentityProvider>
          <StatusBar style="dark" />
          <SafeAreaView style={styles.root} edges={['top']}>
            <View style={{ flex: 1 }}>
              {tab === 'map' && <HomeScreen />}
              {tab === 'feed' && <FeedScreen />}
              {tab === 'help' && <HelpScreen onOpenOnboarding={() => setShowOnboarding(true)} />}
            </View>
            <TabBar active={tab} onChange={setTab} onReport={() => setReporting(true)} />
          </SafeAreaView>

          <Modal visible={reporting} animationType="slide" onRequestClose={() => setReporting(false)}>
            <ReportScreen onClose={() => setReporting(false)} />
          </Modal>

          <OnboardingModal
            forceShow={showOnboarding}
            onDismiss={() => setShowOnboarding(false)}
          />
        </IdentityProvider>
      </IncidentsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
