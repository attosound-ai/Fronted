declare module 'react-native-ios-context-menu' {
  import type { ComponentType, ReactElement } from 'react';
  import type { ViewProps } from 'react-native';

  interface MenuActionConfig {
    actionKey: string;
    actionTitle: string;
    actionSubtitle?: string;
    menuState?: 'on' | 'off' | 'mixed';
    menuAttributes?: string[];
    icon?: {
      type: string;
      imageValue: { systemName: string };
    };
  }

  type MenuElementConfig = MenuActionConfig | MenuConfig;

  interface MenuConfig {
    menuTitle: string;
    menuItems: MenuElementConfig[];
    menuOptions?: string[];
  }

  interface AuxiliaryPreviewConfig {
    anchorPosition?: 'top' | 'bottom' | 'automatic';
    alignmentHorizontal?: string;
    height?: number;
    marginPreview?: number;
    transitionConfigEntrance?: { transition: string };
  }

  interface ContextMenuViewProps extends ViewProps {
    menuConfig: MenuConfig;
    previewConfig?: Record<string, unknown>;
    renderPreview?: () => ReactElement;
    isContextMenuEnabled?: boolean;
    lazyPreview?: boolean;
    isAuxiliaryPreviewEnabled?: boolean;
    auxiliaryPreviewConfig?: AuxiliaryPreviewConfig;
    renderAuxiliaryPreview?: () => ReactElement;
    onPressMenuItem?: (event: {
      nativeEvent: { actionKey: string; actionTitle: string };
    }) => void;
    onMenuWillShow?: () => void;
    onMenuDidShow?: () => void;
    onMenuWillHide?: () => void;
    onMenuDidHide?: () => void;
  }

  export const ContextMenuView: ComponentType<ContextMenuViewProps>;
}
