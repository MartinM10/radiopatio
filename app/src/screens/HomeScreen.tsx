import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ActiveFilters } from '../components/ActiveFilters';
import { AppIcon } from '../components/AppIcon';
import { FilterSheet } from '../components/FilterSheet';
import { IncidentRow } from '../components/IncidentRow';
import { MapHex, MapView, MapViewHandle, SPAIN_VIEW } from '../components/MapView';
import { categoryById } from '../data/categories';
import { haversineMeters } from '../data/places';
import { CategoryId, Incident } from '../data/types';
import { trustWeight } from '../lib/dataQuality';
import {
  TIMEFRAME_PHRASE,
  Timeframe,
  countByCategory,
  filterByCategories,
  inTimeframe,
  toggleCategory,
} from '../lib/filters';
import { buildHexGridForIncidents } from '../lib/hexgrid';
import { clusterIncidents, clusterOf } from '../lib/mapData';
import { NEARBY_RADIUS_M, getUserLocation } from '../lib/userLocation';
import { useIncidents } from '../store';
import { colors, radius } from '../theme';

interface HomeProps {
  /** Aviso a centrar en el mapa (desde «Ver en el mapa»); cambia `focusNonce` en cada petición. */
  focusId?: string | null;
  focusNonce?: number;
  onOpenIncident: (id: string) => void;
}

interface Selection {
  key: string;
  ids: string[];
}

const EMPTY: string[] = [];

export const HomeScreen = ({ focusId = null, focusNonce = 0, onOpenIncident }: HomeProps) => {
  const { incidents } = useIncidents();
  const { height } = useWindowDimensions();
  const mapRef = useRef<MapViewHandle>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const [cats, setCats] = useState<CategoryId[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const centered = useRef(false);

  // Ubicación del vecino, si ya concedió el permiso (sin diálogos sorpresa más allá del primero).
  useEffect(() => {
    let cancelled = false;
    getUserLocation().then((loc) => {
      if (!cancelled && loc) setUserLoc(loc);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Datos derivados ───────────────────────────────────────────────────────
  const periodList = useMemo(
    () => incidents.filter((i) => inTimeframe(i, timeframe) && !i.flaggedByMe),
    [incidents, timeframe],
  );
  const counts = useMemo(() => countByCategory(periodList), [periodList]);
  const filtered = useMemo(() => filterByCategories(periodList, cats), [periodList, cats]);
  const clusters = useMemo(() => clusterIncidents(filtered), [filtered]);
  const hexes = useMemo<MapHex[]>(
    () =>
      buildHexGridForIncidents(filtered, true).map((h) => ({
        key: h.id,
        polygon: h.polygon,
        color: h.color,
        count: h.incidentCount,
        ids: h.incidents.map((i) => i.id),
      })),
    [filtered],
  );

  const byId = useMemo(() => new Map(filtered.map((i) => [i.id, i])), [filtered]);
  // La selección sobrevive a los refrescos, pero solo con los avisos que siguen visibles.
  const selectedIncidents = useMemo<Incident[]>(
    () => (selection ? selection.ids.map((id) => byId.get(id)).filter((i): i is Incident => !!i) : []),
    [selection, byId],
  );
  const highlightIds = selectedIncidents.length > 0 ? selectedIncidents.map((i) => i.id) : EMPTY;

  // ── Nivel de la zona ──────────────────────────────────────────────────────
  const nearby = useMemo(
    () =>
      userLoc
        ? filtered.filter((i) => {
            if (i.zone.lat == null || i.zone.lng == null) return false;
            return haversineMeters(userLoc, { lat: i.zone.lat, lng: i.zone.lng }) <= NEARBY_RADIUS_M;
          })
        : [],
    [filtered, userLoc],
  );
  // Veracidad (TRUST.md): los avisos sin confirmar pesan la mitad.
  const score = nearby.reduce((s, i) => s + categoryById(i.category).severity * trustWeight(i), 0);
  const phrase = TIMEFRAME_PHRASE[timeframe];
  const plural = (n: number) => (n === 1 ? 'aviso' : 'avisos');
  const level = !userLoc
    ? { label: 'Activa tu ubicación', color: colors.accent, text: `${filtered.length} ${plural(filtered.length)} ${phrase} en el mapa` }
    : score < 4
      ? { label: 'Tranquilo', color: colors.ok, text: `${nearby.length} ${plural(nearby.length)} ${phrase} cerca de ti` }
      : score < 9
        ? { label: 'Atención', color: colors.warn, text: `${nearby.length} ${plural(nearby.length)} ${phrase} cerca de ti` }
        : { label: 'Alerta vecinal', color: colors.danger, text: `${nearby.length} ${plural(nearby.length)} ${phrase} cerca de ti` };

  // ── Mapa: primera vista ───────────────────────────────────────────────────
  // Una sola vez: al conocer la ubicación, o (sin ella) al llegar los primeros avisos.
  useEffect(() => {
    if (centered.current || focusId) return;
    if (userLoc) {
      centered.current = true;
      mapRef.current?.flyTo(userLoc.lat, userLoc.lng, 14);
    } else if (clusters.length > 0) {
      centered.current = true;
      mapRef.current?.flyTo(clusters[0].lat, clusters[0].lng, 12);
    }
  }, [userLoc, clusters, focusId]);

  const locate = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    const loc = await getUserLocation(true);
    if (loc) {
      setUserLoc(loc);
      centered.current = true;
      mapRef.current?.flyTo(loc.lat, loc.lng, 15);
    } else {
      Alert.alert(
        'No se pudo obtener tu ubicación',
        'Comprueba que la ubicación del móvil está activada y que Radio Patio tiene permiso en los ajustes. Mientras tanto puedes mover el mapa a mano.',
      );
    }
  }, []);

  // ── Venir desde «Ver en el mapa» ──────────────────────────────────────────
  useEffect(() => {
    if (!focusId) return;
    centered.current = true;
    // El aviso debe verse: se amplía el periodo y se quitan los filtros que lo ocultarían.
    setTimeframe('month');
    setCats([]);
    setPendingFocus(focusId);
  }, [focusId, focusNonce]);

  useEffect(() => {
    if (!pendingFocus) return;
    const c = clusterOf(clusters, pendingFocus);
    if (!c) return; // aún no están los datos (o el aviso ya no existe)
    setSelection({ key: c.key, ids: c.ids });
    mapRef.current?.flyTo(c.lat, c.lng, 16);
    setPendingFocus(null);
  }, [pendingFocus, clusters]);

  const onSelect = useCallback((key: string | null, ids: string[]) => {
    if (!key || ids.length === 0) {
      setSelection(null);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setSelection({ key, ids });
  }, []);

  const filterCount = cats.length;
  const panelMax = Math.round(height * 0.3);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Mapa vecinal</Text>
            <Pressable
              onPress={userLoc ? undefined : locate}
              disabled={!!userLoc}
              accessibilityRole={userLoc ? 'text' : 'button'}
              style={styles.levelLine}
            >
              <View style={[styles.levelDot, { backgroundColor: level.color }]} />
              <Text style={[styles.levelLabel, { color: level.color }]}>{level.label}</Text>
              <Text style={styles.levelText} numberOfLines={1}>
                · {level.text}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={locate}
            accessibilityRole="button"
            accessibilityLabel="Centrar el mapa en mi ubicación"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
          >
            <AppIcon name="locate" color={colors.text} size={20} />
          </Pressable>

          <Pressable
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={filterCount > 0 ? `Filtros, ${filterCount} activos` : 'Filtros'}
            style={({ pressed }) => [styles.filterBtn, filterCount > 0 && styles.filterBtnOn, pressed && { opacity: 0.85 }]}
          >
            <AppIcon name="filter" color={filterCount > 0 ? '#fff' : colors.text} size={18} />
            <Text style={[styles.filterText, filterCount > 0 && { color: '#fff' }]}>
              {filterCount > 0 ? `Filtros · ${filterCount}` : 'Filtros'}
            </Text>
          </Pressable>
        </View>

        <ActiveFilters
          selected={cats}
          onRemove={(id) => setCats((c) => toggleCategory(c, id))}
          onClear={() => setCats([])}
        />
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        clusters={clusters}
        hexes={hexes}
        highlightIds={highlightIds}
        userLocation={userLoc}
        initialView={SPAIN_VIEW}
        onSelect={onSelect}
      />

      <View style={styles.panel}>
        {selectedIncidents.length > 0 ? (
          <>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {selectedIncidents.length === 1 ? '1 aviso en esta zona' : `${selectedIncidents.length} avisos en esta zona`}
              </Text>
              <Pressable
                onPress={() => setSelection(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cerrar la lista de avisos"
                style={styles.panelClose}
              >
                <AppIcon name="x" color={colors.muted} size={16} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: panelMax }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {selectedIncidents.map((i) => (
                <IncidentRow key={i.id} incident={i} onOpen={onOpenIncident} highlighted={i.id === focusId} />
              ))}
            </ScrollView>
          </>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {cats.length > 0 ? 'Ningún aviso con estos filtros' : `Sin avisos ${phrase}`}
            </Text>
            <Pressable
              onPress={() => {
                if (cats.length > 0) setCats([]);
                else setTimeframe('month');
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.emptyAction}>{cats.length > 0 ? 'Quitar filtros' : 'Ver el último mes'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Toca un círculo o una zona para ver sus avisos</Text>
            <View style={styles.legend}>
              {[
                ['Tranquilo', '#22C55E'],
                ['Moderado', '#EAB308'],
                ['Atención', '#F97316'],
                ['Alerta', '#EF4444'],
              ].map(([label, color]) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        selected={cats}
        onChange={setCats}
        counts={counts}
        resultCount={filtered.length}
        timeframe={timeframe}
        onTimeframe={setTimeframe}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  levelLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, minHeight: 20 },
  levelDot: { width: 9, height: 9, borderRadius: 5 },
  levelLabel: { fontSize: 13, fontWeight: '800' },
  levelText: { flex: 1, color: colors.muted, fontSize: 13 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  map: { flex: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  panel: { backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, minHeight: 64 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  panelClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8, paddingBottom: 4 },
  hint: { gap: 8, alignItems: 'center' },
  hintText: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyAction: { color: colors.accent, fontSize: 13, fontWeight: '800' },
});
