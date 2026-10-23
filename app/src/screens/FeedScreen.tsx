import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { IncidentCard } from '../components/IncidentCard';
import { haversineMeters } from '../data/places';
import { NEARBY_RADIUS_M, getUserLocation } from '../lib/userLocation';
import { isActive } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius } from '../theme';

type Mode = 'all' | 'near' | 'mine';

export const FeedScreen = () => {
  const { incidents } = useIncidents();
  const [mode, setMode] = useState<Mode>('all');
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUserLocation().then((loc) => {
      if (!cancelled && loc) setUserLoc(loc);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    let l = incidents.filter((i) => isActive(i.createdAt) && !i.flaggedByMe);
    if (mode === 'near') {
      l = userLoc
        ? l.filter((i) => {
            const lat = i.zone.lat ?? 0;
            const lng = i.zone.lng ?? 0;
            if (!lat && !lng) return false;
            return haversineMeters(userLoc, { lat, lng }) <= NEARBY_RADIUS_M;
          })
        : [];
    }
    if (mode === 'mine') l = l.filter((i) => i.mine);
    return l.sort((a, b) => b.createdAt - a.createdAt);
  }, [incidents, mode, userLoc]);

  const tabs: { id: Mode; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'near', label: 'Cerca de mí' },
    { id: 'mine', label: 'Míos' },
  ];

  return (
    <FlatList
      data={list}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <View style={{ gap: 14, marginBottom: 14 }}>
          <Text style={styles.title}>Avisos</Text>
          <View style={styles.seg}>
            {tabs.map((t) => (
              <Pressable key={t.id} onPress={() => setMode(t.id)} style={[styles.segItem, mode === t.id && styles.segOn]}>
                <Text style={[styles.segText, mode === t.id && { color: '#fff' }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={{ fontSize: 40 }}>🌙</Text>
          <Text style={styles.emptyText}>
            {mode === 'mine'
              ? 'Aún no has publicado ningún aviso.'
              : mode === 'near' && !userLoc
                ? 'Permite la ubicación para ver los avisos de tu alrededor.'
                : 'No hay avisos activos por aquí.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => <IncidentCard incident={item} />}
    />
  );
};

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.primary },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { color: colors.muted, fontSize: 14 },
});
