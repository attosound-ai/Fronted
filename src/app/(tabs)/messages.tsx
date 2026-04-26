import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { MessageSquare } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { ConversationList, ChatScreen } from '@/features/messages';
import { ResponsiveContentWrapper } from '@/components/layout/ResponsiveContentWrapper';
import { Text } from '@/components/ui/Text';

const CHAT_SIDEBAR_WIDTH = 350;

interface SelectedChat {
  conversationId: string;
  participantName: string;
  participantId: string;
}

function EmptyChatState() {
  const { t } = useTranslation('messages');
  return (
    <View style={styles.emptyState}>
      <MessageSquare size={48} color="#333" strokeWidth={1.5} />
      <Text variant="h2" style={styles.emptyTitle}>
        {t('splitView.emptyTitle', { defaultValue: 'Your Messages' })}
      </Text>
      <Text variant="body" style={styles.emptySubtitle}>
        {t('splitView.emptySubtitle', {
          defaultValue: 'Select a conversation to start chatting',
        })}
      </Text>
    </View>
  );
}

export default function MessagesScreen() {
  const { isTablet } = useDeviceLayout();
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);

  const handleSelectConversation = useCallback(
    (conversationId: string, participantName: string, participantId: string) => {
      setSelectedChat({ conversationId, participantName, participantId });
    },
    []
  );

  if (!isTablet) {
    return (
      <ResponsiveContentWrapper>
        <ConversationList />
      </ResponsiveContentWrapper>
    );
  }

  return (
    <View style={styles.splitContainer}>
      <View style={styles.sidebar}>
        <ConversationList
          selectedConversationId={selectedChat?.conversationId}
          onSelectConversation={handleSelectConversation}
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.detail}>
        {selectedChat ? (
          <ChatScreen
            key={selectedChat.conversationId}
            conversationId={selectedChat.conversationId}
            participantName={selectedChat.participantName}
            participantId={selectedChat.participantId}
            inline
          />
        ) : (
          <EmptyChatState />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  sidebar: {
    width: CHAT_SIDEBAR_WIDTH,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
  },
  detail: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: '#FFF',
    marginTop: 8,
  },
  emptySubtitle: {
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
