import { useState, useRef, useCallback, type ReactNode } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';

interface ProfileSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ProfileSection({
  title,
  children,
  defaultOpen = false,
}: ProfileSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const animHeight = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const rotation = animHeight.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const toggle = useCallback(() => {
    Animated.timing(animHeight, {
      toValue: open ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setOpen((v) => !v);
  }, [open, animHeight]);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.header}>
        <Text variant="h3" style={styles.title}>
          {title}
        </Text>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <ChevronDown size={20} color="#888" strokeWidth={2.25} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.cardWrapper,
          {
            maxHeight: animHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 500],
            }),
            opacity: animHeight,
          },
        ]}
      >
        <View style={styles.card}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
  },
  cardWrapper: {
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
  },
});
