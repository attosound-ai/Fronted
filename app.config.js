// @ts-check
/**
 * Config dinámica de Expo.
 *
 * `app.json` sigue siendo la fuente estática de la configuración: Expo la
 * carga primero y la pasa aquí como `config`. Esta función SOLO sobrescribe
 * el color de fondo del splash nativo para que coincida con el fondo de la
 * app (negro mate), atándolo a la MISMA constante `APP_BACKGROUND` que usa
 * todo el JS (definida en `src/constants/theme.ts`).
 *
 * Así, cambiar `APP_BACKGROUND` en theme.ts re-tiñe tanto las pantallas RN
 * como el splash nativo, sin tener que tocar este archivo ni app.json.
 */
const fs = require('fs');
const path = require('path');

/** Lee APP_BACKGROUND desde theme.ts sin necesidad de transpilar TS. */
function readAppBackground() {
  const fallback = '#100e10';
  try {
    const themeSrc = fs.readFileSync(
      path.join(__dirname, 'src', 'constants', 'theme.ts'),
      'utf8',
    );
    const match = themeSrc.match(
      /APP_BACKGROUND\s*=\s*['"](#[0-9a-fA-F]{3,8})['"]/,
    );
    return match ? match[1] : fallback;
  } catch {
    return fallback;
  }
}

module.exports = ({ config }) => {
  const APP_BACKGROUND = readAppBackground();
  return {
    ...config,
    splash: {
      ...(config.splash || {}),
      backgroundColor: APP_BACKGROUND,
    },
  };
};
