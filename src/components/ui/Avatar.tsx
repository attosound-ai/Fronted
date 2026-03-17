import { useState } from 'react';
import { Image, View, StyleSheet, ImageStyle, ViewStyle, Text } from 'react-native';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { Logo } from './Logo';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  uri?: string | null;
  size?: AvatarSize;
  style?: ImageStyle | ViewStyle;
  fallbackText?: string;
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

function getInitials(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Avatar - Componente de avatar de usuario
 *
 * Principio SOLID:
 * - Single Responsibility: Solo renderiza imagen de perfil
 * - Open/Closed: Extensible con más tamaños sin modificar código
 */
export function Avatar({ uri, size = 'md', style, fallbackText }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const dimension = SIZES[size];

  const avatarStyle = {
    width: dimension,
    height: dimension,
    borderRadius: dimension / 2,
  };

  const resolvedUri = cloudinaryUrl(uri, PRESET_MAP[size]);

  if (!resolvedUri || hasError) {
    if (fallbackText) {
      return (
        <View style={[styles.placeholder, avatarStyle, style]}>
          <Text
            style={[styles.initials, { fontSize: dimension * 0.35 }]}
            allowFontScaling={false}
          >
            {getInitials(fallbackText)}
          </Text>
        </View>
      );
    }
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
      onError={() => setHasError(true)}
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
  initials: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
});
