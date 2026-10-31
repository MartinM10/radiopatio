import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiReverseGeocode } from '../lib/api';
import { getUserLocation } from '../lib/userLocation';
import { colors, radius } from '../theme';
import { AppIcon } from './AppIcon';
import { MapView, MapViewHandle } from './MapView';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Ubicación marcada y la calle sugerida para ella (null si no se pudo obtener). */
  onConfirm: (point: { lat: number; lng: number }, suggestion: string | null) => void;
  /** Punto ya marcado antes (al volver a abrir para cambiarlo). */
  initial?: { lat: number; lng: number } | null;
  /** Dónde abrir el mapa si no hay punto previo ni ubicación (p. ej. donde ya hay avisos). */
  fallback?: { lat: number; lng: number } | null;
}

/**
 * Selector de ubicación a pantalla completa. El mapa no vive dentro de una
 * pantalla desplazable, así que arrastrarlo nunca compite con el scroll.
 */
export const LocationPicker = ({ visible, onClose, onConfirm, initial = null, fallback = null }: Props) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapViewHandle>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingStreet, setLoadingStreet] = useState(false);
  const [locating, setLocating] = useState(false);
  const started = useRef(false);

  // Cada vez que se abre, parte del punto anterior (si lo hay).
  useEffect(() => {
    if (visible) {
      setPin(initial);
      setSuggestion(null);
      started.current = false;
    }
  }, [visible, initial]);

  // Al abrir: si ya había punto, ir a él; si no, a la ubicación del vecino (si la concedió).
  const onMapReady = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    if (initial) {
      mapRef.current?.flyTo(initial.lat, initial.lng, 17);
      return;
    }
    const loc = await getUserLocation();
    if (loc) mapRef.current?.flyTo(loc.lat, loc.lng, 15);
    else if (fallback) mapRef.current?.flyTo(fallback.lat, fallback.lng, 13);
  }, [initial, fallback]);

  // Calle sugerida para el pin (la consulta la hace el servidor).
  useEffect(() => {
    if (!visible || !pin) return;
    let cancelled = false;
    setLoadingStreet(true);
    const t = setTimeout(async () => {
      const s = await apiReverseGeocode(pin.lat, pin.lng);
      if (cancelled) return;
      setSuggestion(s?.label ?? null);
      setLoadingStreet(false);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [visible, pin]);

  const locate = async () => {
    Haptics.selectionAsync().catch(() => {});
    setLocating(true);
    const loc = await getUserLocation(true);
    setLocating(false);
    if (!loc) {
      Alert.alert('No se pudo obtener tu ubicación', 'Activa la ubicación del móvil o toca el mapa para marcar el lugar a mano.');
      return;
    }
    setPin(loc);
    mapRef.current?.flyTo(loc.lat, loc.lng, 17);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancelar" style={styles.hBtn}>
            <AppIcon name="x" color={colors.text} size={18} />
          </Pressable>
          <Text style={styles.title}>¿Dónde ocurrió?</Text>
          <Pressable onPress={locate} disabled={locating} hitSlop={10} accessibilityRole="button" accessibilityLabel="Usar mi ubicación" style={styles.hBtn}>
            {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <AppIcon name="locate" color={colors.text} size={20} />}
          </Pressable>
        </View>

        <Text style={styles.hint}>{pin ? 'Arrastra el marcador o toca otro punto para moverlo.' : 'Toca el mapa para marcar el lugar del aviso.'}</Text>

        <MapView
          ref={mapRef}
          mode="pick"
          style={styles.map}
          pin={pin}
          onPick={(lat, lng) => setPin({ lat, lng })}
          onReady={onMapReady}
        />

        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.street}>
            <AppIcon name="map-pin" color={pin ? colors.accent : colors.muted} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.streetMain, !pin && { color: colors.muted }]} numberOfLines={1}>
                {!pin ? 'Aún no has marcado ningún punto' : suggestion ?? (loadingStreet ? 'Buscando la calle…' : 'Sin calle sugerida')}
              </Text>
              <Text style={styles.streetSub}>
                {pin ? 'La zona se muestra aproximada (~450 m). La calle podrás cambiarla después.' : 'Tu posición exacta nunca se publica.'}
              </Text>
            </View>
            {pin && loadingStreet && <ActivityIndicator size="small" color={colors.muted} />}
          </View>
          <Pressable
            disabled={!pin}
            onPress={() => pin && onConfirm(pin, suggestion)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, !pin && styles.ctaOff, pin && pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaText}>Confirmar ubicación</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  hBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  map: { flex: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  panel: { paddingHorizontal: 16, paddingTop: 12, gap: 12, backgroundColor: colors.bg },
  street: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streetMain: { color: colors.text, fontSize: 15, fontWeight: '800' },
  streetSub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  cta: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
