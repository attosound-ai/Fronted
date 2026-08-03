const DEFAULT_PIXELS_PER_MS = 0.1; // 100px per second at zoom 1

export function msToPixels(ms: number, zoom = 1): number {
  return ms * DEFAULT_PIXELS_PER_MS * zoom;
}

export function pixelsToMs(px: number, zoom = 1): number {
  return px / (DEFAULT_PIXELS_PER_MS * zoom);
}

export function clipDurationMs(startInSegment: number, endInSegment: number): number {
  return endInSegment - startInSegment;
}

export function formatTimelineMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export interface RulerMark {
  positionMs: number;
  label: string;
  isMajor: boolean;
}

const NICE_INTERVALS_MS = [500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000];

/**
 * Hard ceiling on ruler marks. Every mark is 1-2 native views (tick + label),
 * mounted and unmounted with the editor in one synchronous Fabric transaction.
 * The spacing-based interval alone is unbounded in the timeline DURATION: a
 * 25-minute clip at the default zoom put ~3,000 marks (~6,000 views) on the
 * ruler, which contributed to the main-thread hang of REACT-NATIVE-3W. Marks
 * therefore also scale with duration so their total count stays bounded no
 * matter how long the project or how deep the zoom.
 */
const MAX_RULER_MARKS = 600;

export function generateRulerMarks(totalDurationMs: number, zoom: number): RulerMark[] {
  const pixelsPerMs = 0.1 * zoom;
  const targetSpacingPx = 80;
  // Worst-case minor subdivision below is 5 marks per major, so bounding majors
  // to MAX/5 bounds the total.
  const countTargetMs = (totalDurationMs * 5) / MAX_RULER_MARKS;
  const targetMs = Math.max(targetSpacingPx / pixelsPerMs, countTargetMs);

  // Pick the smallest "nice" interval that keeps major marks >= targetSpacing apart
  let majorInterval = NICE_INTERVALS_MS[NICE_INTERVALS_MS.length - 1];
  for (const interval of NICE_INTERVALS_MS) {
    if (interval >= targetMs) {
      majorInterval = interval;
      break;
    }
  }
  // Multi-hour timelines can exceed the largest nice interval; fall back to the
  // next whole minute that honours the count bound rather than overflowing it.
  if (majorInterval < targetMs) {
    majorInterval = Math.ceil(targetMs / 60000) * 60000;
  }

  // Minor subdivision between majors
  const minorInterval =
    majorInterval <= 1000
      ? majorInterval / 2
      : majorInterval <= 5000
        ? 1000
        : majorInterval <= 30000
          ? majorInterval / 5
          : majorInterval / 4;

  const marks: RulerMark[] = [];
  for (let ms = 0; ms <= totalDurationMs; ms += minorInterval) {
    const isMajor = Math.abs(ms % majorInterval) < 1;
    marks.push({
      positionMs: ms,
      label: isMajor ? formatRulerLabel(ms) : '',
      isMajor,
    });
  }

  return marks;
}

function formatRulerLabel(ms: number): string {
  if (ms === 0) return '0s';
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds % 1 === 0 ? `${totalSeconds}s` : `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}:${String(Math.floor(seconds)).padStart(2, '0')}`;
}
