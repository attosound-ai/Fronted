import { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedProps,
  useDerivedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BottomSheet, useBottomSheetScroll } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { useComments, type Comment } from '../../hooks/useComments';
import { usePostChannel } from '../../hooks/usePostChannel';
import { CommentItem } from './CommentItem';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface CommentsSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
}

export function CommentsSheet({ visible, onClose, postId }: CommentsSheetProps) {
  const { t } = useTranslation('feed');
  const {
    comments,
    isLoading,
    isFetchingMore,
    hasMore,
    loadMore,
    addComment,
    isAddingComment,
  } = useComments(postId);

  usePostChannel(visible ? postId : null);

  const sheetScroll = useBottomSheetScroll();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (sheetScroll) {
        sheetScroll.contentScrollY.value = event.contentOffset.y;
      }
    },
  });

  const scrollEnabled = useDerivedValue(() => {
    return sheetScroll ? !sheetScroll.isDragging.value : true;
  });

  const animatedScrollProps = useAnimatedProps(() => ({
    scrollEnabled: scrollEnabled.value,
  }));

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Fire-and-forget: optimistic update handles UI instantly
    addComment(trimmed, replyTo?.id);
    setText('');
    setReplyTo(null);
  };

  const handleReply = (commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    inputRef.current?.focus();
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <CommentItem comment={item} onReply={handleReply} />
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('post.comments')}>
      <View style={styles.listContainer}>
        {isLoading ? (
          <ActivityIndicator color="#FFF" style={styles.loader} />
        ) : comments.length === 0 ? (
          <Text variant="body" style={styles.empty}>
            {t('post.noCommentsYet')}
          </Text>
        ) : (
          <Animated.FlatList
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item: Comment) => item.id}
            onEndReached={() => hasMore && loadMore()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetchingMore ? <ActivityIndicator color="#FFF" size="small" /> : null
            }
            showsVerticalScrollIndicator={false}
            style={styles.list}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            animatedProps={animatedScrollProps}
          />
        )}
      </View>

      {/* Reply indicator */}
      {replyTo && (
        <View style={styles.replyBar}>
          <Text variant="caption" style={styles.replyText}>
            {t('post.replyingTo', { username: replyTo.username })}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#999" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={t('post.addCommentPlaceholder')}
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || isAddingComment}
          hitSlop={8}
        >
          {isAddingComment ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="send" size={22} color={text.trim() ? '#FFFFFF' : '#555'} />
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    maxHeight: SCREEN_HEIGHT * 0.4,
    minHeight: 100,
  },
  list: {
    flexGrow: 0,
  },
  loader: {
    paddingVertical: 40,
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 40,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  replyText: {
    color: '#999',
    fontSize: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
    maxHeight: 80,
    paddingVertical: 8,
  },
});
