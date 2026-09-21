/**
 * Geometry and palette of the studio editor.
 *
 * The layout mirrors SoundLab's editor point for point (top bar, clip
 * actions, ruler, tracks with a left panel, zoom row, range actions,
 * transport, status readout). The palette is ATTO's black and white: no
 * teal, white primary pills, glass circles for icon buttons.
 */
export const STUDIO = {
  topBarHeight: 52,
  clipBarHeight: 44,
  rulerHeight: 30,
  // 172, not SoundLab's 150: our slider thumbs are taller, and at 150 the
  // Gain and Pan values sat under them.
  trackHeight: 160,
  panelWidth: 110,
  zoomRowHeight: 44,
  rangeBarHeight: 48,
  transportHeight: 60,
  readoutHeight: 34,
  iconButton: 36,
  playButton: 48,
} as const;

export const STUDIO_COLORS = {
  background: '#000000',
  surface: '#111111',
  surfaceRaised: '#1A1A1A',
  border: '#222222',
  borderStrong: '#333333',
  text: '#FFFFFF',
  textMuted: '#8A8A8A',
  textDisabled: '#4A4A4A',
  primary: '#FFFFFF',
  onPrimary: '#000000',
  lane: '#0A0A0A',
  laneBorder: '#1F1F1F',
  waveform: '#FFFFFF',
  waveformDim: '#7A7A7A',
  playhead: '#FF3B30',
  selectionLine: '#FFA500',
  selectionFill: 'rgba(255,255,255,0.14)',
  selectionBorder: '#FFA500',
  record: '#FF3B30',
  meterLow: '#FFFFFF',
  meterHigh: '#FF3B30',
} as const;
