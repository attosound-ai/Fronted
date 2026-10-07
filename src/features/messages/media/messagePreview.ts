/**
 * What a message reads like where only one line fits: the conversation list
 * and the banner that drops in while the app is open. Pure, no native imports.
 */

/** Short label for previews and notifications of a non text message. */
export function mediaPreviewLabel(
  contentType: string | undefined | null,
  t: (key: string) => string
): string | null {
  switch (contentType) {
    case 'audio':
      return t('media.previewAudio');
    case 'video_note':
      return t('media.previewVideoNote');
    case 'image':
      return t('media.previewImage');
    case 'video':
      return t('media.previewVideo');
    case 'file':
      return t('media.previewFile');
    case 'contact':
      return t('media.previewContact');
    case 'location':
      return t('media.previewLocation');
    case 'post':
      return t('media.previewPost');
    default:
      return null;
  }
}

/**
 * What the server stores as the preview when the last message of a chat is
 * deleted: one sentence in the row of the other person and another in the row
 * of whoever deleted it (chat service, `ConversationPreview`). Plain English
 * and not a `[deleted]` marker so the builds released before this one, which
 * show the stored text as it comes, read right too. Must match the server
 * character for character.
 */
export const SERVER_PREVIEW_DELETED = '🚫 This message was deleted';
export const SERVER_PREVIEW_DELETED_BY_YOU = '🚫 You deleted this message';

/** The server writes `[audio]` style markers as the conversation preview. */
export function previewFromServer(
  lastMessage: string | null | undefined,
  t: (key: string) => string
): string {
  if (!lastMessage) return '';
  // The last message of the chat was deleted: the list says so in the
  // person's language, the way WhatsApp does.
  if (lastMessage === SERVER_PREVIEW_DELETED) return t('media.previewDeleted');
  if (lastMessage === SERVER_PREVIEW_DELETED_BY_YOU)
    return t('media.previewDeletedByYou');
  const marker = /^\[([a-z_]+)\]\s*/.exec(lastMessage);
  if (!marker) return lastMessage;
  if (marker[1] === 'thread') return lastMessage.slice(marker[0].length);
  return mediaPreviewLabel(marker[1], t) ?? lastMessage;
}

/**
 * The line of the in app banner for a new message. `lastMessage` used to be
 * shown as it came, and for a photo or a video that is the hosted address of
 * the file (David, Oct 6 2026: the notification of a video "is the Cloudinary
 * link"). Three sources, in order: the type the server now sends, the
 * `[video]` style marker, and, for a server that sends neither, the shape of
 * the address itself. A text message is always shown as written, link or not.
 */
export function bannerPreview(
  lastMessage: string | null | undefined,
  contentType: string | null | undefined,
  t: (key: string) => string
): string {
  const raw = lastMessage ?? '';
  if (contentType === 'text') return previewFromServer(raw, t);
  if (contentType) {
    const label = mediaPreviewLabel(contentType, t);
    if (label) return label;
  }
  const fromMarker = previewFromServer(raw, t);
  if (fromMarker !== raw) return fromMarker;
  const hosted =
    /^https?:\/\/res\.cloudinary\.com\/[^/\s]+\/(image|video|raw)\/upload\//i.exec(
      raw.trim()
    );
  if (hosted) {
    const kind = hosted[1].toLowerCase();
    if (kind === 'image') return t('media.previewImage');
    if (kind === 'video') return t('media.previewVideo');
    return t('media.previewFile');
  }
  return raw;
}
