import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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

  return (
    <SafeAreaProvider>
      <IncidentsProvider>
        <StatusBar style="light" />
        <SafeAreaView style={styles.root} edges={['top']}>
          <View style={{ flex: 1 }}>
            {tab === 'map' && <HomeScreen />}
            {tab === 'feed' && <FeedScreen />}
            {tab === 'help' && <HelpScreen />}
          </View>
          <TabBar active={tab} onChange={setTab} onReport={() => setReporting(true)} />
        </SafeAreaView>

        <Modal visible={reporting} animationType="slide" onRequestClose={() => setReporting(false)}>
          <ReportScreen onClose={() => setReporting(false)} />
        </Modal>
      </IncidentsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
