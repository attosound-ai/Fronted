import type { LucideIcon } from 'lucide-react-native';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * App-wide icon wrapper with consistent bold defaults.
 * Uses Lucide Icons with strokeWidth for thickness control.
 */
export function Icon({
  icon: LucideComponent,
  size = 24,
  color = '#FFF',
  strokeWidth = 2.25,
}: IconProps) {
  return (
    <LucideComponent
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
    />
  );
}
