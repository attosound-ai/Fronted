import { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCreatePostStore } from '@/stores/createPostStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { X, Images, Video, Film, Music, Camera, FolderOpen } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ComposeMediaPreview } from '@/features/feed/components/create/ComposeMediaPreview';
import { ProjectPickerSheet } from '@/features/projects/components/ProjectPickerSheet';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import { useMediaPickers } from '@/features/feed/hooks/useMediaPickers';
import { haptic } from '@/lib/haptics/hapticService';
import type { PostType } from '@/types/post';
import type { PickedMedia } from '@/features/feed/types';

const MAX_CHARS = 2200;

function ToolbarButton({
  Icon,
  label,
  active,
  disabled,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const color = active ? '#FFFFFF' : disabled ? '#333333' : '#888888';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={styles.toolbarIcon}
      activeOpacity={0.6}
    >
      <Icon size={20} color={color} strokeWidth={2.25} />
      <Text
        style={[styles.toolbarLabel, { color }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.0}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function CreatePostScreen() {
  const { t } = useTranslation('feed');
  const user = useAuthStore((s) => s.user);
  const hasRecordUpload = useSubscriptionStore((s) => s.hasEntitlement('record_upload'));
  const canPublishAudio = user?.role === 'creator' && hasRecordUpload;

  const [textContent, setTextContent] = useState('');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [attachmentType, setAttachmentType] = useState<PostType | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [sourceSheet, setSourceSheet] = useState<PostType | null>(null);

  const { createPost, isCreating } = useCreatePost();
  const {
    pickImages,
    pickMoreImages,
    takePhoto,
    recordVideo,
    pickVideo,
    pickReel,
    pickDocumentImages,
    pickDocumentVideo,
    pickDocumentAudio,
  } = useMediaPickers();
  const pendingAudio = useCreatePostStore((s) => s.pendingAudio);
  const clearPendingAudio = useCreatePostStore((s) => s.clearPendingAudio);

  // Pick up exported audio from the project editor
  useFocusEffect(
    useCallback(() => {
      if (pendingAudio) {
        setAttachmentType('audio');
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

  const clearAttachment = () => {
    setMedia([]);
    setAttachmentType(null);
  };

  const confirmReplaceAttachment = (action: () => void) => {
    if (media.length > 0) {
      Alert.alert('', 'Replace current attachment?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          onPress: () => {
            clearAttachment();
            action();
          },
        },
      ]);
    } else {
      action();
    }
  };

  // ── Attachment handlers ──

  const handlePickPhoto = () => {
    if (attachmentType && attachmentType !== 'image') {
      confirmReplaceAttachment(() => setSourceSheet('image'));
    } else {
      setSourceSheet('image');
    }
  };

  const handlePickVideo = () => {
    confirmReplaceAttachment(() => setSourceSheet('video'));
  };

  const handlePickReel = () => {
    confirmReplaceAttachment(() => setSourceSheet('reel'));
  };

  const handlePickProject = () => {
    confirmReplaceAttachment(() => setSourceSheet('audio'));
  };

  // ── Source choice handlers ──

  const handleSourceGallery = () => {
    const type = sourceSheet;
    setSourceSheet(null);
    setTimeout(async () => {
      if (type === 'image') {
        if (attachmentType === 'image') {
          const updated = await pickMoreImages(media);
          if (updated) setMedia(updated);
        } else {
          const picked = await pickImages();
          if (picked) {
            setAttachmentType('image');
            setMedia(picked);
          }
        }
      } else if (type === 'video') {
        const picked = await pickVideo();
        if (picked) {
          setAttachmentType('video');
          setMedia([picked]);
        }
      } else if (type === 'reel') {
        const picked = await pickReel(false);
        if (picked) {
          setAttachmentType('reel');
          setMedia([picked]);
        }
      }
    }, 400);
  };

  const handleSourceCamera = () => {
    const type = sourceSheet;
    setSourceSheet(null);
    setTimeout(async () => {
      if (type === 'image') {
        const picked = await takePhoto();
        if (picked) {
          if (attachmentType === 'image') {
            setMedia([...media, ...picked]);
          } else {
            setAttachmentType('image');
            setMedia(picked);
          }
        }
      } else if (type === 'video') {
        const picked = await recordVideo();
        if (picked) {
          setAttachmentType('video');
          setMedia([picked]);
        }
      } else if (type === 'reel') {
        const picked = await pickReel(true);
        if (picked) {
          setAttachmentType('reel');
          setMedia([picked]);
        }
      }
    }, 400);
  };

  const handleSourceFiles = () => {
    const type = sourceSheet;
    setSourceSheet(null);
    setTimeout(async () => {
      if (type === 'image') {
        const picked = await pickDocumentImages();
        if (picked) {
          if (attachmentType === 'image') {
            const remaining = 10 - media.length;
            setMedia([...media, ...picked.slice(0, remaining)]);
          } else {
            setAttachmentType('image');
            setMedia(picked.slice(0, 10));
          }
        }
      } else if (type === 'video') {
        const picked = await pickDocumentVideo();
        if (picked) {
          setAttachmentType('video');
          setMedia([picked]);
        }
      } else if (type === 'reel') {
        const picked = await pickDocumentVideo();
        if (picked) {
          setAttachmentType('reel');
          setMedia([picked]);
        }
      } else if (type === 'audio') {
        const picked = await pickDocumentAudio();
        if (picked) {
          setAttachmentType('audio');
          setMedia([picked]);
        }
      }
    }, 400);
  };

  const handleSourceProject = () => {
    setSourceSheet(null);
    setProjectPickerVisible(true);
  };

  const handleAddMoreImages = async () => {
    const updated = await pickMoreImages(media);
    if (updated) setMedia(updated);
  };

  const handleRemoveMedia = (index: number) => {
    const updated = media.filter((_, i) => i !== index);
    if (updated.length === 0) {
      clearAttachment();
    } else {
      setMedia(updated);
    }
  };

  // ── Publish ──

  const canPost = textContent.trim().length > 0 || media.length > 0;

  const handlePost = async () => {
    if (!canPost) return;
    haptic('light');

    const postType: PostType = attachmentType ?? 'text';
    const isTextOnly = postType === 'text';

    try {
      await createPost({
        postType,
        media,
        caption: isTextOnly ? '' : textContent,
        poemText: isTextOnly ? textContent : '',
        onProgress: setUploadProgress,
      });
      router.replace('/(tabs)/'); // Explicit index route to land on feed tab
      // Scroll feed to top and show published banner after navigation settles
      setTimeout(() => {
        DeviceEventEmitter.emit('feedScrollToTop');
        const { showPostPublished } = require('@/components/ui/PostPublishedBanner');
        showPostPublished();
      }, 400);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert(t('create.errorTitle'), message);
    }
  };

  const charCount = textContent.length;
  const nearLimit = charCount > MAX_CHARS - 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <X size={24} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.postButton, !canPost && styles.postButtonDisabled]}
          onPress={handlePost}
          disabled={!canPost || isCreating}
          activeOpacity={0.7}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Text
              style={styles.postButtonText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              {t('create.postButton')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Upload progress */}
      {isCreating && uploadProgress > 0 && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(uploadProgress * 100)}%` },
            ]}
          />
        </View>
      )}

      {/* Compose body */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.composeRow}>
          <Avatar
            uri={user?.avatar}
            fallbackText={user?.username}
            size="sm"
            style={styles.avatar}
          />
          <TextInput
            style={styles.textInput}
            placeholder={t('create.placeholder')}
            placeholderTextColor="#666666"
            multiline
            value={textContent}
            onChangeText={setTextContent}
            maxLength={MAX_CHARS}
            autoFocus
            maxFontSizeMultiplier={1.0}
          />
        </View>

        {/* Inline media preview */}
        {attachmentType && media.length > 0 && (
          <ComposeMediaPreview
            attachmentType={attachmentType}
            media={media}
            onRemoveMedia={handleRemoveMedia}
            onAddMore={handleAddMoreImages}
          />
        )}
      </ScrollView>

      {/* Attachment toolbar — sticky above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarIcons}>
            <ToolbarButton
              Icon={Images}
              label={t('create.attachPhoto')}
              active={attachmentType === 'image'}
              disabled={attachmentType !== null && attachmentType !== 'image'}
              onPress={handlePickPhoto}
            />
            <ToolbarButton
              Icon={Video}
              label={t('create.attachVideo')}
              active={attachmentType === 'video'}
              disabled={attachmentType !== null && attachmentType !== 'video'}
              onPress={handlePickVideo}
            />
            <ToolbarButton
              Icon={Film}
              label={t('create.attachReel')}
              active={attachmentType === 'reel'}
              disabled={attachmentType !== null && attachmentType !== 'reel'}
              onPress={handlePickReel}
            />
            {canPublishAudio && (
              <ToolbarButton
                Icon={Music}
                label={t('create.attachProject')}
                active={attachmentType === 'audio'}
                disabled={attachmentType !== null && attachmentType !== 'audio'}
                onPress={handlePickProject}
              />
            )}
          </View>

          <Text
            variant="small"
            style={[styles.charCount, nearLimit && styles.charCountWarn]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.0}
          >
            {charCount}/{MAX_CHARS}
          </Text>
        </View>
      </KeyboardStickyView>

      {/* Source picker sheet */}
      <BottomSheet
        visible={sourceSheet !== null}
        onClose={() => setSourceSheet(null)}
        title={
          sourceSheet === 'image'
            ? t('create.attachPhoto')
            : sourceSheet === 'video'
              ? t('create.attachVideo')
              : sourceSheet === 'reel'
                ? t('create.attachReel')
                : sourceSheet === 'audio'
                  ? t('create.attachProject')
                  : ''
        }
      >
        <View style={styles.reelOptions}>
          {/* Gallery — photo, video, reel */}
          {sourceSheet !== 'audio' && (
            <TouchableOpacity
              style={[styles.reelOption, styles.reelOptionPrimary]}
              onPress={handleSourceGallery}
              activeOpacity={0.7}
            >
              <Images size={20} color="#000000" strokeWidth={2.25} />
              <Text
                style={styles.reelOptionPrimaryText}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {t('create.fromGallery')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Camera — photo, video, reel */}
          {(sourceSheet === 'image' ||
            sourceSheet === 'video' ||
            sourceSheet === 'reel') && (
            <TouchableOpacity
              style={styles.reelOption}
              onPress={handleSourceCamera}
              activeOpacity={0.7}
            >
              <Camera size={20} color="#FFFFFF" strokeWidth={2.25} />
              <Text
                style={styles.reelOptionText}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {sourceSheet === 'image'
                  ? t('create.takePhoto', { defaultValue: 'Camera' })
                  : sourceSheet === 'video'
                    ? t('create.recordVideo', { defaultValue: 'Record' })
                    : t('create.reelRecord')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Open Project — audio only */}
          {sourceSheet === 'audio' && (
            <TouchableOpacity
              style={[styles.reelOption, styles.reelOptionPrimary]}
              onPress={handleSourceProject}
              activeOpacity={0.7}
            >
              <Music size={20} color="#000000" strokeWidth={2.25} />
              <Text
                style={styles.reelOptionPrimaryText}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {t('create.fromProject')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Files — all types */}
          <TouchableOpacity
            style={styles.reelOption}
            onPress={handleSourceFiles}
            activeOpacity={0.7}
          >
            <FolderOpen size={20} color="#FFFFFF" strokeWidth={2.25} />
            <Text
              style={styles.reelOptionText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              {t('create.fromFiles')}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Project picker sheet */}
      <ProjectPickerSheet
        visible={projectPickerVisible}
        onClose={() => setProjectPickerVisible(false)}
        onSelect={(projectId) => {
          setProjectPickerVisible(false);
          router.push(`/project/${projectId}?mode=publish`);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  postButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  postButtonDisabled: {
    opacity: 0.3,
  },
  postButtonText: {
    color: '#000000',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  progressBar: {
    height: 2,
    backgroundColor: '#222222',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#FFFFFF',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
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
    includeFontPadding: false,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#222222',
  },
  toolbarIcons: {
    flexDirection: 'row',
    gap: 20,
  },
  toolbarIcon: {
    alignItems: 'center',
    gap: 3,
    padding: 4,
  },
  toolbarLabel: {
    fontSize: 10,
    fontFamily: 'Archivo_500Medium',
  },
  charCount: {
    color: '#666666',
  },
  charCountWarn: {
    color: '#FFFFFF',
  },
  reelOptions: {
    gap: 16,
    paddingVertical: 8,
  },
  reelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 100,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  reelOptionPrimary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  reelOptionPrimaryText: {
    color: '#000000',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  reelOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
});
