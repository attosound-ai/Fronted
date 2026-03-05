import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/features/messages';

export default function ChatRoute() {
  const { conversationId, participantName, participantId } = useLocalSearchParams<{
    conversationId: string;
    participantName: string;
    participantId?: string;
  }>();

  return (
    <ChatScreen
      conversationId={conversationId ?? ''}
      participantName={participantName ?? ''}
      participantId={participantId}
    />
  );
}
