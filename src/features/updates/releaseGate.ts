/**
 * La decisión de bloquear, sola y sin dependencias, para poder probarla.
 *
 * La regla que importa no es cuándo bloquea sino cuándo NO debe hacerlo: un
 * dato ausente, cero o ilegible no puede dejar a nadie fuera de su propia
 * aplicación, porque desde dentro del bloqueo no hay vuelta atrás.
 */
export function debeActualizar(build: number, minBuild: number): boolean {
  if (!Number.isFinite(build) || build <= 0) return false; // no sabemos qué build somos
  if (!Number.isFinite(minBuild) || minBuild <= 0) return false; // nadie bloqueado
  return build < minBuild;
}
