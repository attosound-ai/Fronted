import { Image, View, StyleSheet } from 'react-native';

interface VideoPosterProps {
  /** Poster image URL (first-frame thumbnail). */
  uri?: string | null;
  /** Show the poster only while the video has not produced a first frame yet. */
  visible: boolean;
}

/**
 * VideoPoster — first-frame thumbnail shown on top of a VideoView while the
 * stream buffers, so the user sees the content instantly instead of a black
 * rectangle. Render it directly after the VideoView (and before any controls)
 * so controls stay tappable.
 */
export function VideoPoster({ uri, visible }: VideoPosterProps) {
  if (!visible || !uri) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </View>
  );
}
