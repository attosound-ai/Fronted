/**
 * Formatters - Pure formatting functions
 *
 * Uses i18n.language for locale-aware formatting.
 */

import i18n from '@/lib/i18n';

function getLocale(): string {
  return i18n.language || 'en';
}

/**
 * Formats a relative time string (e.g. "now", "5m", "3h")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const t = i18n.getFixedT(getLocale(), 'common');

  if (diffInSeconds < 60) return t('time.now');
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)}${t('time.minuteShort')}`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)}${t('time.hourShort')}`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}${t('time.dayShort')}`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 604800)}${t('time.weekShort')}`;

  return date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
}

/**
 * Formats a large number using locale-aware compact notation
 */
export function formatCount(count: number | undefined | null): string {
  if (count == null) return '0';
  if (count >= 1000) {
    return new Intl.NumberFormat(getLocale(), { notation: 'compact' }).format(count);
  }
  return count.toString();
}

/**
 * Formats a full date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Trunca un texto con ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

/**
 * Extracts a human-readable message from an unknown error.
 * For Axios errors, reads the server's `error` field from the response body.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { error?: string } } };
    const serverMessage = axiosError.response?.data?.error;
    if (typeof serverMessage === 'string' && serverMessage) {
      return serverMessage;
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
