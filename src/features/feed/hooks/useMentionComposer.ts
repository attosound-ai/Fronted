import { useCallback, useRef, useState } from 'react';
import type {
  NativeSyntheticEvent,
  TextInput,
  TextInputSelectionChangeEventData,
} from 'react-native';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  activeMention,
  applyMention,
  survivingTags,
  type ActiveMention,
  type TaggedPerson,
} from '../utils/mentions';

/**
 * A caption field that tags people the way Instagram does: type @, pick from
 * the list, and the name you picked rides with the post so the link still works
 * for whoever reads it (David, Sep 25 2026).
 *
 * Shared by New Post and Edit Post. Edit Post had a bare text field, so a name
 * added while editing was typed by hand, with no list to pick from: Anthony
 * wrote @youngraybeatz for @youngraybeats and the name opened nothing (Oct 27
 * 2026). It also never saved the tag, so nobody was told.
 */
export function useMentionComposer(initialText = '', initialTagged: TaggedPerson[] = []) {
  const [text, setText] = useState(initialText);
  const [tagged, setTagged] = useState<TaggedPerson[]>(initialTagged);
  const [mention, setMention] = useState<ActiveMention | null>(null);
  // Set once after a pick so the caret lands after the name, then released,
  // because a caption whose selection is always controlled fights the keyboard.
  const [forcedCaret, setForcedCaret] = useState<{ start: number; end: number }>();

  /**
   * Lo que la leyenda dice ahora mismo y dónde está el cursor.
   *
   * La mención que se está escribiendo depende de las dos cosas a la vez, y
   * el texto leído dentro de `onSelectionChange` es el valor del render
   * ANTERIOR. Eso dejaba la lista un carácter por detrás (con "@andrey" aún
   * decía "sigue escribiendo") y, al elegir, hacía que `applyMention` cortara
   * con una longitud equivocada: la última letra escrita reaparecía DESPUÉS
   * del nombre insertado. Un solo origen para los dos fallos.
   */
  /** El campo, para devolverle el foco cuando la lista nativa se lo quita. */
  const inputRef = useRef<TextInput>(null);
  const captionRef = useRef(initialText);
  const caretRef = useRef(initialText.length);

  /**
   * Text that arrives from outside the keyboard (the post being edited, once it
   * loads). Its tags come with it, and the caret goes to the end, where the
   * field puts it.
   */
  const load = useCallback((next: string, nextTagged: TaggedPerson[]) => {
    captionRef.current = next;
    caretRef.current = next.length;
    setText(next);
    setTagged(survivingTags(next, nextTagged));
    setMention(null);
  }, []);

  /**
   * Every keystroke decides whether a mention is being written at the caret.
   * A name the author deleted stops being a tag, so nobody is notified for a
   * post that no longer names them.
   */
  const onChangeText = useCallback((next: string) => {
    // El cursor real llega en `onSelectionChange`, que puede ir detrás de esta
    // llamada; mientras tanto se estima con lo que creció o menguó el texto,
    // que es exacto al escribir y al borrar, que es lo que importa aquí.
    const moved = next.length - captionRef.current.length;
    const caret = Math.max(0, Math.min(caretRef.current + moved, next.length));
    captionRef.current = next;
    caretRef.current = caret;
    setText(next);
    setMention(activeMention(next, caret));
    setTagged((current) => survivingTags(next, current));
  }, []);

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      const at = e.nativeEvent.selection.end;
      caretRef.current = at;
      setForcedCaret(undefined);
      setMention(activeMention(captionRef.current, at));
    },
    []
  );

  const pickMention = useCallback(
    (person: TaggedPerson) => {
      if (!mention) return;
      const { text: next, caret } = applyMention(
        captionRef.current,
        mention,
        person.username
      );
      captionRef.current = next;
      caretRef.current = caret;
      setText(next);
      setForcedCaret({ start: caret, end: caret });
      setMention(null);
      // La lista es una vista nativa de SwiftUI, así que al tocarla se lleva el
      // primer respondedor y el teclado se cierra. En Instagram no pasa: eliges
      // y sigues escribiendo. Se lo devolvemos en cuanto la fila desaparece
      // (David, 27 de septiembre de 2026).
      requestAnimationFrame(() => inputRef.current?.focus());
      setTagged((current) =>
        current.some((p) => p.id === person.id) ? current : [...current, person]
      );
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_MENTION_PICKED, {
        tagged_count: tagged.length + 1,
      });
    },
    [mention, tagged.length]
  );

  return {
    text,
    tagged,
    mention,
    forcedCaret,
    inputRef,
    load,
    onChangeText,
    onSelectionChange,
    pickMention,
  };
}
