import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SendToChatRow } from './SendToChatRow';
import type { AttoMessage } from '../utils/messageAdapter';

interface ForwardSheetProps {
  message: AttoMessage | null;
  onClose: () => void;
}

/**
 * Slack's "Adelante", WhatsApp's forward: pick a chat and the same message
 * goes there, marked as forwarded.
 */
export function ForwardSheet({ message, onClose }: ForwardSheetProps) {
  const { t } = useTranslation('messages');
  if (!message) return null;
  return (
    <BottomSheet visible onClose={onClose} title={t('actions.forward')}>
      <View style={styles.body}>
        <SendToChatRow
          payload={{
            kind: 'forward',
            content: message.text,
            contentType: message.contentType ?? 'text',
            metadata: message.metadata,
          }}
          withNote={false}
          onSent={onClose}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
});
