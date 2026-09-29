import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';
import type { CreatePostParams } from './publishPost';

/**
 * Posts on their way out, Instagram style: the composer closes the moment
 * the person taps Post, and compression, upload and the create call run here
 * in the background while the feed shows a strip with the progress
 * (PublishStrip) and the Dynamic Island a Live Activity.
 *
 * Persisted, so a post never silently disappears: if the app dies mid way,
 * the job comes back as `interrupted` and the strip offers to retry it.
 */
export type PublishPhase =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'posting'
  | 'done'
  | 'failed'
  | 'interrupted';

export type PublishFailure = 'too_large' | 'network' | 'other';

export type PublishParams = Omit<CreatePostParams, 'onProgress'>;

export interface PublishJob {
  id: string;
  createdAt: number;
  params: PublishParams;
  /** Local image for the strip and the Live Activity (a video frame, the photo, or the cover). */
  thumbnailUri: string | null;
  phase: PublishPhase;
  /** 0..1 over the whole job: compression, upload and the create call. */
  progress: number;
  failure?: PublishFailure;
  /** What went wrong, in words the person can act on. */
  message?: string;
}

const ACTIVE: PublishPhase[] = ['preparing', 'uploading', 'posting'];

interface PublishQueueState {
  jobs: PublishJob[];
  enqueue: (params: PublishParams, thumbnailUri: string | null) => string;
  update: (id: string, patch: Partial<PublishJob>) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
}

const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const usePublishQueue = create<PublishQueueState>()(
  persist(
    (set) => ({
      jobs: [],
      enqueue: (params, thumbnailUri) => {
        const id = `pub-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        set((s) => ({
          jobs: [
            ...s.jobs,
            {
              id,
              createdAt: Date.now(),
              params,
              thumbnailUri,
              phase: 'queued',
              progress: 0,
            },
          ],
        }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
      retry: (id) =>
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  phase: 'queued',
                  progress: 0,
                  failure: undefined,
                  message: undefined,
                }
              : j
          ),
        })),
      remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
    }),
    {
      name: 'publish-queue-v1',
      storage: createJSONStorage(() => mmkvAdapter),
      // A job that was running when the app died did not finish: say so.
      // Finished ones are gone for good.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const jobs = state.jobs
          .filter((j) => j.phase !== 'done')
          .map((j) =>
            ACTIVE.includes(j.phase) ? { ...j, phase: 'interrupted' as const } : j
          );
        usePublishQueue.setState({ jobs });
      },
    }
  )
);

export function isActive(job: PublishJob): boolean {
  return job.phase === 'queued' || ACTIVE.includes(job.phase);
}
