import { Image, View, StyleSheet, ImageStyle, ViewStyle } from 'react-native';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { Logo } from './Logo';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  uri?: string | null;
  size?: AvatarSize;
  style?: ImageStyle | ViewStyle;
}

const SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 64,
  xl: 100,
};

const PRESET_MAP: Record<AvatarSize, 'avatar_sm' | 'avatar_md' | 'avatar_lg'> = {
  sm: 'avatar_sm',
  md: 'avatar_md',
  lg: 'avatar_lg',
  xl: 'avatar_lg',
};

/**
 * Avatar - Componente de avatar de usuario
 *
 * Principio SOLID:
 * - Single Responsibility: Solo renderiza imagen de perfil
 * - Open/Closed: Extensible con más tamaños sin modificar código
 */
export function Avatar({ uri, size = 'md', style }: AvatarProps) {
  const dimension = SIZES[size];

  const avatarStyle = {
    width: dimension,
    height: dimension,
    borderRadius: dimension / 2,
  };

  const resolvedUri = cloudinaryUrl(uri, PRESET_MAP[size]);

  if (!resolvedUri) {
    return (
      <View style={[styles.placeholder, avatarStyle, style]}>
        <Logo size={dimension * 0.7} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={[styles.image, avatarStyle, style as ImageStyle]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#222222',
  },
  placeholder: {
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
