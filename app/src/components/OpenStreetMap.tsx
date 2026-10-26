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
import { AppIcon } from './AppIcon';

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
  const webViewRef = useRef<any>(null);
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
        category: inc.category,
        lat,
        lng,
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
      background-color: #F8FAFC;
      touch-action: none;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      overflow: hidden;
    }
    .leaflet-container {
      background: #F8FAFC !important;
    }
    .leaflet-control-attribution {
      background: rgba(255, 255, 255, 0.88) !important;
      color: #64748B !important;
      font-size: 9px !important;
      backdrop-filter: blur(4px);
      border-radius: 4px;
      padding: 2px 6px;
    }
    .leaflet-control-attribution a {
      color: #4F46E5 !important;
    }
    .leaflet-bar a {
      background-color: #FFFFFF !important;
      color: #0F172A !important;
      border-bottom: 1px solid #E2E8F0 !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    }
    .leaflet-bar a:hover {
      background-color: #F1F5F9 !important;
      color: #000000 !important;
    }
    .custom-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #FFFFFF;
      border: 2.5px solid #FF5A4F;
      box-shadow: 0 3px 12px rgba(0,0,0,0.18);
      cursor: pointer;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .custom-pin:active, .custom-pin.selected {
      transform: scale(1.3);
    }
    .pick-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #FF5A4F;
      border: 3px solid #FFFFFF;
      box-shadow: 0 0 22px rgba(255, 90, 79, 0.85);
      cursor: grab;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 90, 79, 0.7); }
      70% { box-shadow: 0 0 0 16px rgba(255, 90, 79, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 90, 79, 0); }
    }
    .leaflet-popup-content-wrapper {
      background: rgba(255, 255, 255, 0.98) !important;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      color: #0F172A !important;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 4px;
    }
    .leaflet-popup-tip {
      background: #FFFFFF !important;
      border: 1px solid #E2E8F0;
    }
    .popup-title {
      font-weight: 800;
      font-size: 14px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #0F172A;
    }
    .popup-desc {
      font-size: 12px;
      color: #475569;
      line-height: 1.45;
    }
    .hex-label {
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      color: #0F172A;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 3px 10px rgba(0,0,0,0.12);
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

    // Capa oficial de OpenStreetMap en colores naturales (sin API key, nítido y colorido)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    function getCategorySvg(catId, color) {
      const p = 'stroke="' + color + '" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"';
      switch(catId) {
        case 'hogar':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5" ' + p + '/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" ' + p + '/></svg>';
        case 'vehiculo':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 17h14a2 2 0 0 0 2-2v-4l-3-5H6L3 11v4a2 2 0 0 0 2 2z" ' + p + '/><circle cx="7.5" cy="17.5" r="2.5" ' + p + '/><circle cx="16.5" cy="17.5" r="2.5" ' + p + '/></svg>';
        case 'hurto':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="13" rx="2" ' + p + '/><path d="M8 8V6a4 4 0 0 1 8 0v2" ' + p + '/></svg>';
        case 'agresion':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" ' + p + '/><line x1="12" y1="8" x2="12" y2="13" ' + p + '/></svg>';
        case 'vandalismo':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" ' + p + '/></svg>';
        case 'sospechoso':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" ' + p + '/><circle cx="12" cy="12" r="3" ' + p + '/></svg>';
        case 'altercado':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z" ' + p + '/><path d="M16 8a5 5 0 0 1 0 8" ' + p + '/></svg>';
        case 'corte_agua':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" ' + p + '/><path d="M12 9v5" ' + p + '/></svg>';
        case 'corte_luz':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" ' + p + '/></svg>';
        case 'alumbrado':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M9 18h6" ' + p + '/><path d="M10 22h4" ' + p + '/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" ' + p + '/></svg>';
        case 'calzada':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 21L9.5 4h5L20 21" ' + p + '/><line x1="2" y1="21" x2="22" y2="21" ' + p + '/><line x1="7" y1="14" x2="17" y2="14" ' + p + '/></svg>';
        case 'limpieza':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 6h18" ' + p + '/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" ' + p + '/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" ' + p + '/></svg>';
        case 'perdido':
          return '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="14" r="4.5" ' + p + '/><circle cx="7" cy="9.5" r="2" fill="' + color + '"/><circle cx="17" cy="9.5" r="2" fill="' + color + '"/><circle cx="10" cy="5.5" r="1.8" fill="' + color + '"/><circle cx="14" cy="5.5" r="1.8" fill="' + color + '"/></svg>';
        default:
          return '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" ' + p + '/><line x1="12" y1="8" x2="12" y2="12" ' + p + '/></svg>';
      }
    }

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
          fillOpacity: h.incidentCount > 0 ? 0.28 : 0.08,
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
          html: '<div class="custom-pin" style="border-color:' + m.color + '; box-shadow: 0 0 12px ' + m.color + '55">' + getCategorySvg(m.category, m.color) + '</div>',
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        });

        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        
        marker.bindPopup(
          '<div class="popup-title">' + getCategorySvg(m.category, m.color) + '<span>' + m.label + '</span></div>' +
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
          html: '<div class="pick-pin"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>',
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
              <>
                <AppIcon name="map-pin" color="#FFFFFF" size={14} />
                <Text style={styles.gpsBtnText}>Mi ubicación (GPS)</Text>
              </>
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    position: 'relative',
  },
  containerActive: {
    borderColor: colors.primary,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAFC',
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.primary,
  },
  modeBtnText: {
    color: colors.text,
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  gpsBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  hintText: {
    fontSize: 10,
    color: colors.textMuted,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
