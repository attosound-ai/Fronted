import { View, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Share2, Link, ChevronRight } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import type { FeedPost } from '@/types/post';
import { SendToChatRow } from '@/features/messages/components/SendToChatRow';
import type { SharedPost } from '@/features/messages/types';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  post: FeedPost;
  onShareTracked?: () => void;
}

export function ShareSheet({ visible, onClose, post, onShareTracked }: ShareSheetProps) {
  const { t } = useTranslation('feed');
  const postUrl = `https://atto.sound/post/${post.id}`;

  const handleShareExternal = () => {
    onShareTracked?.();
    onClose();
    // Wait for the Modal dismiss animation (~300ms) before presenting
    // the native share sheet — iOS blocks two overlapping presentations.
    const message = post.description ? `${post.description}\n\n${postUrl}` : postUrl;
    setTimeout(() => {
      Share.share({ message }).catch(() => {});
    }, 350);
  };

  const handleCopyLink = async () => {
    onShareTracked?.();
    await Clipboard.setStringAsync(postUrl);
    showToast(t('post.linkCopied'));
    onClose();
  };

  // The post as a chat card carries only what the card draws.
  const sharedPost: SharedPost = {
    id: post.id,
    type: post.type,
    title: post.title,
    description: post.description,
    authorId: post.author?.id != null ? String(post.author.id) : undefined,
    authorName: post.author?.username,
    authorAvatar: post.author?.avatar ?? undefined,
    coverUrl: post.coverUrl,
    thumbnailUrl: post.thumbnailUrl,
    audioUrl: post.audioUrl,
    videoUrl: post.videoUrl,
    imageUrl: post.images?.[0],
    duration: post.duration,
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('post.share')}>
      {/* Chats first: sending a post to someone is what people reach for. */}
      <SendToChatRow post={sharedPost} onSent={() => onShareTracked?.()} />
      <TouchableOpacity style={styles.option} onPress={handleShareExternal}>
        <View style={styles.iconCircle}>
          <Share2 size={22} color="#FFF" strokeWidth={2.25} />
        </View>
        <View style={styles.textContainer}>
          <Text variant="body" style={styles.optionTitle}>
            {t('post.shareToLabel')}
          </Text>
          <Text variant="caption" style={styles.optionSubtitle}>
            {t('post.shareToSubtitle')}
          </Text>
        </View>
        <ChevronRight size={20} color="#555" strokeWidth={2.25} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.option} onPress={handleCopyLink}>
        <View style={styles.iconCircle}>
          <Link size={22} color="#FFF" strokeWidth={2.25} />
        </View>
        <View style={styles.textContainer}>
          <Text variant="body" style={styles.optionTitle}>
            {t('post.copyLink')}
          </Text>
          <Text variant="caption" style={styles.optionSubtitle}>
            {t('post.copyLinkSubtitle')}
          </Text>
        </View>
        <ChevronRight size={20} color="#555" strokeWidth={2.25} />
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
  },
  optionTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  optionSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
});
