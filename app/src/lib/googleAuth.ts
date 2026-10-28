import { apiGoogleLogin } from './api';

/**
 * Client ID WEB de OAuth (no es secreto: viaja dentro de la app). El id_token
 * de Google se emite con este `aud`, que es lo que comprueba el servidor
 * (GOOGLE_CLIENT_ID). Android se identifica aparte por paquete + SHA-1.
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '545077224643-hue02196hdeqe4g6bufm88pfj9hcs4mh.apps.googleusercontent.com';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let cached: GoogleSigninModule | null | undefined;

/**
 * El módulo es nativo: no existe en Expo Go, solo en builds de EAS (dev
 * client, APK de prueba, Play). Se carga bajo demanda para no romper Expo Go.
 */
function loadGoogleSignin(): GoogleSigninModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    mod.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

export const isGoogleSignInAvailable = (): boolean => loadGoogleSignin() !== null;

export type GoogleLoginResult = { ok: true } | { ok: false; cancelled: boolean; message?: string };

export async function signInWithGoogle(): Promise<GoogleLoginResult> {
  const mod = loadGoogleSignin();
  if (!mod) {
    return { ok: false, cancelled: false, message: 'El inicio de sesión con Google no está disponible en esta versión de la app.' };
  }
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = mod;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { ok: false, cancelled: true };

    const idToken = response.data.idToken;
    if (!idToken) {
      return { ok: false, cancelled: false, message: 'Google no devolvió un token de identidad.' };
    }
    await apiGoogleLogin(idToken);
    // La sesión de Google ya no hace falta: la identidad vive en el token del servidor.
    await GoogleSignin.signOut().catch(() => {});
    return { ok: true };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.IN_PROGRESS) return { ok: false, cancelled: true };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, cancelled: false, message: 'Necesitas Google Play Services actualizado para iniciar sesión.' };
      }
    }
    const message = err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.';
    return { ok: false, cancelled: false, message };
  }
}
