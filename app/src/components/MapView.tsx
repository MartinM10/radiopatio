import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { MapCluster } from '../lib/mapData';
import { colors } from '../theme';
import { buildMapHtml } from './mapPage';

/** Celda hexagonal que se dibuja en el mapa (la calcula lib/hexgrid). */
export interface MapHex {
  key: string;
  polygon: [number, number][];
  color: string;
  count: number;
  ids: string[];
}

export interface MapViewHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
  /** browse: ver avisos. pick: elegir una ubicación con un pin. */
  mode?: 'browse' | 'pick';
  clusters?: MapCluster[];
  hexes?: MapHex[];
  /** Avisos resaltados (los de la selección actual). */
  highlightIds?: string[];
  userLocation?: { lat: number; lng: number } | null;
  /** Pin del selector (solo pick). */
  pin?: { lat: number; lng: number } | null;
  /** Vista inicial; solo cuenta al crear el mapa (después se mueve con flyTo). */
  initialView?: { lat: number; lng: number; zoom: number };
  onSelect?: (key: string | null, ids: string[]) => void;
  onPick?: (lat: number, lng: number) => void;
  /** El mapa terminó de cargar y ya acepta órdenes. */
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** España entera; el mapa se acerca solo cuando hay ubicación o avisos. */
export const SPAIN_VIEW = { lat: 40.2, lng: -3.7, zoom: 5.6 };

const EMPTY_CLUSTERS: MapCluster[] = [];
const EMPTY_HEXES: MapHex[] = [];
const EMPTY_IDS: string[] = [];

/**
 * Mapa interactivo. El HTML se crea UNA vez; los datos le llegan por mensajes,
 * así que no se recarga ni pierde el zoom cuando cambian los avisos. Vive fuera
 * de cualquier ScrollView: no hay conflicto entre arrastrar el mapa y la página.
 */
export const MapView = forwardRef<MapViewHandle, Props>(function MapView(
  {
    mode = 'browse',
    clusters = EMPTY_CLUSTERS,
    hexes = EMPTY_HEXES,
    highlightIds = EMPTY_IDS,
    userLocation = null,
    pin = null,
    initialView = SPAIN_VIEW,
    onSelect,
    onPick,
    onReady,
    style,
  },
  ref,
) {
  // any: el tipo de ref de react-native-webview no encaja con useRef en este SDK
  const webRef = useRef<any>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const lastSent = useRef<Record<string, string>>({});

  // HTML fijo a propósito (deps vacías): cambiarlo recargaría el mapa.
  const html = useMemo(
    () => buildMapHtml({ pick: mode === 'pick', lat: initialView.lat, lng: initialView.lng, zoom: initialView.zoom }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const post = useCallback((msg: Record<string, unknown>) => {
    const json = JSON.stringify(msg);
    if (Platform.OS === 'web') {
      frameRef.current?.contentWindow?.postMessage(json, '*');
    } else {
      webRef.current?.injectJavaScript(`window.__rp && window.__rp(${json}); true;`);
    }
  }, []);

  /** Envía solo si el contenido cambió: evita trabajo y parpadeos al re-renderizar. */
  const postIfChanged = useCallback(
    (channel: string, msg: Record<string, unknown>) => {
      const json = JSON.stringify(msg);
      if (lastSent.current[channel] === json) return;
      lastSent.current[channel] = json;
      post(msg);
    },
    [post],
  );

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom = 16) => post({ type: 'view', lat, lng, zoom }),
  }), [post]);

  const handleMessage = useCallback(
    (raw: string) => {
      let m: { type?: string; key?: string | null; ids?: string[]; lat?: number; lng?: number };
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'select') onSelect?.(m.key ?? null, m.ids ?? []);
      else if (m.type === 'pick' && typeof m.lat === 'number' && typeof m.lng === 'number') onPick?.(m.lat, m.lng);
    },
    [onSelect, onPick],
  );

  // Web: el iframe habla con window.parent.postMessage.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || typeof e.data !== 'string') return;
      handleMessage(e.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMessage]);

  useEffect(() => {
    if (ready) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Estado → mapa, cuando está listo.
  useEffect(() => {
    if (ready) postIfChanged('data', { type: 'data', clusters, hexes });
  }, [ready, clusters, hexes, postIfChanged]);
  useEffect(() => {
    if (ready) postIfChanged('highlight', { type: 'highlight', ids: highlightIds });
  }, [ready, highlightIds, postIfChanged]);
  useEffect(() => {
    if (ready && userLocation) postIfChanged('user', { type: 'user', lat: userLocation.lat, lng: userLocation.lng });
  }, [ready, userLocation, postIfChanged]);
  useEffect(() => {
    if (ready && pin) postIfChanged('pin', { type: 'pin', lat: pin.lat, lng: pin.lng, fly: false });
  }, [ready, pin, postIfChanged]);

  return (
    <View style={[styles.box, style]}>
      {Platform.OS === 'web' ? (
        <iframe
          ref={frameRef}
          srcDoc={html}
          title="Mapa"
          style={{ width: '100%', height: '100%', border: 'none', flex: 1, minHeight: 0 }}
        />
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          style={styles.web}
          onMessage={(e: WebViewMessageEvent) => handleMessage(e.nativeEvent.data)}
          // Los enlaces de la atribución se abren fuera: no se navega dentro del mapa.
          onShouldStartLoadWithRequest={(req: { url: string }) => {
            if (/^https?:/i.test(req.url)) {
              Linking.openURL(req.url).catch(() => {});
              return false;
            }
            return true;
          }}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
        />
      )}
      {!ready && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: '#EAF1F6', overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1F6' },
});
