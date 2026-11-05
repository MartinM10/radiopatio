export type PushStatus = 'unsupported' | 'granted' | 'denied' | 'undetermined';

/**
 * Traduce la respuesta de permisos de Expo a lo que la app necesita saber.
 *
 * En Android 13+, expo-notifications devuelve `denied` también cuando el permiso
 * NUNCA se ha pedido, porque el sistema tiene las notificaciones desactivadas
 * hasta entonces. Lo que distingue «aún podemos preguntar» de «bloqueado» es
 * `canAskAgain`, así que el `status` por sí solo no sirve para decidir.
 */
export function toPushStatus(permission: { status: string; canAskAgain: boolean }): PushStatus {
  if (permission.status === 'granted') return 'granted';
  return permission.canAskAgain ? 'undetermined' : 'denied';
}
