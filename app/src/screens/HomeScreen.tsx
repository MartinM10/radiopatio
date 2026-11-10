import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ActiveFilters } from '../components/ActiveFilters';
import { AppIcon } from '../components/AppIcon';
import { BellButton } from '../components/BellButton';
import { FilterSheet } from '../components/FilterSheet';
import { IncidentRow } from '../components/IncidentRow';
import { MapHex, MapView, MapViewHandle, SPAIN_VIEW } from '../components/MapView';
import { haversineMeters } from '../data/places';
import { CategoryId, Incident } from '../data/types';
import { LEVEL_INFO, levelForScore, zoneScore } from '../lib/zoneLevel';
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
import { colors, font, shadow } from '../theme';

interface HomeProps {
  /** Aviso a centrar en el mapa (desde «Ver en el mapa»); cambia `focusNonce` en cada petición. */
  focusId?: string | null;
  focusNonce?: number;
  onOpenIncident: (id: string) => void;
  onOpenNotifications: () => void;
}

interface Selection {
  key: string;
  ids: string[];
}

const EMPTY: string[] = [];

export const HomeScreen = ({ focusId = null, focusNonce = 0, onOpenIncident, onOpenNotifications }: HomeProps) => {
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
  // Nivel de la zona: gravedad × peso de los avisos de seguridad de las últimas 72 h (lib/zoneLevel.ts).
  const score = zoneScore(nearby);
  const phrase = TIMEFRAME_PHRASE[timeframe];
  const plural = (n: number) => (n === 1 ? 'aviso' : 'avisos');
  const zone = LEVEL_INFO[levelForScore(score)];
  const level = !userLoc
    ? { label: 'Activa tu ubicación', color: colors.accent, text: `${filtered.length} ${plural(filtered.length)} ${phrase} en el mapa` }
    : score < 1
      ? { label: zone.label, color: zone.color, text: 'Sin avisos de seguridad en las últimas 72 h cerca de ti' }
      : { label: zone.label, color: zone.color, text: `${nearby.length} ${plural(nearby.length)} ${phrase} cerca de ti` };

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
      <View style={styles.mapWrap}>
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

        {/* Todo flota sobre el mapa; los huecos dejan pasar los gestos. */}
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.titleRow} pointerEvents="box-none">
            <View style={styles.titleChip}>
              <Text style={styles.title} numberOfLines={1}>
                Mapa vecinal
              </Text>
            </View>
            <View style={{ flex: 1 }} pointerEvents="none" />

            <BellButton onPress={onOpenNotifications} />

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
              style={({ pressed }) => [styles.iconBtn, filterCount > 0 && styles.filterBtnOn, pressed && { opacity: 0.85 }]}
            >
              <AppIcon name="filter" color={filterCount > 0 ? '#fff' : colors.text} size={18} />
              {filterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{filterCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Nivel de la zona: las ondas del logo, del color del nivel. */}
          <Pressable
            onPress={userLoc ? undefined : locate}
            disabled={!!userLoc}
            accessibilityRole={userLoc ? 'text' : 'button'}
            accessibilityLabel={`${level.label}. ${level.text}`}
            style={styles.levelCard}
          >
            <View style={[styles.radar, { borderColor: level.color + '33' }]}>
              <View style={[styles.radarMid, { borderColor: level.color + '77' }]}>
                <View style={[styles.radarDot, { backgroundColor: level.color }]} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelLabel, { color: level.color }]}>{level.label}</Text>
              <Text style={styles.levelText} numberOfLines={2}>
                {level.text}
              </Text>
            </View>
          </Pressable>

          <ActiveFilters
            selected={cats}
            onRemove={(id) => setCats((c) => toggleCategory(c, id))}
            onClear={() => setCats([])}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.grab} />
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
  root: { flex: 1, backgroundColor: colors.surface },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  overlay: { position: 'absolute', top: 8, left: 12, right: 12, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleChip: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface, justifyContent: 'center', ...shadow.float },
  title: { color: colors.text, fontSize: 17, fontFamily: font.extra },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.float },
  filterBtnOn: { backgroundColor: colors.primary },
  filterBadge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 11, fontFamily: font.extra },
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, ...shadow.float },
  radar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radarMid: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radarDot: { width: 10, height: 10, borderRadius: 5 },
  levelLabel: { fontSize: 15, fontFamily: font.extra },
  levelText: { color: colors.muted, fontSize: 12, fontFamily: font.body, marginTop: 1 },
  // El panel se solapa con el mapa: esquinas redondeadas y sombra hacia arriba.
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -22, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, minHeight: 64, shadowColor: '#1B2559', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 10 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  panelTitle: { color: colors.text, fontSize: 15, fontFamily: font.extra },
  panelClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8, paddingBottom: 4 },
  hint: { gap: 8, alignItems: 'center' },
  hintText: { color: colors.muted, fontSize: 13, fontFamily: font.semi, textAlign: 'center' },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: colors.muted, fontSize: 11, fontFamily: font.bold },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  emptyTitle: { color: colors.text, fontSize: 14, fontFamily: font.extra },
  emptyAction: { color: colors.accent, fontSize: 13, fontFamily: font.extra },
});
