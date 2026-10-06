/**
 * The name of the file the exporter saves to the device. The exporter's
 * "File name" field wins; left empty, the title and then the project's name
 * stand in, so the file is never called export_<id>_<timestamp>.
 *
 * Kept to what every file system and the Files app accept: no path
 * separators, no characters Windows refuses (the file usually ends up shared),
 * no leading dots (hidden files), and never two extensions.
 */
const FALLBACK = 'ATTO mix';
const MAX_BASE_LENGTH = 80;
const KNOWN_EXTENSIONS = ['m4a', 'mp3', 'wav', 'flac', 'aac', 'alac', 'caf'];

export function cleanBaseName(raw: string | null | undefined): string {
  if (!raw) return '';
  let base = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Someone who types "final.mp3" means the name "final".
  const typed = base.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (typed && KNOWN_EXTENSIONS.includes(typed))
    base = base.slice(0, -(typed.length + 1));
  base = base.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (base.length > MAX_BASE_LENGTH) base = base.slice(0, MAX_BASE_LENGTH).trim();
  return base;
}

export function exportFileName(input: {
  fileName?: string | null;
  title?: string | null;
  projectName?: string | null;
  extension: string;
}): string {
  const base =
    cleanBaseName(input.fileName) ||
    cleanBaseName(input.title) ||
    cleanBaseName(input.projectName) ||
    FALLBACK;
  const ext = (input.extension || 'wav').replace(/^\./, '').toLowerCase();
  return `${base}.${ext}`;
}
