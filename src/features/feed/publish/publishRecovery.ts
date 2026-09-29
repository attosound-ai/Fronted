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
