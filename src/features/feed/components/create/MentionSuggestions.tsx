import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Host,
  HStack,
  Image,
  List,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  aspectRatio,
  background,
  clipShape,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  onTapGesture,
  padding,
  resizable,
  scrollContentBackground,
} from '@expo/ui/swift-ui/modifiers';

import { haptic } from '@/lib/haptics/hapticService';
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
const FONDO = '#000000';
const HUECO = '#333333';
const CARA = 38;
/** Como Instagram: cinco filas caben, el resto se desplaza. */
const ALTO = 220;

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
 * La lista que Instagram deja caer bajo la leyenda en cuanto escribes "@".
 *
 * Es una `List` de SwiftUI de verdad, no una FlatList pintada para parecerlo
 * (David, 27 de septiembre de 2026): el desplazamiento, el rebote y el resalte
 * al tocar los pone el sistema, igual que en la pantalla de ajustes. Va sin
 * marco ni línea superior, pegada al texto.
 *
 * Dos detalles que costaron una vuelta. El `Image` de SwiftUI no viene
 * `resizable`, así que sin ese modificador pinta el avatar a su tamaño real y
 * el `frame` lo recorta en vez de encogerlo. Y mientras la cara no está, la
 * fila enseña las iniciales sobre un círculo gris, que es lo que hace el resto
 * de la app, no el símbolo de persona del sistema.
 */
export function MentionSuggestions({ query, selfId, onPick }: MentionSuggestionsProps) {
  const { t } = useTranslation('feed');
  const { results, isLoading } = useUserSearch(query);

  const people = useMemo(
    () => results.filter((u) => String(u.id) !== selfId).slice(0, 12),
    [results, selfId]
  );

  // Las caras, en disco, porque SwiftUI solo pinta un archivo local y además lo
  // lee de forma síncrona: bajarlas aparte evita que escribir espere a la red.
  const [caras, setCaras] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    people.forEach((u) => {
      if (!u.avatar || caras[u.avatar]) return;
      void avatarEnDisco(u.avatar).then((ruta) => {
        if (vivo && ruta)
          setCaras((previo) => ({ ...previo, [u.avatar as string]: ruta }));
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
      <Host matchContents colorScheme="dark">
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
    <Host style={{ height: ALTO }} colorScheme="dark">
      <List
        modifiers={[
          listStyle('plain'),
          scrollContentBackground('hidden'),
          background(FONDO),
        ]}
      >
        {people.map((u) => {
          const ruta = u.avatar ? caras[u.avatar] : undefined;
          return (
            <HStack
              key={String(u.id)}
              spacing={12}
              modifiers={[
                frame({ maxWidth: 10000 }),
                padding({ vertical: 5 }),
                listRowInsets({ top: 0, bottom: 0, leading: 16, trailing: 16 }),
                listRowBackground(FONDO),
                listRowSeparator('hidden'),
                onTapGesture(() => {
                  void haptic('selection');
                  onPick({ id: String(u.id), username: u.username });
                }),
              ]}
            >
              <ZStack modifiers={[frame({ width: CARA, height: CARA })]}>
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
                ) : null}
              </ZStack>
              <VStack alignment="leading" spacing={1}>
                <Text
                  modifiers={[
                    font({ size: 15, weight: 'semibold' }),
                    foregroundStyle(INK),
                  ]}
                >
                  {u.username}
                </Text>
                {u.displayName ? (
                  <Text modifiers={[font({ size: 13 }), foregroundStyle(SECUNDARIO)]}>
                    {u.displayName}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
            </HStack>
          );
        })}
      </List>
    </Host>
  );
}
