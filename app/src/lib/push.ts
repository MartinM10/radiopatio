import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRegisterPushToken } from './api';
import { PushStatus, toPushStatus } from './pushStatus';

export type { PushStatus } from './pushStatus';

/**
 * Push nativo (Expo). En web no hay push: la bandeja de la app sigue
 * funcionando porque el servidor la guarda siempre.
 */
export const pushSupported = Platform.OS === 'android' || Platform.OS === 'ios';

let configured = false;

/** Una vez: cómo se muestran los avisos con la app abierta y el canal de Android. */
export async function configurePush(): Promise<void> {
  if (!pushSupported || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Avisos vecinales',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
    }).catch(() => {});
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported) return 'unsupported';
  return toPushStatus(await Notifications.getPermissionsAsync());
}

/**
 * Pide permiso (si hace falta) y registra el token en el servidor.
 * Con `ask: false` solo registra si el permiso ya estaba concedido.
 */
export async function registerForPush(ask: boolean): Promise<PushStatus> {
  if (!pushSupported) return 'unsupported';
  await configurePush();
  let status = await getPushStatus();
  if (status === 'undetermined' && ask) {
    const res = await Notifications.requestPermissionsAsync();
    // Tras preguntar, cualquier cosa distinta de «sí» es que no hay permiso ahora mismo.
    status = res.status === 'granted' ? 'granted' : 'denied';
  }
  if (status !== 'granted') return status;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiRegisterPushToken(data);
  } catch (e) {
    // Sin Firebase configurado (o sin red) no hay token: la bandeja sigue funcionando.
    console.warn('[push] no se pudo registrar el token:', e);
  }
  return status;
}

// v2: las builds con la v1 marcaban «ya preguntado» sin llegar a mostrar el diálogo en Android 13+.
const ASKED_KEY = 'av.push_asked.v2';

/**
 * Pide permiso de notificaciones UNA vez: tras la bienvenida, al arrancar si ya
 * la vio, o al publicar un aviso si aún no se le preguntó. Si el vecino lo
 * rechaza no se insiste por aquí; podrá activarlas desde la campana.
 */
export async function askPushOnce(): Promise<void> {
  if (!pushSupported) return;
  try {
    if ((await AsyncStorage.getItem(ASKED_KEY)) === '1') return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    await registerForPush(true);
  } catch {
    // Pedir permiso nunca debe romper la publicación.
  }
}
