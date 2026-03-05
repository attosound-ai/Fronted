/**
 * Formatters - Funciones puras de formateo
 *
 * Principio SOLID:
 * - Single Responsibility: Solo formatean datos
 * - Funciones puras: sin side effects
 */

/**
 * Formatea una fecha relativa (hace X tiempo)
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}sem`;

  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Formatea un número grande (1K, 1M, etc.)
 */
export function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return count.toString();
}

/**
 * Formatea una fecha completa
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
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
