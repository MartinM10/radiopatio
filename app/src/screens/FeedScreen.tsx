import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { IncidentCard } from '../components/IncidentCard';
import { categories } from '../data/categories';
import { haversineMeters } from '../data/places';
import { CategoryId } from '../data/types';
import { isActive } from '../lib/privacy';
import { NEARBY_RADIUS_M, getUserLocation } from '../lib/userLocation';
import { useIncidents } from '../store';
import { colors, radius } from '../theme';

type Mode = 'all' | 'near' | 'mine';
type Sort = 'recent' | 'near';

export const FeedScreen = ({ onShowOnMap }: { onShowOnMap?: (id: string) => void }) => {
  const { incidents, refresh, ready } = useIncidents();
  const [mode, setMode] = useState<Mode>('all');
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUserLocation().then((loc) => {
      if (!cancelled && loc) setUserLoc(loc);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSort = (next: Sort) => {
    setSort(next);
    Haptics.selectionAsync().catch(() => {});
    if (next === 'near' && !userLoc) {
      getUserLocation(true).then((loc) => {
        if (loc) setUserLoc(loc);
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const list = useMemo(() => {
    let l = incidents.filter((i) => isActive(i.createdAt) && !i.flaggedByMe);

    // Modo de cercanía o autor
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

    // Filtro por categoría
    if (catFilter !== 'all') {
      l = l.filter((i) => i.category === catFilter);
    }

    // Búsqueda por texto libre
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      l = l.filter(
        (i) =>
          i.description.toLowerCase().includes(q) ||
          (i.zone.address && i.zone.address.toLowerCase().includes(q)),
      );
    }

    if (sort === 'near' && userLoc) {
      // Más cercanos primero (los avisos sin coordenadas, al final); a igual distancia, el más reciente.
      const dist = (i: (typeof l)[number]) =>
        i.zone.lat != null && i.zone.lng != null
          ? haversineMeters(userLoc, { lat: i.zone.lat, lng: i.zone.lng })
          : Number.POSITIVE_INFINITY;
      return l.sort((a, b) => dist(a) - dist(b) || b.createdAt - a.createdAt);
    }
    return l.sort((a, b) => b.createdAt - a.createdAt);
  }, [incidents, mode, catFilter, search, userLoc, sort]);

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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Avisos</Text>
            <Text style={styles.badgeCount}>{list.length}</Text>
          </View>

          {/* Buscador */}
          <View style={styles.searchBar}>
            <AppIcon name="search" color={colors.muted} size={18} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar en el barrio (calle, suceso...)"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={8}
                style={styles.clearBtn}
                accessibilityRole="button"
                accessibilityLabel="Borrar búsqueda"
              >
                <AppIcon name="x" color={colors.muted} size={14} />
              </Pressable>
            )}
          </View>

          {/* Segmented control: Todos / Cerca de mí / Míos */}
          <View style={styles.seg}>
            {tabs.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  setMode(t.id);
                  Haptics.selectionAsync().catch(() => {});
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === t.id }}
                style={({ pressed }) => [
                  styles.segItem,
                  mode === t.id && styles.segOn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[styles.segText, mode === t.id && { color: '#fff' }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Orden de la lista */}
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Ordenar por</Text>
            {(
              [
                ['recent', 'Más recientes'],
                ['near', 'Más cercanos'],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => onSort(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === id }}
                style={({ pressed }) => [styles.chip, sort === id && styles.chipOn, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.chipText, sort === id && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {sort === 'near' && !userLoc && (
            <Text style={styles.sortHint}>Activa la ubicación para ordenar por cercanía.</Text>
          )}

          {/* Carrusel de chips de categoría */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <Pressable
              onPress={() => {
                setCatFilter('all');
                Haptics.selectionAsync().catch(() => {});
              }}
              style={({ pressed }) => [
                styles.chip,
                catFilter === 'all' && styles.chipOn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <CategoryIcon id="all" color={catFilter === 'all' ? '#fff' : colors.muted} size={14} />
              <Text style={[styles.chipText, catFilter === 'all' && { color: '#fff' }]}>Todas</Text>
            </Pressable>
            {categories.map((c) => {
              const active = catFilter === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setCatFilter(c.id);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipOn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <CategoryIcon id={c.id} color={active ? '#fff' : colors.muted} size={14} />
                  <Text style={[styles.chipText, active && { color: '#fff' }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        !ready ? (
          <View style={{ gap: 12, marginTop: 10 }}>
            {[1, 2, 3].map((k) => (
              <View key={k} style={styles.skeletonCard}>
                <View style={styles.skeletonHeader}>
                  <View style={styles.skeletonIcon} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={styles.skeletonLineShort} />
                    <View style={styles.skeletonLineTiny} />
                  </View>
                </View>
                <View style={styles.skeletonLineLong} />
                <View style={styles.skeletonLineMedium} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View
              style={[
                styles.emptyIconCircle,
                {
                  backgroundColor:
                    search.length > 0
                      ? 'rgba(251,191,36,0.12)'
                      : mode === 'near' && !userLoc
                        ? 'rgba(91,140,255,0.12)'
                        : 'rgba(52,211,153,0.12)',
                },
              ]}
            >
              <AppIcon
                name={
                  search.length > 0
                    ? 'search'
                    : mode === 'near' && !userLoc
                      ? 'map-pin'
                      : 'shield-check'
                }
                color={
                  search.length > 0
                    ? colors.warn
                    : mode === 'near' && !userLoc
                      ? colors.accent
                      : colors.ok
                }
                size={34}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {search.length > 0
                ? 'Sin resultados'
                : mode === 'mine'
                  ? 'Sin avisos publicados'
                  : mode === 'near' && !userLoc
                    ? 'Ubicación desactivada'
                    : 'Zona en calma'}
            </Text>
            <Text style={styles.emptyText}>
              {search.length > 0
                ? `No encontramos avisos que coincidan con «${search}». Prueba con otro término.`
                : mode === 'mine'
                  ? 'Los avisos anónimos que publiques se gestionarán desde aquí.'
                  : mode === 'near' && !userLoc
                    ? 'Permite la ubicación para ver las incidencias registradas en tu entorno inmediato.'
                    : 'No hay alertas activas en esta categoría durante las últimas 72 horas.'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => <IncidentCard incident={item} onShowOnMap={onShowOnMap} />}
    />
  );
};

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 50 },
  header: { gap: 12, marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  badgeCount: {
    backgroundColor: colors.surface2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    padding: 0,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.primary },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sortHint: { color: colors.muted, fontSize: 12, marginTop: -4 },
  chipsScroll: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 20,
    gap: 10,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
    opacity: 0.65,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  skeletonLineShort: {
    width: '45%',
    height: 14,
    borderRadius: 6,
    backgroundColor: colors.surface2,
  },
  skeletonLineTiny: {
    width: '25%',
    height: 10,
    borderRadius: 4,
    backgroundColor: colors.surface2,
  },
  skeletonLineLong: {
    width: '90%',
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface2,
  },
  skeletonLineMedium: {
    width: '65%',
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface2,
  },
});
