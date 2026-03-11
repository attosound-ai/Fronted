import { View, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import type { FeedPost } from '@/types/post';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  post: FeedPost;
}

export function ShareSheet({ visible, onClose, post }: ShareSheetProps) {
  const { t } = useTranslation('feed');
  const postUrl = `https://atto.sound/post/${post.id}`;

  const handleShareExternal = () => {
    onClose();
    // Wait for the Modal dismiss animation (~300ms) before presenting
    // the native share sheet — iOS blocks two overlapping presentations.
    const message = post.description ? `${post.description}\n\n${postUrl}` : postUrl;
    setTimeout(() => {
      Share.share({ message }).catch(() => {});
    }, 350);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(postUrl);
    showToast(t('post.linkCopied'));
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('post.share')}>
      <TouchableOpacity style={styles.option} onPress={handleShareExternal}>
        <View style={styles.iconCircle}>
          <Ionicons name="share-outline" size={22} color="#FFF" />
        </View>
        <View style={styles.textContainer}>
          <Text variant="body" style={styles.optionTitle}>
            {t('post.shareToLabel')}
          </Text>
          <Text variant="caption" style={styles.optionSubtitle}>
            {t('post.shareToSubtitle')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.option} onPress={handleCopyLink}>
        <View style={styles.iconCircle}>
          <Ionicons name="link-outline" size={22} color="#FFF" />
        </View>
        <View style={styles.textContainer}>
          <Text variant="body" style={styles.optionTitle}>
            {t('post.copyLink')}
          </Text>
          <Text variant="caption" style={styles.optionSubtitle}>
            {t('post.copyLinkSubtitle')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
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
