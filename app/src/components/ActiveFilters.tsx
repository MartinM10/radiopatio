import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryById } from '../data/categories';
import { CategoryId } from '../data/types';
import { colors, radius } from '../theme';
import { AppIcon } from './AppIcon';

/**
 * Filtros activos a la vista y quitables de uno en uno: nadie debe olvidar que
 * está viendo solo una parte de los avisos. En varias líneas, sin scroll lateral.
 */
export const ActiveFilters = ({
  selected,
  onRemove,
  onClear,
}: {
  selected: CategoryId[];
  onRemove: (id: CategoryId) => void;
  onClear: () => void;
}) => {
  if (selected.length === 0) return null;
  return (
    <View style={styles.row} accessibilityLabel="Filtros activos">
      {selected.map((id) => (
        <Pressable
          key={id}
          onPress={() => onRemove(id)}
          accessibilityRole="button"
          accessibilityLabel={`Quitar filtro ${categoryById(id).label}`}
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.text}>{categoryById(id).label}</Text>
          <AppIcon name="x" color={colors.primary} size={12} strokeWidth={2.6} />
        </Pressable>
      ))}
      {selected.length > 1 && (
        <Pressable onPress={onClear} hitSlop={6} accessibilityRole="button" style={styles.clear}>
          <Text style={styles.clearText}>Limpiar todo</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary + '66',
  },
  text: { color: colors.text, fontSize: 12, fontWeight: '700' },
  clear: { paddingHorizontal: 6, minHeight: 32, justifyContent: 'center' },
  clearText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
});
