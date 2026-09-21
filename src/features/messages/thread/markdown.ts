/**
 * Inline formatting the way WhatsApp, Telegram and Slack type it:
 *   *bold*  or  **bold**,  _italic_,  ~strike~,  `code`
 * Pure and small on purpose: no nesting across kinds, markers must hug the
 * text (`* not bold *` stays literal), and unmatched markers stay literal.
 */

export interface TextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

type Kind = 'bold' | 'italic' | 'strike' | 'code';

const MARKERS: { open: string; close: string; kind: Kind }[] = [
  { open: '**', close: '**', kind: 'bold' },
  { open: '*', close: '*', kind: 'bold' },
  { open: '_', close: '_', kind: 'italic' },
  { open: '~', close: '~', kind: 'strike' },
  { open: '`', close: '`', kind: 'code' },
];

const MARKER_CHARS = new Set(['*', '_', '~', '`']);

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch);
}

/** True when the message has any marker at all: the fast path skips parsing. */
export function hasMarkdown(text: string): boolean {
  for (const ch of text) if (MARKER_CHARS.has(ch)) return true;
  return false;
}

export function parseMarkdown(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let plain = '';
  let i = 0;
  const flush = () => {
    if (plain) {
      spans.push({ text: plain });
      plain = '';
    }
  };
  while (i < text.length) {
    const ch = text[i];
    if (!MARKER_CHARS.has(ch)) {
      plain += ch;
      i += 1;
      continue;
    }
    let matched = false;
    for (const m of MARKERS) {
      if (!text.startsWith(m.open, i)) continue;
      // An opening marker sits at a word start: not preceded by a word
      // character and followed by a non space.
      const before = text[i - 1];
      const after = text[i + m.open.length];
      if (
        isWordChar(before) ||
        after === undefined ||
        after === ' ' ||
        after === m.close[0]
      )
        continue;
      const close = text.indexOf(m.close, i + m.open.length);
      if (close < 0) continue;
      const inner = text.slice(i + m.open.length, close);
      const afterClose = text[close + m.close.length];
      if (!inner || inner.endsWith(' ') || inner.includes('\n') || isWordChar(afterClose))
        continue;
      flush();
      spans.push({ text: inner, [m.kind]: true });
      i = close + m.close.length;
      matched = true;
      break;
    }
    if (!matched) {
      plain += ch;
      i += 1;
    }
  }
  flush();
  return spans;
}

/** The text with the markers removed, for previews and notifications. */
export function stripMarkdown(text: string): string {
  if (!hasMarkdown(text)) return text;
  return parseMarkdown(text)
    .map((s) => s.text)
    .join('');
}

/**
 * Wrap `[start, end)` of `text` with the markers of `kind`; with an empty
 * selection the markers are inserted at the caret. Returns the new text and
 * where the caret should land.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  kind: Kind
): { text: string; caret: number } {
  const marker = { bold: '*', italic: '_', strike: '~', code: '`' }[kind];
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(text.length, Math.max(start, end));
  const inner = text.slice(a, b);
  const next = `${text.slice(0, a)}${marker}${inner}${marker}${text.slice(b)}`;
  return { text: next, caret: inner ? b + marker.length * 2 : a + marker.length };
}
