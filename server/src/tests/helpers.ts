import { identityHashFor, issueDeviceForIdentity, registerDevice } from '../lib/device';

/**
 * Identidades de test emitidas por el servidor (mismo camino que producción).
 * Cada etiqueta distinta es un dispositivo distinto; la misma etiqueta
 * reutiliza su token, como haría un móvil real.
 */
const tokens = new Map<string, string>();

export async function devHeaders(label: string): Promise<Record<string, string>> {
  let token = tokens.get(label);
  if (!token) {
    token = (await registerDevice()).token;
    tokens.set(label, token);
  }
  return { 'x-device-token': token };
}

/** Dispositivo con identidad verificada (equivale a un login con Google). */
export async function verifiedHeaders(subject: string): Promise<Record<string, string>> {
  const { token } = await issueDeviceForIdentity(identityHashFor('test', subject));
  return { 'x-device-token': token };
}
