import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IncidentCard } from '../components/IncidentCard';
import { OpenStreetMap } from '../components/OpenStreetMap';
import { categories, categoryById } from '../data/categories';
import { CategoryId } from '../data/types';
import { haversineMeters } from '../data/places';
import { trustWeight } from '../lib/dataQuality';
import { NEARBY_RADIUS_M, getUserLocation } from '../lib/userLocation';
import { useIncidents } from '../store';
import { colors, radius } from '../theme';
import { areaName } from '../data/neighborhood';

export const HomeScreen = () => {
  const { incidents } = useIncidents();
  const [filter, setFilter] = useState<CategoryId | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'24h' | 'week' | 'month'>('week');
  const [mapFocused, setMapFocused] = useState(false);
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

  const timeframeLimitMs = useMemo(() => {
    if (timeframe === '24h') return 24 * 3_600_000;
    if (timeframe === 'week') return 7 * 24 * 3_600_000;
    return 30 * 24 * 3_600_000; // 30 días
  }, [timeframe]);

  const visible = useMemo(
    () => incidents.filter((i) => Date.now() - i.createdAt < timeframeLimitMs && !i.flaggedByMe),
    [incidents, timeframeLimitMs],
  );

  const filtered = useMemo(
    () => (filter === 'all' ? visible : visible.filter((i) => i.category === filter)),
    [visible, filter],
  );

  const selectedIncident = filtered.find((i) => i.id === selected) ?? null;

  const nearbyInPeriod = useMemo(
    () =>
      userLoc
        ? visible.filter((i) => {
            const lat = i.zone.lat ?? 0;
            const lng = i.zone.lng ?? 0;
            if (!lat && !lng) return false; // aviso heredado sin coordenadas
            return haversineMeters(userLoc, { lat, lng }) <= NEARBY_RADIUS_M;
          })
        : [],
    [visible, userLoc],
  );

  // Veracidad (TRUST.md): los avisos sin confirmar por vecinos pesan la
  // mitad: un único aviso aislado sin verificar no dispara la alerta solo.
  const score = nearbyInPeriod.reduce(
    (s, i) => s + categoryById(i.category).severity * trustWeight(i),
    0,
  );
  const periodText = timeframe === 'week' ? 'esta semana' : timeframe === 'month' ? 'este mes' : 'hoy';
  const nearText = userLoc ? areaName({ gx: 5, gy: 5, lat: userLoc.lat, lng: userLoc.lng }) : 'cerca de ti';
  const level =
    !userLoc
      ? {
          label: 'Zona desconocida',
          color: colors.muted,
          text: 'Permite la ubicación para ver la alerta de tu zona y los avisos cercanos.',
        }
      : score < 4
        ? { label: 'Tranquilo', color: colors.ok, text: `Zona en calma ${periodText} (${nearText}).` }
        : score < 9
          ? { label: 'Atención', color: colors.warn, text: `Incidencias registradas ${periodText} (${nearText}).` }
          : { label: 'Alerta vecinal', color: colors.danger, text: `Delincuencia activa en tu entorno ${periodText} (${nearText}).` };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!mapFocused}
    >
      <Text style={styles.hello}>Mapa Vecinal</Text>
      <Text style={styles.sub}>Rejilla de delincuencia e incidencias por zonas</Text>

      {/* Selector de periodo temporal */}
      <View style={styles.timeframeRow}>
        <Text style={styles.tfLabel}>Periodo:</Text>
        <View style={styles.tfPills}>
          <Pressable
            style={[styles.tfBtn, timeframe === '24h' && styles.tfBtnActive]}
            onPress={() => setTimeframe('24h')}
          >
            <Text style={[styles.tfBtnText, timeframe === '24h' && styles.tfBtnTextActive]}>24 h</Text>
          </Pressable>
          <Pressable
            style={[styles.tfBtn, timeframe === 'week' && styles.tfBtnActive]}
            onPress={() => setTimeframe('week')}
          >
            <Text style={[styles.tfBtnText, timeframe === 'week' && styles.tfBtnTextActive]}>Semana</Text>
          </Pressable>
          <Pressable
            style={[styles.tfBtn, timeframe === 'month' && styles.tfBtnActive]}
            onPress={() => setTimeframe('month')}
          >
            <Text style={[styles.tfBtnText, timeframe === 'month' && styles.tfBtnTextActive]}>Mes</Text>
          </Pressable>
        </View>
      </View>

      {/* Resumen del nivel de alerta */}
      <View style={[styles.levelCard, { borderColor: level.color + '66' }]}>
        <View style={[styles.levelDot, { backgroundColor: level.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.levelTitle, { color: level.color }]}>{level.label}</Text>
          <Text style={styles.levelText}>{level.text}</Text>
        </View>
        <View style={styles.count}>
          <Text style={styles.countNum}>{nearbyInPeriod.length}</Text>
          <Text style={styles.countLbl}>{timeframe === 'week' ? 'en 7 días' : timeframe === 'month' ? 'en 30 días' : 'en 24 h'}</Text>
        </View>
      </View>

      {/* Filtros de categoría */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Todo" active={filter === 'all'} onPress={() => setFilter('all')} />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={`${c.emoji} ${c.label}`}
            active={filter === c.id}
            onPress={() => setFilter(c.id)}
          />
        ))}
      </ScrollView>

      {/* Mapa realista OpenStreetMap con polígonos de barrios y marcadores */}
      <OpenStreetMap
        incidents={filtered}
        selectedId={selected}
        onSelect={setSelected}
        height={360}
        showNeighborhoods={true}
        onFocusMap={setMapFocused}
        userLocation={userLoc}
      />

      {/* Leyenda de delincuencia por sectores hexagonales */}
      <View style={styles.legendContainer}>
        <Text style={styles.legendTitle}>Nivel de delincuencia por sector ({timeframe === 'week' ? 'semana' : timeframe === 'month' ? 'mes' : '24h'}):</Text>
        <View style={styles.legendItems}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendLabel}>Tranquilo</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EAB308' }]} />
            <Text style={styles.legendLabel}>Moderado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F97316' }]} />
            <Text style={styles.legendLabel}>Atención</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendLabel}>Alerta</Text>
          </View>
        </View>
      </View>

      {selectedIncident ? (
        <IncidentCard incident={selectedIncident} />
      ) : (
        <Text style={styles.tip}>Toca un hexágono para ver los detalles del sector o un marcador para ver el aviso concreto.</Text>
      )}
    </ScrollView>
  );
};

const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  hello: { color: colors.text, fontSize: 30, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 14, marginTop: -10 },
  timeframeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tfLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  tfPills: {
    flexDirection: 'row',
    gap: 6,
  },
  tfBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfBtnText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  tfBtnTextActive: {
    color: '#FFFFFF',
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },
  levelDot: { width: 12, height: 12, borderRadius: 6 },
  levelTitle: { fontSize: 17, fontWeight: '800' },
  levelText: { color: colors.muted, fontSize: 13, marginTop: 2 },
  count: { alignItems: 'center' },
  countNum: { color: colors.text, fontSize: 26, fontWeight: '800' },
  countLbl: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  chips: { gap: 8, paddingRight: 20 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  legendContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  legendTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  legendItems: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  tip: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
