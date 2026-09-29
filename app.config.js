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

/**
 * Red de seguridad del arranque.
 *
 * El 26 de septiembre el build 221 no abría: crasheaba en el arranque con
 * "Cannot make a deep link into a standalone app with no custom scheme
 * defined". La causa era expo updates.
 *
 * Cuando expo updates está activo, es él quien arranca la app, y si el update
 * que lanza no es exactamente el embebido de ese build marca isEmbeddedLaunch
 * en false. En ese caso expo-constants deja de leer el app.config embebido y
 * devuelve el manifest desnudo del update, que solo trae id, commitTime y
 * assets. Sin scheme. Expo Router llama getInitialURL al montar, expo-linking
 * no encuentra scheme, lanza un fatal de JS y el proceso aborta antes de
 * pintar la primera pantalla. No hay pantalla de error ni forma de recuperar.
 *
 * Por eso updates quedó desactivado en app.json. Estas dos comprobaciones
 * existen para que nadie lo vuelva a activar sin querer, por ejemplo corriendo
 * `eas update:configure`, que reescribe app.json y rearma la mina en silencio.
 *
 * Si algún día queremos actualizaciones por aire de verdad, hay que activarlo
 * a propósito con ATTO_ALLOW_EXPO_UPDATES=1 y, antes de eso, resolver que el
 * runtimeVersion está fijo en la versión de la app: como la versión nunca
 * cambia entre builds, un bundle viejo se considera compatible con el nativo
 * de hoy y se puede servir encima.
 */
function assertArranqueSeguro(config) {
  const updates = config.updates || {};
  const activo =
    updates.enabled !== undefined ? updates.enabled : Boolean(updates.url);

  if (activo && !process.env.ATTO_ALLOW_EXPO_UPDATES) {
    throw new Error(
      'expo updates quedó activo en la configuración. Eso rompió el arranque ' +
        'en el build 221. Déjalo en "updates": { "enabled": false } dentro de ' +
        'app.json, o si de verdad lo quieres activar, compila con ' +
        'ATTO_ALLOW_EXPO_UPDATES=1 después de leer el comentario en ' +
        'app.config.js.',
    );
  }

  if (!config.scheme) {
    throw new Error(
      'Falta "scheme" en app.json. Sin él, expo-linking lanza un fatal al ' +
        'montar Expo Router y la app no abre.',
    );
  }
}

/**
 * La extensión del Live Activity (targets/publish-activity) necesita su
 * propio perfil de firma. Con ATTO_LIVE_ACTIVITY=0 el build sale sin ella:
 * la app funciona igual (la franja del feed) y el Live Activity no aparece.
 */
function sinLiveActivity(plugins) {
  if (process.env.ATTO_LIVE_ACTIVITY !== '0') return plugins;
  return (plugins || []).filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== '@bacons/apple-targets',
  );
}

module.exports = ({ config }) => {
  const APP_BACKGROUND = readAppBackground();
  assertArranqueSeguro(config);
  return {
    ...config,
    plugins: sinLiveActivity(config.plugins),
    splash: {
      ...(config.splash || {}),
      backgroundColor: APP_BACKGROUND,
    },
  };
};
