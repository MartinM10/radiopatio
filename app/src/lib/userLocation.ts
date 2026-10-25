import * as Location from 'expo-location';

/**
 * Ubicación del vecino para métricas de cercanía («cerca de mí», nivel de
 * alerta). Se pide permiso con consentimiento explícito y solo se retiene la
 * coordenada en memoria mientras corre la app; no se guarda en AsyncStorage
 * ni viaja al servidor (el servidor solo la recibe al PUBLICAR, con el aviso).
 */
export interface UserLoc {
  lat: number;
  lng: number;
}

let cached: UserLoc | null = null;
let attempted = false;

export async function getUserLocation(force = false): Promise<UserLoc | null> {
  if (cached && !force) return cached;
  if (attempted && !force) return null; // ya se preguntó y no hay permiso/éxito
  attempted = true;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    cached = {
      lat: Number(pos.coords.latitude.toFixed(5)),
      lng: Number(pos.coords.longitude.toFixed(5)),
    };
    return cached;
  } catch (e) {
    console.warn('[ubicación] no disponible:', e);
    return null;
  }
}

/** Radio «cerca de mí» en las listas: 3 km. */
export const NEARBY_RADIUS_M = 3_000;
