import { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCreatePostStore } from '@/stores/createPostStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { PostTypeSelector } from '@/features/feed/components/create/PostTypeSelector';
import {
  MediaPicker,
  type PickedMedia,
} from '@/features/feed/components/create/MediaPicker';
import { PostPreview } from '@/features/feed/components/create/PostPreview';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import type { PostType } from '@/types/post';

type Step = 'type' | 'media' | 'caption' | 'preview';

export default function CreatePostScreen() {
  const { t } = useTranslation('feed');
  const [step, setStep] = useState<Step>('type');
  const [postType, setPostType] = useState<PostType | null>(null);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [poemText, setPoemText] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const { createPost, isCreating } = useCreatePost();
  const pendingAudio = useCreatePostStore((s) => s.pendingAudio);
  const clearPendingAudio = useCreatePostStore((s) => s.clearPendingAudio);

  // Pick up exported audio from the project editor (any context)
  useFocusEffect(
    useCallback(() => {
      if (pendingAudio) {
        setPostType('audio');
        setStep('media');
        setMedia([
          {
            uri: pendingAudio.uri,
            fileName: pendingAudio.fileName,
            mimeType: 'audio/wav',
            duration: pendingAudio.durationMs / 1000,
          },
        ]);
        clearPendingAudio();
      }
    }, [pendingAudio, clearPendingAudio])
  );

  const canProceed = () => {
    if (step === 'type') return postType !== null;
    if (step === 'media') {
      if (postType === 'text') return poemText.trim().length > 0;
      return media.length > 0;
    }
    if (step === 'caption') return true;
    return true;
  };

  const nextStep = () => {
    if (step === 'type' && postType === 'text') {
      setStep('media'); // Goes to poem text editor
    } else if (step === 'type') {
      setStep('media');
    } else if (step === 'media') {
      if (postType === 'text') {
        setStep('preview'); // Skip caption for poems
      } else {
        setStep('caption');
      }
    } else if (step === 'caption') {
      setStep('preview');
    }
  };

  const prevStep = () => {
    if (step === 'media') setStep('type');
    else if (step === 'caption') setStep('media');
    else if (step === 'preview') {
      if (postType === 'text') setStep('media');
      else setStep('caption');
    }
  };

  const handlePublish = async () => {
    if (!postType) return;
    try {
      await createPost({
        postType,
        media,
        caption,
        poemText,
        onProgress: setUploadProgress,
      });
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert(t('create.errorTitle'), message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={step === 'type' ? () => router.back() : prevStep}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text variant="h2" style={styles.headerTitle}>
          {t('create.headerTitle')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.steps}>
        {(['type', 'media', 'caption', 'preview'] as Step[])
          .filter((s) => !(postType === 'text' && s === 'caption'))
          .map((s, i, arr) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                (step === s ||
                  arr.indexOf(step as Step) > i ||
                  (step === 'preview' && s !== 'preview')) &&
                  styles.stepDotActive,
              ]}
            />
          ))}
      </View>

      {/* Content */}
      <View style={styles.body}>
        {step === 'type' && (
          <PostTypeSelector selected={postType} onSelect={setPostType} />
        )}

        {step === 'media' && postType && (
          <MediaPicker
            postType={postType}
            media={media}
            onMediaChange={setMedia}
            poemText={poemText}
            onPoemTextChange={setPoemText}
          />
        )}

        {step === 'caption' && (
          <View style={styles.captionContainer}>
            <Text variant="h2" style={styles.sectionTitle}>
              {t('create.captionStepTitle')}
            </Text>
            <TextInput
              style={styles.captionInput}
              placeholder={t('create.captionPlaceholder')}
              placeholderTextColor="#555"
              multiline
              value={caption}
              onChangeText={setCaption}
              autoFocus
              maxLength={2200}
            />
            <Text variant="caption" style={styles.charCount}>
              {caption.length}/2200
            </Text>
          </View>
        )}

        {step === 'preview' && postType && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <PostPreview
              postType={postType}
              media={media}
              caption={caption}
              poemText={poemText}
            />
          </ScrollView>
        )}
      </View>

      {/* Bottom action — slides up with keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        {isCreating ? (
          <View style={styles.publishingBar}>
            <ActivityIndicator color="#FFF" />
            <Text variant="body" style={styles.publishingText}>
              {t('create.uploadingText', { progress: Math.round(uploadProgress * 100) })}
            </Text>
          </View>
        ) : (
          <View style={styles.bottomBar}>
            {step === 'preview' ? (
              <TouchableOpacity
                style={[styles.publishButton, !canProceed() && styles.buttonDisabled]}
                onPress={handlePublish}
                disabled={!canProceed()}
                activeOpacity={0.7}
              >
                <Text variant="body" style={styles.publishText}>
                  {t('create.publishButton')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextButton, !canProceed() && styles.buttonDisabled]}
                onPress={nextStep}
                disabled={!canProceed()}
                activeOpacity={0.7}
              >
                <Text variant="body" style={styles.nextText}>
                  {t('create.nextButton')}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#000" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardStickyView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 16,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  stepDotActive: {
    backgroundColor: '#FFF',
  },
  body: {
    flex: 1,
  },
  captionContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    flex: 1,
  },
  sectionTitle: {
    textAlign: 'center',
    marginBottom: 16,
  },
  captionInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
    textAlignVertical: 'top',
    lineHeight: 24,
  },
  charCount: {
    color: '#666',
    textAlign: 'right',
    marginTop: 8,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  nextButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextText: {
    color: '#000',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
  },
  publishButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishText: {
    color: '#000',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  publishingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  publishingText: {
    color: '#CCC',
  },
});
