import { useEffect, useMemo, useState } from 'react';
import { Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Host, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  aspectRatio,
  background,
  clipShape,
  contentShape,
  font,
  foregroundStyle,
  frame,
  onTapGesture,
  padding,
  resizable,
  shapes,
} from '@expo/ui/swift-ui/modifiers';

import { haptic } from '@/lib/haptics/hapticService';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { useUserSearch } from '@/features/messages/hooks/useUserSearch';
import { avatarEnDisco } from './avatarCache';
import type { TaggedPerson } from '../../utils/mentions';

interface MentionSuggestionsProps {
  /** What has been typed after the "@", or an empty string right after it. */
  query: string;
  /** Not offered to themselves, the way Instagram leaves the author out. */
  selfId: string;
  onPick: (person: TaggedPerson) => void;
}

const INK = '#FFFFFF';
const SECUNDARIO = '#8E8E93';
const HUECO = '#333333';
const CARA = 38;
/**
 * Cinco, que es lo que enseña Instagram antes de que haya que desplazar. Aquí
 * además es un tope necesario: esta lista no scrollea (ver abajo), así que no
 * puede crecer hasta comerse el teclado.
 */
const MAXIMO = 5;
/**
 * El ancho de la fila, en números y no en `maxWidth`.
 *
 * Dentro de un `Host matchContents` un `maxWidth` deja la anchura propuesta sin
 * resolver, y SwiftUI reparte lo que sobra como quiere: con una fila el nombre
 * salía entero y con dos quedaba aplastado a un par de píxeles. Con la medida
 * real de la pantalla no hay nada que repartir.
 */
const ANCHO = Math.round(Dimensions.get('window').width);

/**
 * Las mismas iniciales que pinta el Avatar de la app: "john.doe" da "JD" y
 * "valeromadrid_" da "V". Se repite aquí en vez de importarse porque aquella
 * función vive dentro de un componente de React Native y esto es SwiftUI.
 */
function iniciales(texto: string): string {
  return texto
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * La lista que Instagram deja caer bajo la leyenda en cuanto escribes "@",
 * hecha con vistas nativas de SwiftUI (David, 27 de septiembre de 2026).
 *
 * Va con `Host matchContents` y un `VStack`, que es el mismo montaje que usa la
 * pantalla de ajustes y el único que funciona aquí. Con un `List` de SwiftUI la
 * lista salía en el árbol de accesibilidad pero no pintaba un solo píxel: el
 * `List` trae su propio desplazamiento y dentro de un padre de React Native que
 * no es flex se queda sin dibujar. Por eso no scrollea y por eso hay un tope de
 * cinco.
 *
 * Y el `Image` de SwiftUI no viene `resizable`, así que sin ese modificador
 * pinta el avatar a su tamaño real y el `frame` lo recorta en vez de encogerlo.
 * Mientras la cara no ha bajado, la fila enseña el círculo con las iniciales,
 * que es lo que hace el resto de la app.
 */
export function MentionSuggestions({ query, selfId, onPick }: MentionSuggestionsProps) {
  const { t } = useTranslation('feed');
  const { results, isLoading } = useUserSearch(query);

  const people = useMemo(
    () => results.filter((u) => String(u.id) !== selfId).slice(0, MAXIMO),
    [results, selfId]
  );

  // Las caras, en disco, porque SwiftUI solo pinta un archivo local y además lo
  // lee de forma síncrona: bajarlas aparte evita que escribir espere a la red.
  const [caras, setCaras] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    people.forEach((u) => {
      // Lo que guarda el usuario no es una URL sino el identificador de
      // Cloudinary, igual que en el Avatar de la app: sin pasarlo por
      // cloudinaryUrl no hay nada que descargar y la cara no aparecía nunca.
      // El preset grande, de 200, y no el pequeño de 40: el círculo mide 38
      // puntos, que a 3x son 114 píxeles, y encima el video lo amplía.
      const url = cloudinaryUrl(u.avatar, 'avatar_lg');
      if (!url || caras[url]) return;
      void avatarEnDisco(url).then((ruta) => {
        if (vivo && ruta) setCaras((previo) => ({ ...previo, [url]: ruta }));
      });
    });
    return () => {
      vivo = false;
    };
  }, [people, caras]);

  if (query.length < 2 || people.length === 0) {
    const texto =
      query.length < 2
        ? t('create.mentionHint')
        : isLoading
          ? t('create.mentionSearching')
          : t('create.mentionEmpty');
    return (
      <Host matchContents style={{ width: '100%' }} colorScheme="dark">
        <Text
          modifiers={[
            padding({ horizontal: 16, vertical: 12 }),
            font({ size: 13 }),
            foregroundStyle(SECUNDARIO),
          ]}
        >
          {texto}
        </Text>
      </Host>
    );
  }

  return (
    <Host matchContents style={{ width: '100%' }} colorScheme="dark">
      <VStack spacing={0} modifiers={[padding({ vertical: 4 })]}>
        {people.map((u) => {
          const url = cloudinaryUrl(u.avatar, 'avatar_lg');
          const ruta = url ? caras[url] : undefined;
          return (
            <HStack
              key={String(u.id)}
              spacing={12}
              modifiers={[
                // Ancho exacto y alineada al principio. Antes había un Spacer
                // al final, y dentro de un Host `matchContents` ese Spacer se
                // quedaba con todo el espacio y aplastaba el nombre a anchura
                // cero: salía el círculo con las iniciales y al lado nada.
                frame({ width: ANCHO - 32, alignment: 'leading' }),
                padding({ horizontal: 16, vertical: 6 }),
                // Sin esto solo recoge el toque lo que tiene pintura encima, y
                // el hueco a la derecha del nombre se quedaría muerto.
                contentShape(shapes.rectangle()),
                onTapGesture(() => {
                  void haptic('selection');
                  onPick({ id: String(u.id), username: u.username });
                }),
              ]}
            >
              {ruta ? (
                <Image
                  uiImage={ruta}
                  modifiers={[
                    resizable(),
                    aspectRatio({ contentMode: 'fill' }),
                    frame({ width: CARA, height: CARA }),
                    clipShape('circle'),
                  ]}
                />
              ) : (
                <Text
                  modifiers={[
                    frame({ width: CARA, height: CARA }),
                    background(HUECO),
                    clipShape('circle'),
                    font({ size: Math.round(CARA * 0.35), weight: 'semibold' }),
                    foregroundStyle(INK),
                  ]}
                >
                  {iniciales(u.username)}
                </Text>
              )}
              <VStack alignment="leading" spacing={1}>
                <Text
                  modifiers={[
                    font({ size: 15, weight: 'semibold' }),
                    foregroundStyle(INK),
                  ]}
                >
                  {u.username}
                </Text>
                {/* Solo si dice algo distinto del nombre de usuario: muchas
                    cuentas tienen los dos iguales y salía repetido. */}
                {u.displayName &&
                u.displayName.toLowerCase() !== u.username.toLowerCase() ? (
                  <Text modifiers={[font({ size: 13 }), foregroundStyle(SECUNDARIO)]}>
                    {u.displayName}
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          );
        })}
      </VStack>
    </Host>
  );
}
