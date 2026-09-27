/**
 * Avatares en disco para la lista nativa de etiquetado.
 *
 * El `Image` de SwiftUI solo sabe pintar un símbolo del sistema o un archivo
 * LOCAL (`uiImage`), nunca una URL remota. Así que el avatar tiene que estar en
 * disco antes de que la fila lo pueda dibujar.
 *
 * Esto guarda una copia por URL en la carpeta de caché y devuelve su ruta.
 * Mientras no haya llegado, la fila cae al símbolo de persona, de modo que
 * escribir en la leyenda nunca espera a la red: la lista aparece de inmediato y
 * las caras entran cuando están.
 */
import { Directory, File, Paths } from 'expo-file-system';

const CARPETA = 'mention-avatars';

/** Una descarga por URL, aunque la lista vuelva a pedir la misma cara. */
const enCurso = new Map<string, Promise<string | null>>();

/** Nombre corto y estable para la URL, con su extensión cuando la trae. */
function nombreDe(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i += 1) h = (h * 31 + url.charCodeAt(i)) | 0;
  const ext = url.split('?')[0].split('.').pop();
  const limpia = ext && /^[a-zA-Z]{3,4}$/.test(ext) ? ext.toLowerCase() : 'img';
  return `${(h >>> 0).toString(36)}.${limpia}`;
}

/**
 * La ruta local del avatar, descargándolo la primera vez. Devuelve null si no
 * se pudo: la fila entonces se queda con el símbolo, que es un fallo cosmético
 * y nunca un error que valga interrumpir al que escribe.
 */
export function avatarEnDisco(url: string): Promise<string | null> {
  const ya = enCurso.get(url);
  if (ya) return ya;

  const tarea = (async () => {
    try {
      const carpeta = new Directory(Paths.cache, CARPETA);
      if (!carpeta.exists) carpeta.create({ intermediates: true, idempotent: true });
      const archivo = new File(carpeta, nombreDe(url));
      if (archivo.exists) return archivo.uri;
      const bajado = await File.downloadFileAsync(url, archivo);
      return bajado.uri;
    } catch {
      return null;
    }
  })();

  enCurso.set(url, tarea);
  return tarea;
}
