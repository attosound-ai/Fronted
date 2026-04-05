/**
 * MessageActionSheet — bottom sheet with message actions.
 *
 * Shows: React, Reply, Copy, Edit (own only), Delete (own only).
 */

import { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SmilePlus, Reply, Copy, Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';
import { showToast } from '@/components/ui/Toast';

interface MessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  messageContent: string;
  isOwn: boolean;
  onReact: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function MessageActionSheetInner({
  visible,
  onClose,
  messageContent,
  isOwn,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageActionSheetProps) {
  const { t } = useTranslation('messages');

  const handleCopy = async () => {
    await Clipboard.setStringAsync(messageContent);
    showToast(t('actions.copied', { defaultValue: 'Copied' }));
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('actions.title', { defaultValue: 'Message' })}
    >
      <ActionRow
        icon={<SmilePlus size={20} color={COLORS.white} strokeWidth={1.75} />}
        label={t('actions.react', { defaultValue: 'React' })}
        onPress={() => {
          onClose();
          onReact();
        }}
      />
      <ActionRow
        icon={<Reply size={20} color={COLORS.white} strokeWidth={1.75} />}
        label={t('actions.reply', { defaultValue: 'Reply' })}
        onPress={() => {
          onClose();
          onReply();
        }}
      />
      <ActionRow
        icon={<Copy size={20} color={COLORS.white} strokeWidth={1.75} />}
        label={t('actions.copy', { defaultValue: 'Copy' })}
        onPress={handleCopy}
      />
      {isOwn && (
        <ActionRow
          icon={<Pencil size={20} color={COLORS.white} strokeWidth={1.75} />}
          label={t('actions.edit', { defaultValue: 'Edit' })}
          onPress={() => {
            onClose();
            onEdit();
          }}
        />
      )}
      {isOwn && (
        <ActionRow
          icon={<Trash2 size={20} color="#EF4444" strokeWidth={1.75} />}
          label={t('actions.delete', { defaultValue: 'Delete' })}
          onPress={() => {
            onClose();
            onDelete();
          }}
          destructive
        />
      )}
    </BottomSheet>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={[styles.label, destructive && styles.labelDestructive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const MessageActionSheet = memo(MessageActionSheetInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  label: {
    color: COLORS.white,
    fontFamily: 'Archivo_500Medium',
    fontSize: 16,
  },
  labelDestructive: {
    color: '#EF4444',
  },
});
