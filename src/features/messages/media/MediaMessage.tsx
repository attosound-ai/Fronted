import { memo, useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, Phone, UserRound, Volume2, VolumeX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/theme';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { VoiceNoteBubble } from './VoiceNoteBubble';
import { VideoMessagePlayer } from '../components/VideoMessagePlayer';
import { SharedPostCard } from './SharedPostCard';
import type { AttoMessage } from '../utils/messageAdapter';

/** Widest a media bubble gets; WhatsApp and Telegram sit around 240 pt. */
export const MEDIA_WIDTH = 236;
const VIDEO_NOTE_SIZE = 220;

interface MediaMessageProps {
  message: AttoMessage;
  isOwn: boolean;
}

/**
 * The body of a non text message: photo, video, round video note, voice
 * note, file or contact. Text messages never reach this component.
 */
function MediaMessageInner({ message, isOwn }: MediaMessageProps) {
  const { t } = useTranslation('messages');
  const url = message.text;
  const meta = message.metadata ?? {};

  switch (message.contentType) {
    case 'image': {
      const ratio =
        meta.width && meta.height
          ? Math.max(0.5, Math.min(2, meta.width / meta.height))
          : 1;
      return (
        <Pressable
          onPress={() => {
            analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_OPENED, { kind: 'image' });
            void Linking.openURL(url);
          }}
          accessibilityRole="imagebutton"
          accessibilityLabel={t('media.previewImage')}
        >
          <Image
            source={{ uri: url }}
            style={[styles.image, { height: Math.round(MEDIA_WIDTH / ratio) }]}
            resizeMode="cover"
          />
        </Pressable>
      );
    }
    case 'video':
      return (
        <View style={styles.video}>
          <VideoMessagePlayer videoUrl={message.video ?? url} />
        </View>
      );
    case 'video_note':
      return <VideoNote url={url} />;
    case 'post': {
      const post = meta.post;
      if (!post) return null;
      return (
        <SharedPostCard
          post={post}
          caption={typeof meta.caption === 'string' ? meta.caption : null}
          onLight={isOwn}
        />
      );
    }
    case 'audio':
      return (
        <View style={styles.audio}>
          <VoiceNoteBubble url={url} metadata={message.metadata} onLight={isOwn} />
        </View>
      );
    case 'file':
      return (
        <Pressable
          style={styles.fileRow}
          onPress={() => {
            analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_OPENED, { kind: 'file' });
            void Linking.openURL(url);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('media.previewFile')}
        >
          <View style={[styles.fileIcon, isOwn && styles.fileIconOwn]}>
            <FileText
              size={22}
              color={isOwn ? COLORS.black : COLORS.white}
              strokeWidth={2}
            />
          </View>
          <View style={styles.fileBody}>
            <Text style={[styles.fileName, isOwn && styles.textOwn]} numberOfLines={1}>
              {meta.fileName || t('media.previewFile')}
            </Text>
            <Text style={[styles.fileMeta, isOwn && styles.textOwnDim]}>
              {formatBytes(meta.bytes)}
            </Text>
          </View>
        </Pressable>
      );
    case 'contact': {
      const contact = (meta.contact ?? safeJson(url)) as {
        name?: string;
        phone?: string;
        email?: string;
      };
      return (
        <Pressable
          style={styles.fileRow}
          onPress={() => {
            analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_OPENED, {
              kind: 'contact',
            });
            if (contact.phone) void Linking.openURL(`tel:${contact.phone}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('media.previewContact')}
        >
          <View style={[styles.fileIcon, isOwn && styles.fileIconOwn]}>
            <UserRound
              size={22}
              color={isOwn ? COLORS.black : COLORS.white}
              strokeWidth={2}
            />
          </View>
          <View style={styles.fileBody}>
            <Text style={[styles.fileName, isOwn && styles.textOwn]} numberOfLines={1}>
              {contact.name || t('media.previewContact')}
            </Text>
            {contact.phone ? (
              <View style={styles.phoneRow}>
                <Phone
                  size={12}
                  color={isOwn ? 'rgba(0,0,0,0.55)' : '#AAA'}
                  strokeWidth={2}
                />
                <Text style={[styles.fileMeta, isOwn && styles.textOwnDim]}>
                  {contact.phone}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    }
    default:
      return null;
  }
}

export const MediaMessage = memo(MediaMessageInner);

/**
 * Telegram and WhatsApp round video note: a circle that plays on its own,
 * muted; tapping it turns the sound on.
 */
function VideoNote({ url }: { url: string }) {
  const { t } = useTranslation('messages');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [VideoModule, setVideoModule] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    import('expo-video')
      .then((mod) => {
        if (!cancelled) setVideoModule(mod);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!VideoModule) return <View style={styles.videoNote} />;
  return (
    <VideoNoteInner
      VideoModule={VideoModule}
      url={url}
      label={t('media.previewVideoNote')}
    />
  );
}

function VideoNoteInner({
  VideoModule,
  url,
  label,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VideoModule: any;
  url: string;
  label: string;
}) {
  const { VideoView, useVideoPlayer } = VideoModule;
  const [muted, setMuted] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player = useVideoPlayer(url, (p: any) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const toggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_OPENED, {
      kind: 'video_note',
      muted: next,
    });
  }, [muted, player]);
  return (
    <Pressable
      onPress={toggle}
      style={styles.videoNote}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <View style={styles.videoNoteBadge}>
        {muted ? (
          <VolumeX size={14} color={COLORS.white} strokeWidth={2.25} />
        ) : (
          <Volume2 size={14} color={COLORS.white} strokeWidth={2.25} />
        )}
      </View>
    </Pressable>
  );
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  image: {
    width: MEDIA_WIDTH,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  video: { width: MEDIA_WIDTH, borderRadius: 14, overflow: 'hidden' },
  videoNote: {
    width: VIDEO_NOTE_SIZE,
    height: VIDEO_NOTE_SIZE,
    borderRadius: VIDEO_NOTE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  videoNoteBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audio: { minWidth: 220 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
    paddingVertical: 2,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconOwn: { backgroundColor: 'rgba(0,0,0,0.1)' },
  fileBody: { flexShrink: 1 },
  fileName: { color: COLORS.white, fontSize: 15, fontFamily: 'Archivo_600SemiBold' },
  fileMeta: { color: '#AAA', fontSize: 12, fontFamily: 'Archivo_400Regular' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  textOwn: { color: COLORS.black },
  textOwnDim: { color: 'rgba(0,0,0,0.55)' },
});
