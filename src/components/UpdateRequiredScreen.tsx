/**
 * La puerta de actualización: cuando se cruza, la app entera deja de pintarse.
 *
 * Se cruza por dos motivos distintos, y es una sola puerta a propósito:
 *
 *  1. El backend respondió 426 a alguna petición. Es reactivo y no se puede
 *     anticipar, pero es infalible: si el servidor ya no habla con este
 *     binario, seguir pintando la app solo lleva a más errores.
 *  2. El admin fijó un build mínimo desde el dashboard. Es el que David pidió
 *     el 27 de septiembre de 2026: decidir desde fuera, sin esperar a que algo
 *     se rompa, que una versión vieja ya no se puede usar.
 *
 * El destino del botón es TestFlight mientras la app no esté publicada, y se
 * puede cambiar desde el dashboard para que el día que esté en la App Store no
 * haga falta un build nuevo.
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { isClientOutdated, onClientOutdated } from '@/lib/api/client';
import { APP_BACKGROUND } from '@/constants/theme';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';
import { getCachedAppLogoUri } from '@/features/feed/hooks/useAppLogo';
import {
  APP_BUILD,
  useReleaseGate,
  type UpdateCopy,
} from '@/features/updates/useRequiredBuild';

const MARCA = require('../../assets/splash-wordmark.png');

/** TestFlight mientras la app viva ahí; la web abre si no está instalado. */
const DESTINO_POR_DEFECTO = Platform.select({
  ios: 'itms-beta://',
  android: 'market://details?id=com.attosound.app',
  default: 'https://testflight.apple.com/',
}) as string;

const SALIDA = Platform.select({
  ios: 'https://testflight.apple.com/',
  default: 'https://play.google.com/store/apps/details?id=com.attosound.app',
}) as string;

export function UpdateRequiredGate({ children }: { children: React.ReactNode }) {
  const [rechazadoPorElServidor, setRechazado] = useState(isClientOutdated());
  const { bloqueado, copy } = useReleaseGate();

  useEffect(() => onClientOutdated(() => setRechazado(true)), []);

  if (!rechazadoPorElServidor && !bloqueado) return <>{children}</>;
  return (
    <UpdateRequiredScreen copy={copy} motivo={bloqueado ? 'min_build' : 'server_426'} />
  );
}

function UpdateRequiredScreen({
  copy,
  motivo,
}: {
  copy: UpdateCopy | null;
  motivo: 'min_build' | 'server_426';
}) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const logo = getCachedAppLogoUri();

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.UPDATE_GATE_SHOWN, {
      app_build: APP_BUILD,
      reason: motivo,
    });
  }, [motivo]);

  const abrir = useCallback(() => {
    void haptic('medium');
    const url = copy?.url?.trim() || DESTINO_POR_DEFECTO;
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.UPDATE_GATE_OPENED, {
      app_build: APP_BUILD,
      reason: motivo,
      destination: url,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(SALIDA).catch(() => null);
    });
  }, [copy?.url, motivo]);

  const titulo =
    copy?.title?.trim() || t('update.title', { defaultValue: 'Time to update' });
  const mensaje =
    copy?.message?.trim() ||
    t('update.message', {
      defaultValue:
        'This version is no longer supported. Get the latest one to keep using ATTO.',
    });
  const boton = copy?.button?.trim() || t('update.button', { defaultValue: 'Update' });

  return (
    <View
      style={[
        styles.fondo,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <View style={styles.centro}>
        <Image
          source={logo ? { uri: logo } : MARCA}
          style={styles.marca}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.titulo} maxFontSizeMultiplier={1.2}>
          {titulo as string}
        </Text>
        <Text style={styles.mensaje} maxFontSizeMultiplier={1.2}>
          {mensaje as string}
        </Text>
      </View>

      <View style={styles.pie}>
        <Pressable
          style={({ pressed }) => [styles.boton, pressed && styles.botonPulsado]}
          onPress={abrir}
          accessibilityRole="button"
          accessibilityLabel={boton as string}
        >
          <Text style={styles.botonTexto} maxFontSizeMultiplier={1.1}>
            {boton as string}
          </Text>
        </Pressable>

        {/* El número ayuda a soporte cuando alguien escribe diciendo que no
            puede entrar; a quien no lo necesita no le estorba. */}
        <Text style={styles.build} maxFontSizeMultiplier={1.0}>
          {t('update.build', { defaultValue: 'Build' }) as string} {APP_BUILD || '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: APP_BACKGROUND,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  marca: {
    width: 132,
    height: 132,
    marginBottom: 14,
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Archivo_600SemiBold',
    textAlign: 'center',
  },
  mensaje: {
    color: '#9A9AA0',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Archivo_400Regular',
    textAlign: 'center',
    maxWidth: 320,
  },
  pie: {
    alignItems: 'center',
    gap: 16,
  },
  boton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 100,
    paddingVertical: 17,
    width: '100%',
    alignItems: 'center',
  },
  botonPulsado: {
    opacity: 0.85,
  },
  botonTexto: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
  },
  build: {
    color: '#4A4A50',
    fontSize: 12,
    fontFamily: 'Archivo_400Regular',
  },
});
