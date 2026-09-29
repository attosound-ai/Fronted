/**
 * Pure rules of the publish queue, kept apart so they run under node tests.
 */
export interface RecoverableJob {
  phase: string;
}

const RUNNING = ['preparing', 'uploading', 'posting'];

/**
 * Jobs as they must look after a restart: nothing can still be running. A
 * job that was running comes back as `interrupted` (the strip offers Retry),
 * a finished one is dropped, everything else stays as it was.
 */
export function recoverJobs<T extends RecoverableJob>(saved: T[]): T[] {
  return saved
    .filter((j) => j.phase !== 'done')
    .map((j) => (RUNNING.includes(j.phase) ? { ...j, phase: 'interrupted' } : j));
}

/**
 * iOS moves an app's container when the app is updated or reinstalled, so an
 * absolute file path saved in the queue stops existing. Paths inside the
 * app's own folders are stored relative to them and resolved when the job
 * runs. `roots` maps a stable tag to the current absolute folder.
 */
export function toStoredUri(uri: string, roots: Record<string, string>): string {
  for (const [tag, root] of Object.entries(roots)) {
    if (root && uri.startsWith(root)) return `${tag}${uri.slice(root.length)}`;
  }
  return uri;
}

export function fromStoredUri(uri: string, roots: Record<string, string>): string {
  for (const [tag, root] of Object.entries(roots)) {
    if (root && uri.startsWith(tag)) return `${root}${uri.slice(tag.length)}`;
  }
  return uri;
}
