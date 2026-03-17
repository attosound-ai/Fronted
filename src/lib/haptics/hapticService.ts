import * as Haptics from 'expo-haptics';

export type HapticType = 'light' | 'success' | 'error' | 'warning' | 'selection';

const handlers: Record<HapticType, () => Promise<void>> = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  selection: () => Haptics.selectionAsync(),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export const haptic = async (type: HapticType = 'light'): Promise<void> => {
  try {
    await handlers[type]();
  } catch {
    // Dispositivos sin motor háptico: fallo silencioso
  }
};
