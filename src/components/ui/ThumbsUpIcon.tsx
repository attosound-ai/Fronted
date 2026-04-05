import Svg, { Path } from 'react-native-svg';

interface ThumbsUpIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}

/**
 * Custom ThumbsUp with separate thumb and sidebar paths.
 * When filled, only the thumb area fills — the sidebar stays outline.
 *
 * Paths derived from Lucide ThumbsUp (24x24 viewBox).
 */
export function ThumbsUpIcon({
  size = 24,
  color = '#FFFFFF',
  filled = false,
  strokeWidth = 2.25,
}: ThumbsUpIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Thumb + hand area (right of the divider at x=7) */}
      <Path
        d="M7 10V22h10.5a2 2 0 0 0 1.92-1.44l2.33-8A2 2 0 0 0 19.83 10H14l1-4.12A3.13 3.13 0 0 0 12 2l-3.45 6.89A2 2 0 0 1 6.76 10H7Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
      {/* Sidebar bar (left of divider) */}
      <Path
        d="M7 10H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
