import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { categoryById } from '../data/categories';
import { Incident, Zone } from '../data/types';
import { buildHexGridForIncidents } from '../lib/hexgrid';
import { colors, radius, severityColor } from '../theme';

interface Props {
  incidents?: Incident[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  pickMode?: boolean;
  picked?: Zone | null;
  onPick?: (zone: Zone) => void;
  height?: number;
  showNeighborhoods?: boolean;
  onFocusMap?: (active: boolean) => void;
  /** Ubicación del vecino (consentida) para centrar el mapa donde está. */
  userLocation?: { lat: number; lng: number } | null;
}

const DEFAULT_CENTER = { lat: 40.2, lng: -3.7 }; // Centro geográfico aproximado de España

export const OpenStreetMap: React.FC<Props> = ({
  incidents = [],
  selectedId,
  onSelect,
  pickMode = false,
  picked,
  onPick,
  height = 360,
  showNeighborhoods = true,
  onFocusMap,
  userLocation = null,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState(true);

  // Calcular rejilla hexagonal universal (H3 style) de criminalidad para cualquier ciudad
  const hexCells = useMemo(() => {
    return buildHexGridForIncidents(incidents, true);
  }, [incidents]);

  // Determinar centro inicial: elegido > vecino > última incidencia > España
  const initialCenter = useMemo(() => {
    if (picked?.lat && picked?.lng) {
      return { lat: picked.lat, lng: picked.lng };
    }
    if (userLocation) {
      return { lat: userLocation.lat, lng: userLocation.lng };
    }
    if (incidents.length > 0 && incidents[0].zone?.lat && incidents[0].zone?.lng) {
      return { lat: incidents[0].zone.lat, lng: incidents[0].zone.lng };
    }
    return DEFAULT_CENTER;
  }, [picked, incidents, userLocation]);

  const handleGpsLocation = async () => {
    try {
      setLoadingGps(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso de ubicación',
          'Puedes colocar el marcador tocando directamente en el mapa en la zona donde viste el suceso.',
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = Number(loc.coords.latitude.toFixed(5));
      const lng = Number(loc.coords.longitude.toFixed(5));

      // Mover el mapa en Leaflet
      const script = `
        if (window.map) {
          window.map.flyTo([${lat}, ${lng}], 16);
          if (window.setPickMarker) {
            window.setPickMarker(${lat}, ${lng});
          }
        }
      `;
      webViewRef.current?.injectJavaScript(script);

      // Notificar al componente padre
      if (onPick) {
        onPick({
          gx: 5,
          gy: 5,
          lat,
          lng,
          address: `Ubicación GPS [${lat.toFixed(4)}, ${lng.toFixed(4)}]`,
        });
      }
    } catch (err) {
      console.warn('Error al obtener ubicación GPS:', err);
      Alert.alert('Aviso', 'No se pudo obtener la ubicación GPS actual. Puedes marcar la zona tocando el mapa.');
    } finally {
      setLoadingGps(false);
    }
  };

  // Al arrancar, centra en el vecino SOLO si ya concedió el permiso de
  // ubicación (sin diálogos sorpresa): una app nacional abre donde estás tú.
  useEffect(() => {
    if (!mapReady || pickMode) return;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        webViewRef.current?.injectJavaScript(
          `if (window.map) { window.map.flyTo([${lat}, ${lng}], 13); } true;`,
        );
      } catch {
        // sin ubicación: se mantiene la vista por defecto
      }
    })();
  }, [mapReady, pickMode]);

  // Generar HTML interactivo con Leaflet + OpenStreetMap + Rejilla Hexagonal H3
  const leafletHtml = useMemo(() => {
    const markersData = incidents.map((inc) => {
      const cat = categoryById(inc.category);
      const color = severityColor[cat.severity] || colors.warn;
      const lat = inc.zone.lat ?? DEFAULT_CENTER.lat + (inc.zone.gy - 5) * 0.0025;
      const lng = inc.zone.lng ?? DEFAULT_CENTER.lng + (inc.zone.gx - 5) * 0.0035;

      return {
        id: inc.id,
        lat,
        lng,
        emoji: cat.emoji,
        label: cat.label,
        desc: inc.description.replace(/"/g, "'"),
        color,
        confirmations: inc.confirmations,
      };
    });

    const initialPickLat = picked?.lat ?? initialCenter.lat;
    const initialPickLng = picked?.lng ?? initialCenter.lng;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #0B1020;
      touch-action: none;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      overflow: hidden;
    }
    .custom-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #141D35;
      border: 3px solid #ff4757;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      font-size: 19px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .custom-pin:active, .custom-pin.selected {
      transform: scale(1.25);
    }
    .pick-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #E53935;
      border: 3px solid #FFFFFF;
      box-shadow: 0 6px 16px rgba(229, 57, 53, 0.6);
      font-size: 24px;
      cursor: grab;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.7); }
      70% { box-shadow: 0 0 0 14px rgba(229, 57, 53, 0); }
      100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
    }
    .leaflet-popup-content-wrapper {
      background: #141D35;
      color: #EAF0FF;
      border: 1px solid #233054;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-popup-tip {
      background: #141D35;
    }
    .popup-title {
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .popup-desc {
      font-size: 12px;
      color: #94A3B8;
      line-height: 1.4;
    }
    .hex-label {
      background: rgba(11, 16, 32, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const isPickMode = ${pickMode ? 'true' : 'false'};
    const showHexagons = ${showNeighborhoods ? 'true' : 'false'};
    const markers = ${JSON.stringify(markersData)};
    const hexagons = ${JSON.stringify(hexCells)};
    const centerLat = ${initialCenter.lat};
    const centerLng = ${initialCenter.lng};
    const initialZoom = ${pickMode ? 15 : incidents.some((i) => i.zone?.lat ?? i.zone?.lng) ? 13 : 5.6};

    const map = L.map('map', {
      zoomControl: true,
      attributionControl: true,
      dragging: true,
      touchZoom: true,
      tap: false,
      bounceAtZoomLimits: false
    }).setView([centerLat, centerLng], initialZoom);

    window.map = map;

    // Capa de mapa real OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    function sendToNative(data) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } else if (window.parent) {
        window.parent.postMessage(JSON.stringify(data), '*');
      }
    }

    // Notificar toques para evitar que el scroll vertical de la página robe los gestos
    document.addEventListener('touchstart', function() {
      sendToNative({ type: 'TOUCH_START' });
    }, { passive: true });

    document.addEventListener('touchend', function() {
      sendToNative({ type: 'TOUCH_END' });
    }, { passive: true });

    document.addEventListener('touchcancel', function() {
      sendToNative({ type: 'TOUCH_END' });
    }, { passive: true });

    // Dibujar rejilla hexagonal universal coloreada por nivel de delincuencia
    if (showHexagons && !isPickMode) {
      hexagons.forEach(h => {
        const poly = L.polygon(h.polygon, {
          color: h.color,
          fillColor: h.color,
          fillOpacity: h.incidentCount > 0 ? 0.26 : 0.08,
          weight: h.incidentCount > 0 ? 2 : 1,
          dashArray: h.incidentCount === 0 ? '3, 4' : null
        }).addTo(map);

        poly.bindPopup(
          '<div class="popup-title">⬡ ' + h.name + '</div>' +
          '<div class="popup-desc">' +
          '<strong>Nivel de alerta:</strong> <span style="color:' + h.color + '; font-weight:800">' + h.levelLabel.toUpperCase() + '</span><br/>' +
          '<strong>Avisos en el sector:</strong> ' + h.incidentCount + '<br/>' +
          '<strong>Gravedad acumulada:</strong> ' + h.severityScore + ' pts' +
          '</div>'
        );

        if (h.incidentCount > 0) {
          const labelIcon = L.divIcon({
            className: 'hex-label-wrap',
            html: '<div class="hex-label" style="border-left: 3px solid ' + h.color + '">' + h.name + ' (' + h.incidentCount + ')</div>',
            iconSize: [120, 20],
            iconAnchor: [60, 10]
          });
          L.marker(h.center, { icon: labelIcon, interactive: false }).addTo(map);
        }
      });
    }

    if (!isPickMode) {
      // Modo Visualización: añadir marcadores de avisos
      markers.forEach(m => {
        const icon = L.divIcon({
          className: 'custom-pin-wrap',
          html: '<div class="custom-pin" style="border-color:' + m.color + '">' + m.emoji + '</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });

        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        
        marker.bindPopup(
          '<div class="popup-title">' + m.emoji + ' ' + m.label + '</div>' +
          '<div class="popup-desc">' + m.desc + '</div>'
        );

        marker.on('click', () => {
          sendToNative({ type: 'SELECT_INCIDENT', id: m.id });
        });
      });
    } else {
      // Modo Selección: Marcador arrastrable para fijar la ubicación exacta
      let pickMarker = null;

      function createPickMarker(lat, lng) {
        if (pickMarker) {
          pickMarker.setLatLng([lat, lng]);
          return;
        }

        const pickIcon = L.divIcon({
          className: 'pick-pin-wrap',
          html: '<div class="pick-pin">📍</div>',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        pickMarker = L.marker([lat, lng], {
          icon: pickIcon,
          draggable: true
        }).addTo(map);

        pickMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          notifyLocation(pos.lat, pos.lng);
        });
      }

      function notifyLocation(lat, lng) {
        const fixedLat = parseFloat(lat.toFixed(5));
        const fixedLng = parseFloat(lng.toFixed(5));
        sendToNative({
          type: 'PICK_LOCATION',
          lat: fixedLat,
          lng: fixedLng
        });
      }

      window.setPickMarker = function(lat, lng) {
        createPickMarker(lat, lng);
      };

      // Si ya hay un punto marcado, colocarlo
      ${picked?.lat && picked?.lng ? `createPickMarker(${initialPickLat}, ${initialPickLng});` : `createPickMarker(centerLat, centerLng); notifyLocation(centerLat, centerLng);`}

      // Permitir hacer clic o tocar en cualquier calle para mover el marcador
      map.on('click', (e) => {
        createPickMarker(e.latlng.lat, e.latlng.lng);
        notifyLocation(e.latlng.lat, e.latlng.lng);
      });
    }

    sendToNative({ type: 'MAP_READY' });
  </script>
</body>
</html>
    `;
  }, [incidents, pickMode, showNeighborhoods, hexCells, initialCenter, picked]);

  const onMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        setMapReady(true);
      } else if (data.type === 'TOUCH_START') {
        onFocusMap?.(true);
      } else if (data.type === 'TOUCH_END') {
        onFocusMap?.(false);
      } else if (data.type === 'SELECT_INCIDENT' && onSelect) {
        onSelect(data.id);
      } else if (data.type === 'PICK_LOCATION' && onPick) {
        const lat = data.lat;
        const lng = data.lng;

        // Geocodificación inversa ligera con OpenStreetMap Nominatim
        let address = `Zona [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
            {
              headers: { 'User-Agent': 'RadioPatioApp/1.0' },
            },
          );
          if (res.ok) {
            const geo = await res.json();
            const addr = geo.address;
            if (addr) {
              const street = addr.road || addr.pedestrian || addr.suburb || '';
              const city = addr.city || addr.town || addr.village || '';
              if (street) {
                address = `${street}${city ? ', ' + city : ''}`;
              }
            }
          }
        } catch {
          // Fallback a coordenadas
        }

        onPick({
          gx: 5,
          gy: 5,
          lat,
          lng,
          address,
        });
      }
    } catch (err) {
      console.warn('Error parsing WebView message:', err);
    }
  };

  return (
    <View
      style={[styles.container, { height }, interactiveMode && styles.containerActive]}
      onTouchStart={() => {
        if (interactiveMode) onFocusMap?.(true);
      }}
      onTouchEnd={() => onFocusMap?.(false)}
      onTouchCancel={() => onFocusMap?.(false)}
    >
      {Platform.OS === 'web' ? (
        // Soporte Web
        <iframe
          srcDoc={leafletHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: radius.lg,
            pointerEvents: interactiveMode ? 'auto' : 'none',
          }}
          title="OpenStreetMap"
        />
      ) : (
        // Soporte Nativo Android / iOS con WebView optimizado para gestos táctiles
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: leafletHtml }}
          style={styles.webview}
          pointerEvents={interactiveMode ? 'auto' : 'none'}
          onMessage={onMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          nestedScrollEnabled={true}
          scrollEnabled={false}
          overScrollMode="never"
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        />
      )}

      {/* Control flotante para alternar entre explorar el mapa con el dedo o hacer scroll por la página */}
      <View style={styles.topRightControls}>
        <Pressable
          style={[styles.modeBtn, interactiveMode && styles.modeBtnActive]}
          onPress={() => {
            const next = !interactiveMode;
            setInteractiveMode(next);
            if (!next) {
              onFocusMap?.(false);
            }
          }}
        >
          <Text style={styles.modeBtnText}>
            {interactiveMode ? '✋ Mover mapa' : '🔒 Bloqueado'}
          </Text>
        </Pressable>
      </View>

      {pickMode && (
        <View style={styles.pickBar}>
          <Pressable
            style={[styles.gpsBtn, loadingGps && { opacity: 0.7 }]}
            onPress={handleGpsLocation}
            disabled={loadingGps}
          >
            {loadingGps ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.gpsBtnText}>📍 Mi ubicación (GPS)</Text>
            )}
          </Pressable>
          <Text style={styles.hintText}>Toca y arrastra el marcador al lugar del suceso</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0B1020',
    borderWidth: 1,
    borderColor: colors.line,
    position: 'relative',
  },
  containerActive: {
    borderColor: colors.accent,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0B1020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRightControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  },
  modeBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modeBtnActive: {
    backgroundColor: '#1E293B',
    borderColor: colors.accent,
  },
  modeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  pickBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 80,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    pointerEvents: 'box-none',
  },
  gpsBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  gpsBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  hintText: {
    fontSize: 10,
    color: '#CBD5E1',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    fontWeight: '600',
  },
});
