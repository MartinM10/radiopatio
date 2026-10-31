import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActiveFilters } from '../components/ActiveFilters';
import { AppIcon } from '../components/AppIcon';
import { FilterSheet } from '../components/FilterSheet';
import { IncidentCard } from '../components/IncidentCard';
import { haversineMeters } from '../data/places';
import { CategoryId } from '../data/types';
import {
  SortMode,
  countByCategory,
  distanceTo,
  filterByCategories,
  formatDistance,
  sortIncidents,
  toggleCategory,
} from '../lib/filters';
import { isActive } from '../lib/privacy';
import { NEARBY_RADIUS_M, getUserLocation } from '../lib/userLocation';
import { useIncidents } from '../store';
import { colors, radius } from '../theme';

type Mode = 'all' | 'near' | 'mine';

interface Props {
  onOpenIncident: (id: string) => void;
  onShowOnMap: (id: string) => void;
}

export const FeedScreen = ({ onOpenIncident, onShowOnMap }: Props) => {
  const { incidents, refresh, ready } = useIncidents();
  const [mode, setMode] = useState<Mode>('all');
  const [cats, setCats] = useState<CategoryId[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  /** «Más cercanos» necesita la ubicación: se pide al elegirlo y, si no se concede, se avisa. */
  const onSort = async (next: SortMode) => {
    setSort(next);
    if (next === 'near' && !userLoc) {
      const loc = await getUserLocation(true);
      if (loc) setUserLoc(loc);
      else {
        setSort('recent');
        Alert.alert('Ubicación desactivada', 'Permite la ubicación en los ajustes del móvil para ordenar los avisos por cercanía.');
      }
    }
  };

  // Base de la lista (modo y búsqueda), antes de filtrar por categoría: de ahí salen los contadores.
  const base = useMemo(() => {
    let l = incidents.filter((i) => isActive(i.createdAt) && !i.flaggedByMe);
    if (mode === 'near') {
      l = userLoc
        ? l.filter((i) => i.zone.lat != null && i.zone.lng != null && haversineMeters(userLoc, { lat: i.zone.lat, lng: i.zone.lng }) <= NEARBY_RADIUS_M)
        : [];
    }
    if (mode === 'mine') l = l.filter((i) => i.mine);
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      l = l.filter((i) => i.description.toLowerCase().includes(q) || (i.zone.address ?? '').toLowerCase().includes(q));
    }
    return l;
  }, [incidents, mode, search, userLoc]);

  const counts = useMemo(() => countByCategory(base), [base]);
  const list = useMemo(
    () => sortIncidents(filterByCategories(base, cats), sort, userLoc),
    [base, cats, sort, userLoc],
  );

  const tabs: { id: Mode; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'near', label: 'Cerca de mí' },
    { id: 'mine', label: 'Míos' },
  ];

  const sortLabel = sort === 'near' && userLoc ? 'Más cercanos primero' : 'Más recientes primero';

  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Avisos</Text>
              <Text style={styles.badgeCount}>{list.length}</Text>
            </View>

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
                <Pressable onPress={() => setSearch('')} hitSlop={8} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
                  <AppIcon name="x" color={colors.muted} size={14} />
                </Pressable>
              )}
            </View>

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
                  style={({ pressed }) => [styles.segItem, mode === t.id && styles.segOn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={[styles.segText, mode === t.id && { color: '#fff' }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.toolRow}>
              <Pressable
                onPress={() => setFiltersOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={cats.length > 0 ? `Filtros, ${cats.length} activos` : 'Filtros'}
                style={({ pressed }) => [styles.filterBtn, cats.length > 0 && styles.filterBtnOn, pressed && { opacity: 0.85 }]}
              >
                <AppIcon name="filter" color={cats.length > 0 ? '#fff' : colors.text} size={18} />
                <Text style={[styles.filterText, cats.length > 0 && { color: '#fff' }]}>
                  {cats.length > 0 ? `Filtros · ${cats.length}` : 'Filtros'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setFiltersOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Orden: ${sortLabel}. Cambiar`} style={styles.sortCaption}>
                <Text style={styles.sortText}>{sortLabel}</Text>
                <AppIcon name="chevron-down" color={colors.muted} size={14} />
              </Pressable>
            </View>

            <ActiveFilters selected={cats} onRemove={(id) => setCats((c) => toggleCategory(c, id))} onClear={() => setCats([])} />
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
                      search.length > 0 || cats.length > 0
                        ? 'rgba(251,191,36,0.12)'
                        : mode === 'near' && !userLoc
                          ? 'rgba(91,140,255,0.12)'
                          : 'rgba(52,211,153,0.12)',
                  },
                ]}
              >
                <AppIcon
                  name={search.length > 0 || cats.length > 0 ? 'search' : mode === 'near' && !userLoc ? 'map-pin' : 'shield-check'}
                  color={search.length > 0 || cats.length > 0 ? colors.warn : mode === 'near' && !userLoc ? colors.accent : colors.ok}
                  size={34}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {search.length > 0 || cats.length > 0
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
                  : cats.length > 0
                    ? 'No hay avisos con los filtros elegidos en las últimas 72 horas.'
                    : mode === 'mine'
                      ? 'Los avisos anónimos que publiques se gestionarán desde aquí.'
                      : mode === 'near' && !userLoc
                        ? 'Permite la ubicación para ver las incidencias registradas en tu entorno inmediato.'
                        : 'No hay alertas activas durante las últimas 72 horas.'}
              </Text>
              {cats.length > 0 && (
                <Pressable onPress={() => setCats([])} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.emptyAction}>Quitar filtros</Text>
                </Pressable>
              )}
            </View>
          )
        }
        renderItem={({ item }) => (
          <IncidentCard
            incident={item}
            onOpen={onOpenIncident}
            onShowOnMap={onShowOnMap}
            distanceText={sort === 'near' && userLoc ? formatDistance(distanceTo(item, userLoc)) : null}
          />
        )}
      />

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        selected={cats}
        onChange={setCats}
        counts={counts}
        resultCount={list.length}
        sort={sort}
        onSort={onSort}
      />
    </>
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
    overflow: 'hidden',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  clearBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.line },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.primary },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  sortCaption: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, justifyContent: 'flex-end' },
  sortText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
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
  emptyIconCircle: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  emptyAction: { color: colors.accent, fontSize: 14, fontWeight: '800', marginTop: 4 },
  skeletonCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12, opacity: 0.65 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonIcon: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  skeletonLineShort: { width: '45%', height: 14, borderRadius: 6, backgroundColor: colors.surface2 },
  skeletonLineTiny: { width: '25%', height: 10, borderRadius: 4, backgroundColor: colors.surface2 },
  skeletonLineLong: { width: '90%', height: 12, borderRadius: 6, backgroundColor: colors.surface2 },
  skeletonLineMedium: { width: '65%', height: 12, borderRadius: 6, backgroundColor: colors.surface2 },
});
