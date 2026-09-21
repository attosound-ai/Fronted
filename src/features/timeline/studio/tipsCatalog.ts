/**
 * The five tutorial tips, in SoundLab's order. Each names the editor area
 * it highlights; the editor measures those areas and the overlay draws the
 * frame around them. Videos are optional: a tip without one shows text
 * alone until its recording lands in assets/videos/tips.
 */
export type TipTarget = 'track' | 'effect' | 'undoRedo' | 'clip' | 'zoom';

export interface StudioTip {
  id: string;
  target: TipTarget;
  /** i18n key inside the projects namespace. */
  textKey: string;
}

export const STUDIO_TIPS: StudioTip[] = [
  { id: 'select', target: 'track', textKey: 'studio.tips.select' },
  { id: 'effect', target: 'effect', textKey: 'studio.tips.effect' },
  { id: 'undo', target: 'undoRedo', textKey: 'studio.tips.undo' },
  { id: 'move', target: 'clip', textKey: 'studio.tips.move' },
  { id: 'zoom', target: 'zoom', textKey: 'studio.tips.zoom' },
];

/** Local tutorial clips, keyed by tip id. Filled in as they are recorded. */
export const TIP_VIDEOS: Partial<Record<string, number>> = {};
