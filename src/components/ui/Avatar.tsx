import { useState, useEffect } from 'react';
import { Image, View, StyleSheet, ImageStyle, ViewStyle, Text } from 'react-native';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import { Logo } from './Logo';
import { GoldRing } from './GoldRing';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  uri?: string | null;
  size?: AvatarSize;
  style?: ImageStyle | ViewStyle;
  fallbackText?: string;
  /** Show a gold ring around the avatar (for verified creators) */
  creatorRing?: boolean;
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
export function Avatar({
  uri,
  size = 'md',
  style,
  fallbackText,
  creatorRing,
}: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const dimension = SIZES[size];

  // Reset error state when uri changes (e.g. after profile edit)
  useEffect(() => {
    setHasError(false);
  }, [uri]);

  const avatarStyle = {
    width: dimension,
    height: dimension,
    borderRadius: dimension / 2,
  };

  const resolvedUri = cloudinaryUrl(uri, PRESET_MAP[size]);

  const withRing = (child: React.ReactNode) => {
    if (!creatorRing) return child;
    return (
      <GoldRing size={dimension + 4} thickness={2}>
        {child}
      </GoldRing>
    );
  };

  if (!resolvedUri || hasError) {
    if (fallbackText) {
      return withRing(
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
    return withRing(
      <View style={[styles.placeholder, avatarStyle, style]}>
        <Logo size={dimension * 0.7} />
      </View>
    );
  }

  return withRing(
    <Image
      key={resolvedUri}
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
