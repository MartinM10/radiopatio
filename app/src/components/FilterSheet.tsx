import * as Haptics from 'expo-haptics';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories } from '../data/categories';
import { CategoryId } from '../data/types';
import { SortMode, TIMEFRAME_LABEL, Timeframe, toggleCategory } from '../lib/filters';
import { colors, radius } from '../theme';
import { AppIcon } from './AppIcon';
import { CategoryIcon } from './CategoryIcon';

interface Props {
  visible: boolean;
  onClose: () => void;
  selected: CategoryId[];
  onChange: (next: CategoryId[]) => void;
  /** Avisos por categoría (sobre el conjunto sin filtrar por categoría). */
  counts: Partial<Record<CategoryId, number>>;
  /** Avisos que quedan con los filtros actuales: «Ver N avisos». */
  resultCount: number;
  /** Mapa: periodo. */
  timeframe?: Timeframe;
  onTimeframe?: (t: Timeframe) => void;
  /** Lista: orden. */
  sort?: SortMode;
  onSort?: (s: SortMode) => void;
}

const GROUPS: { id: 'seguridad' | 'servicios'; label: string }[] = [
  { id: 'seguridad', label: 'Seguridad y convivencia' },
  { id: 'servicios', label: 'Servicios y vía pública' },
];

const tap = () => Haptics.selectionAsync().catch(() => {});

const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
    {options.map((o) => {
      const on = o.id === value;
      return (
        <Pressable
          key={o.id}
          onPress={() => {
            tap();
            onChange(o.id);
          }}
          accessibilityRole="radio"
          accessibilityState={{ checked: on }}
          style={[styles.segItem, on && styles.segItemOn]}
        >
          <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export const FilterSheet = ({
  visible,
  onClose,
  selected,
  onChange,
  counts,
  resultCount,
  timeframe,
  onTimeframe,
  sort,
  onSort,
}: Props) => {
  const insets = useSafeAreaInsets();
  const set = new Set(selected);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar filtros" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text style={styles.title}>Filtros</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.close}>
              <AppIcon name="x" color={colors.text} size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {timeframe && onTimeframe && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Periodo</Text>
                <Segmented<Timeframe>
                  label="Periodo"
                  value={timeframe}
                  onChange={onTimeframe}
                  options={(['24h', 'week', 'month'] as Timeframe[]).map((t) => ({ id: t, label: TIMEFRAME_LABEL[t] }))}
                />
              </View>
            )}

            {sort && onSort && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ordenar por</Text>
                <Segmented<SortMode>
                  label="Ordenar por"
                  value={sort}
                  onChange={onSort}
                  options={[
                    { id: 'recent', label: 'Más recientes' },
                    { id: 'near', label: 'Más cercanos' },
                  ]}
                />
              </View>
            )}

            {GROUPS.map((g) => (
              <View key={g.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{g.label}</Text>
                <View style={styles.chips}>
                  {categories
                    .filter((c) => (c.group ?? 'general') === g.id || (g.id === 'servicios' && c.group === 'general'))
                    .map((c) => {
                      const on = set.has(c.id);
                      const n = counts[c.id] ?? 0;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => {
                            tap();
                            onChange(toggleCategory(selected, c.id));
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`${c.label}, ${n} ${n === 1 ? 'aviso' : 'avisos'}`}
                          style={({ pressed }) => [
                            styles.chip,
                            on && styles.chipOn,
                            !on && n === 0 && styles.chipEmpty,
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <CategoryIcon id={c.id} color={on ? colors.primary : colors.muted} size={16} strokeWidth={2.2} />
                          <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                            {c.label}
                          </Text>
                          <Text style={[styles.chipCount, on && { color: colors.primary }]}>{n}</Text>
                        </Pressable>
                      );
                    })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                tap();
                onChange([]);
              }}
              disabled={selected.length === 0}
              accessibilityRole="button"
              style={[styles.clear, selected.length === 0 && { opacity: 0.4 }]}
            >
              <Text style={styles.clearText}>Limpiar</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.apply, pressed && { opacity: 0.85 }]}>
              <Text style={styles.applyText}>
                {resultCount === 0 ? 'Sin avisos con estos filtros' : `Ver ${resultCount} ${resultCount === 1 ? 'aviso' : 'avisos'}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipEmpty: { opacity: 0.6 },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chipTextOn: { color: colors.text },
  chipCount: { color: colors.muted, fontSize: 12, fontWeight: '800', minWidth: 14, textAlign: 'right' },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segItemOn: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  segTextOn: { color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  clear: { paddingHorizontal: 8, paddingVertical: 12, minHeight: 48, justifyContent: 'center' },
  clearText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  apply: { flex: 1, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
