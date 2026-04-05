/**
 * ReactionPicker — full emoji picker using rn-emoji-keyboard.
 *
 * Provides search, categories, recently used, skin tones,
 * and dark theme matching the app design.
 */

import { memo, useCallback } from 'react';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const DARK_THEME = {
  backdrop: '#00000077',
  knob: '#444',
  container: '#1A1A1A',
  header: '#FFFFFF',
  skinTonesContainer: '#222',
  category: {
    icon: '#888',
    iconActive: '#3B82F6',
    container: '#1A1A1A',
    containerActive: '#222',
  },
  search: {
    text: '#FFFFFF',
    placeholder: '#666',
    icon: '#888',
    background: '#222',
  },
};

function ReactionPickerInner({ visible, onSelect, onClose }: ReactionPickerProps) {
  const handleSelect = useCallback(
    (emoji: EmojiType) => {
      onSelect(emoji.emoji);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <EmojiPicker
      onEmojiSelected={handleSelect}
      open={visible}
      onClose={onClose}
      theme={DARK_THEME}
      enableSearchBar
      enableRecentlyUsed
      categoryPosition="top"
      expandable
    />
  );
}

export const ReactionPicker = memo(ReactionPickerInner);
