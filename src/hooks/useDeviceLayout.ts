import { Platform, useWindowDimensions } from 'react-native';

const SIDEBAR_WIDTH = 72;
const MAX_CONTENT_WIDTH = 500;

const isTablet = Platform.isPad === true;

export function useDeviceLayout() {
  const { width: screenWidth } = useWindowDimensions();
  const sidebarWidth = isTablet ? SIDEBAR_WIDTH : 0;
  const contentWidth = isTablet
    ? Math.min(MAX_CONTENT_WIDTH, screenWidth - sidebarWidth)
    : screenWidth;

  return { isTablet, screenWidth, contentWidth, sidebarWidth } as const;
}
