import { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { feedService } from '@/features/feed/services/feedService';
import { useEditPost } from '@/features/feed/hooks/useEditPost';
import { useMentionComposer } from '@/features/feed/hooks/useMentionComposer';
import { MentionSuggestions } from '@/features/feed/components/create/MentionSuggestions';
import {
  editedTagMetadata,
  taggedFrom,
  type TaggedPerson,
} from '@/features/feed/utils/mentions';
import { COLORS } from '@/constants/theme';

const MAX_CHARS = 2200;

/** The tagged ids in order, to tell whether an edit changed who is tagged. */
function tagKey(people: TaggedPerson[]): string {
  return people.map((p) => p.id).join(',');
}

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { t } = useTranslation(['feed', 'common']);
  const user = useAuthStore((s) => s.user);
  const { editPostAsync, isEditing } = useEditPost();

  // The same @ list as New Post, so a name added while editing is picked, not
  // typed (Oct 27 2026: a hand typed @youngraybeatz opened nothing).
  const {
    text: textContent,
    tagged,
    mention,
    forcedCaret,
    inputRef,
    load,
    onChangeText,
    onSelectionChange,
    pickMention,
  } = useMentionComposer();
  const [originalText, setOriginalText] = useState('');
  const [originalTagged, setOriginalTagged] = useState<TaggedPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load current post data
  useEffect(() => {
    if (!postId) return;
    feedService
      .getPost(postId)
      .then((post) => {
        const text = post.textContent ?? post.content ?? '';
        const saved = taggedFrom(post.metadata);
        load(text, saved);
        setOriginalText(text);
        setOriginalTagged(saved);
      })
      .catch(() => {
        Alert.alert(t('common:errors.title'), t('edit.loadFailed'));
        router.back();
      })
      .finally(() => setIsLoading(false));
  }, [postId, load]);

  const hasChanges = textContent !== originalText;
  const charCount = textContent.length;

  const handleSave = async () => {
    if (!postId || !hasChanges || isEditing) return;
    try {
      // Await the backend write. Only navigate back on SUCCESS — previously we
      // fire-and-forgot and popped immediately, so a failed save (auth/5xx) looked
      // saved (optimistic flash) then silently reverted ("guarda pero no se refleja").
      // Tags only travel when they changed, so an edit of a post from before
      // tagging existed leaves its metadata alone.
      const tagsChanged = tagKey(tagged) !== tagKey(originalTagged);
      await editPostAsync({
        postId,
        textContent,
        ...(tagsChanged ? { metadata: editedTagMetadata(tagged) } : {}),
      });
      router.back();
    } catch {
      Alert.alert(
        t('common:errors.title'),
        t('edit.saveFailed', {
          defaultValue:
            'No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo.',
        })
      );
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <X size={24} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text variant="h3" style={styles.headerTitle}>
          {t('edit.headerTitle')}
        </Text>
        <TouchableOpacity
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || isEditing}
          activeOpacity={0.7}
        >
          {isEditing ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Check size={20} color="#000000" strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.composeRow}>
          <Avatar
            uri={user?.avatar}
            fallbackText={user?.username}
            size="sm"
            style={styles.avatar}
          />
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            multiline
            value={textContent}
            onChangeText={onChangeText}
            onSelectionChange={onSelectionChange}
            selection={forcedCaret}
            maxLength={MAX_CHARS}
            autoFocus
            placeholderTextColor="#666666"
          />
        </View>

        {mention ? (
          <View style={styles.mentionCard}>
            <MentionSuggestions
              query={mention.query}
              selfId={user ? String(user.id) : ''}
              onPick={pickMention}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Text
          variant="small"
          style={[styles.charCount, charCount > MAX_CHARS - 100 && styles.charCountWarn]}
        >
          {charCount}/{MAX_CHARS}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.3,
  },
  body: {
    flex: 1,
  },
  // Right under the caption, as in New Post.
  mentionCard: {
    marginTop: 2,
  },
  composeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 4,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Archivo_400Regular',
    lineHeight: 24,
    textAlignVertical: 'top',
    minHeight: 80,
    padding: 0,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#222222',
  },
  charCount: {
    color: '#666666',
  },
  charCountWarn: {
    color: '#FFFFFF',
  },
});
