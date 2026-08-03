import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { sanitizePasswordInput } from './validators';

/**
 * Sanitiza el input de un campo de contraseña Y reporta a telemetría cuando
 * realmente eliminó algo — así confirmamos en el campo (sin adivinar) cada vez
 * que el teclado de iOS inyecta el espacio/char invisible que causaba
 * "las contraseñas no coinciden" con campos visualmente idénticos.
 *
 * Usar en el onChangeText de TODO campo de contraseña (registro, creator,
 * forgot-password, login). `screen` identifica el campo exacto.
 */
export function cleanPasswordInput(value: string, screen: string): string {
  const clean = sanitizePasswordInput(value);
  if (clean !== value) {
    analytics.capture(ANALYTICS_EVENTS.AUTH.PASSWORD_INVISIBLE_CHARS_STRIPPED, {
      screen,
      removed_count: value.length - clean.length,
    });
  }
  return clean;
}
