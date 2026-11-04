import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRegisterPushToken } from './api';

/**
 * Push nativo (Expo). En web no hay push: la bandeja de la app sigue
 * funcionando porque el servidor la guarda siempre.
 */
export type PushStatus = 'unsupported' | 'granted' | 'denied' | 'undetermined';

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
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Pide permiso (si hace falta) y registra el token en el servidor.
 * Con `ask: false` solo registra si el permiso ya estaba concedido.
 */
export async function registerForPush(ask: boolean): Promise<PushStatus> {
  if (!pushSupported) return 'unsupported';
  await configurePush();
  let status = await getPushStatus();
  if (status !== 'granted' && ask && status !== 'denied') {
    const res = await Notifications.requestPermissionsAsync();
    status = res.status === 'granted' ? 'granted' : res.status === 'denied' ? 'denied' : 'undetermined';
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

const ASKED_KEY = 'av.push_asked.v1';

/**
 * Pide permiso de notificaciones UNA vez, en un momento con contexto (al
 * publicar el primer aviso: «te avisaremos si lo confirman»). Si el vecino lo
 * rechaza no se insiste; podrá activarlas desde la campana.
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
