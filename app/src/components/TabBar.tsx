import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

export type TabId = 'map' | 'feed' | 'help';

const Icon = ({ id, color }: { id: TabId; color: string }) => {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {id === 'map' && (
        <>
          <Path d="M12 21s-7-6.2-7-11.2A7 7 0 0 1 19 9.8C19 14.8 12 21 12 21z" {...p} />
          <Circle cx="12" cy="9.8" r="2.4" {...p} />
        </>
      )}
      {id === 'feed' && (
        <>
          <Path d="M5 7h14M5 12h14M5 17h9" {...p} />
        </>
      )}
      {id === 'help' && (
        <>
          <Path d="M12 3l8 3v6c0 4.6-3.2 7.9-8 9-4.8-1.1-8-4.4-8-9V6l8-3z" {...p} />
          <Path d="M9 12l2.2 2.2L15 10.4" {...p} />
        </>
      )}
    </Svg>
  );
};

const labels: Record<TabId, string> = { map: 'Mapa', feed: 'Avisos', help: 'Ayuda' };

interface Props {
  active: TabId;
  onChange: (t: TabId) => void;
  onReport: () => void;
}

export const TabBar = ({ active, onChange, onReport }: Props) => {
  const insets = useSafeAreaInsets();
  const tab = (id: TabId) => {
    const on = active === id;
    const color = on ? colors.text : colors.muted;
    return (
      <Pressable key={id} style={styles.tab} onPress={() => onChange(id)}>
        <Icon id={id} color={color} />
        <Text style={[styles.label, { color }]}>{labels[id]}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tab('map')}
      {tab('feed')}
      <View style={styles.fabSlot}>
        <Pressable onPress={onReport} style={styles.fab}>
          <Text style={styles.fabPlus}>＋</Text>
        </Pressable>
        <Text style={[styles.label, { color: colors.primary }]}>Avisar</Text>
      </View>
      {tab('help')}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '700' },
  fabSlot: { flex: 1, alignItems: 'center', gap: 3 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabPlus: { color: '#fff', fontSize: 28, fontWeight: '600', marginTop: -2 },
});
