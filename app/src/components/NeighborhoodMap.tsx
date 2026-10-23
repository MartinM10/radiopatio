import React, { useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { categoryById } from '../data/categories';
import { GRID, YOU, zoneCenter, zoneFromPoint } from '../data/neighborhood';
import { Incident, Zone } from '../data/types';
import { freshness } from '../lib/privacy';
import { colors, radius, severityColor } from '../theme';

interface Props {
  incidents: Incident[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Modo selección de zona (pantalla de nuevo aviso). */
  pickMode?: boolean;
  picked?: Zone | null;
  onPick?: (z: Zone) => void;
  height?: number;
}

const CELL = 100 / GRID;

// Posición determinista y estable para separar avisos de una misma celda (solo visual).
const jitter = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return { dx: ((h & 7) / 7 - 0.5) * CELL * 0.5, dy: (((h >> 3) & 7) / 7 - 0.5) * CELL * 0.5 };
};

const inPark = (gx: number, gy: number) => gx >= 6 && gy >= 3 && gy < 7;
const inPlaza = (gx: number, gy: number) => gx >= 3 && gx < 6 && gy >= 3 && gy < 6;

export const NeighborhoodMap = ({ incidents, selectedId, onSelect, pickMode, picked, onPick, height = 340 }: Props) => {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const blocks = useMemo(() => {
    const out: { x: number; y: number; fill: string }[] = [];
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        const fill = inPark(gx, gy) ? '#10283A' : inPlaza(gx, gy) ? '#222B52' : '#171F3D';
        out.push({ x: gx * CELL, y: gy * CELL, fill });
      }
    }
    return out;
  }, []);

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const onPress = (e: GestureResponderEvent) => {
    if (!size.w) return;
    const x = (e.nativeEvent.locationX / size.w) * 100;
    const y = (e.nativeEvent.locationY / size.h) * 100;
    if (pickMode) {
      onPick?.(zoneFromPoint(x, y));
      return;
    }
    let best: { id: string; d: number } | null = null;
    for (const i of incidents) {
      const c = zoneCenter(i.zone);
      const j = jitter(i.id);
      const d = Math.hypot(c.x + j.dx - x, c.y + j.dy - y);
      if (d < 9 && (!best || d < best.d)) best = { id: i.id, d };
    }
    onSelect?.(best ? best.id : null);
  };

  const you = zoneCenter(YOU);
  const sorted = useMemo(() => [...incidents].sort((a, b) => a.createdAt - b.createdAt), [incidents]);

  return (
    <Pressable onPress={onPress} onLayout={onLayout} style={[styles.wrap, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          {([1, 2, 3] as const).map((s) => (
            <RadialGradient key={s} id={`h${s}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={severityColor[s]} stopOpacity="0.55" />
              <Stop offset="1" stopColor={severityColor[s]} stopOpacity="0" />
            </RadialGradient>
          ))}
          <RadialGradient id="you" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity="0.45" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="#0D1329" />
        {blocks.map((b, i) => (
          <Rect key={i} x={b.x + 0.9} y={b.y + 0.9} width={CELL - 1.8} height={CELL - 1.8} rx="1.4" fill={b.fill} />
        ))}
        {/* río */}
        <Path d="M60 33 C 72 40, 70 50, 82 56 S 92 66, 100 68" stroke="#2D5BC4" strokeWidth="2.6" strokeOpacity="0.55" fill="none" strokeLinecap="round" />
        <Path d="M60 33 C 72 40, 70 50, 82 56 S 92 66, 100 68" stroke="#7FA8FF" strokeWidth="0.5" strokeOpacity="0.5" fill="none" strokeLinecap="round" />

        {pickMode && picked && (
          <G>
            <Rect
              x={picked.gx * CELL}
              y={picked.gy * CELL}
              width={CELL}
              height={CELL}
              rx="1.6"
              fill={colors.primary}
              fillOpacity="0.28"
              stroke={colors.primary}
              strokeWidth="0.5"
              strokeDasharray="1.5 1"
            />
          </G>
        )}

        {sorted.map((i) => {
          const c = zoneCenter(i.zone);
          const j = jitter(i.id);
          const sev = categoryById(i.category).severity;
          const f = freshness(i.createdAt);
          return (
            <G key={i.id} opacity={0.35 + 0.65 * f}>
              <Circle cx={c.x + j.dx} cy={c.y + j.dy} r={6 + sev * 2.2} fill={`url(#h${sev})`} />
            </G>
          );
        })}

        <Circle cx={you.x} cy={you.y} r="7" fill="url(#you)" />
        <Circle cx={you.x} cy={you.y} r="1.9" fill={colors.accent} stroke="#fff" strokeWidth="0.7" />
      </Svg>

      {/* Marcadores con emoji (fuera del SVG para no deformarlos) */}
      {size.w > 0 &&
        !pickMode &&
        sorted.map((i) => {
          const c = zoneCenter(i.zone);
          const j = jitter(i.id);
          const cat = categoryById(i.category);
          const sel = i.id === selectedId;
          const px = ((c.x + j.dx) / 100) * size.w;
          const py = ((c.y + j.dy) / 100) * size.h;
          const d = sel ? 38 : 30;
          return (
            <View
              key={i.id}
              pointerEvents="none"
              style={[
                styles.pin,
                {
                  width: d,
                  height: d,
                  left: px - d / 2,
                  top: py - d / 2,
                  borderColor: sel ? '#fff' : severityColor[cat.severity],
                  backgroundColor: colors.surface,
                  zIndex: sel ? 5 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: sel ? 18 : 14 }}>{cat.emoji}</Text>
            </View>
          );
        })}

      {size.w > 0 && (
        <View
          pointerEvents="none"
          style={[styles.youLabel, { left: (you.x / 100) * size.w - 20, top: (you.y / 100) * size.h + 12 }]}
        >
          <Text style={styles.youText}>Tú</Text>
        </View>
      )}

      {pickMode && !picked && (
        <View pointerEvents="none" style={styles.hintWrap}>
          <Text style={styles.hint}>Toca el mapa para marcar la zona</Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#0D1329',
  },
  pin: {
    position: 'absolute',
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youLabel: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
  youText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  hintWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  hint: {
    color: colors.text,
    backgroundColor: 'rgba(11,16,32,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
