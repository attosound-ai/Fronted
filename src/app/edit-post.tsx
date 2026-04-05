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

const MAX_CHARS = 2200;

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { t } = useTranslation('feed');
  const user = useAuthStore((s) => s.user);
  const { editPost, isEditing } = useEditPost();

  const [textContent, setTextContent] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load current post data
  useEffect(() => {
    if (!postId) return;
    feedService
      .getPost(postId)
      .then((post) => {
        const text = post.textContent ?? post.content ?? '';
        setTextContent(text);
        setOriginalText(text);
      })
      .catch(() => {
        Alert.alert('Error', 'Could not load post');
        router.back();
      })
      .finally(() => setIsLoading(false));
  }, [postId]);

  const hasChanges = textContent !== originalText;
  const charCount = textContent.length;

  const handleSave = () => {
    if (!postId || !hasChanges) return;
    editPost({ postId, textContent });
    router.back();
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
          Edit Post
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
            fallbackText={user?.displayName}
            size="sm"
            style={styles.avatar}
          />
          <TextInput
            style={styles.textInput}
            multiline
            value={textContent}
            onChangeText={setTextContent}
            maxLength={MAX_CHARS}
            autoFocus
            placeholderTextColor="#666666"
          />
        </View>
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
    backgroundColor: '#000000',
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
