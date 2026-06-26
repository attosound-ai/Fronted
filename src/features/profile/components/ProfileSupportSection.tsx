import { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LifeBuoy, Send } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';

import { ProfileSection } from './ProfileSection';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuthStore } from '@/stores/authStore';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

type Category = 'bug' | 'feedback' | 'question';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'bug', label: 'Bug' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'question', label: 'Question' },
];

/**
 * ProfileSupportSection — a single support form that fans out to BOTH:
 *  - Sentry (User Feedback, so it lands next to crash/error context), and
 *  - PostHog (a `profile_support_submitted` event with the message, so product
 *    can triage/segment it alongside analytics).
 *
 * Replaces the old floating bug-report button.
 */
export function ProfileSupportSection() {
  const { t } = useTranslation('profile');
  const user = useAuthStore((s) => s.user);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [category, setCategory] = useState<Category>('feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const openSheet = () => {
    analytics.capture(ANALYTICS_EVENTS.PROFILE.SUPPORT_OPENED);
    setSheetVisible(true);
  };

  const closeSheet = () => {
    setSheetVisible(false);
    // Reset after the sheet's close animation so it doesn't flicker.
    setTimeout(() => {
      setMessage('');
      setDone(false);
      setCategory('feedback');
    }, 300);
  };

  const handleSubmit = () => {
    const text = message.trim();
    if (!text || submitting) return;
    setSubmitting(true);

    const email = user?.email || undefined;
    const name = user?.displayName || user?.username || undefined;

    try {
      // → Sentry User Feedback
      Sentry.captureFeedback({
        message: `[${category}] ${text}`,
        name,
        email,
      });
    } catch {
      // ignore — PostHog below still records it
    }

    // → PostHog (include the message so the team sees it in both tools)
    analytics.capture(ANALYTICS_EVENTS.PROFILE.SUPPORT_SUBMITTED, {
      category,
      message: text,
      message_length: text.length,
      email: email ?? null,
      username: user?.username ?? null,
    });

    setSubmitting(false);
    setDone(true);
  };

  const canSubmit = message.trim().length > 0 && !submitting;

  return (
    <ProfileSection title={t('support.sectionTitle', { defaultValue: 'Support' })}>
      <Text variant="body" style={styles.intro}>
        {t('support.intro', {
          defaultValue:
            'Need help or have feedback? Send us a message and our team will take a look.',
        })}
      </Text>

      <TouchableOpacity style={styles.cta} activeOpacity={0.8} onPress={openSheet}>
        <LifeBuoy size={18} color="#FFF" strokeWidth={2.25} />
        <Text style={styles.ctaText}>
          {t('support.contactButton', { defaultValue: 'Contact support' })}
        </Text>
      </TouchableOpacity>

      <BottomSheet
        visible={sheetVisible}
        onClose={closeSheet}
        title={t('support.sheetTitle', { defaultValue: 'Contact support' })}
      >
        {done ? (
          <View style={styles.doneWrap}>
            <Text style={styles.doneTitle}>
              {t('support.thanksTitle', { defaultValue: 'Thank you!' })}
            </Text>
            <Text style={styles.doneBody}>
              {t('support.thanksBody', {
                defaultValue: 'We received your message and will get back to you soon.',
              })}
            </Text>
            <TouchableOpacity
              style={styles.submit}
              onPress={closeSheet}
              activeOpacity={0.85}
            >
              <Text style={styles.submitText}>
                {t('support.close', { defaultValue: 'Close' })}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => {
                const active = c.key === category;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    activeOpacity={0.8}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(`support.category.${c.key}`, { defaultValue: c.label })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              placeholder={t('support.placeholder', {
                defaultValue: 'Describe your issue or feedback…',
              })}
              placeholderTextColor="#666"
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />

            <TouchableOpacity
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Send size={16} color="#000" strokeWidth={2.5} />
                  <Text style={styles.submitText}>
                    {t('support.submit', { defaultValue: 'Send' })}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>
    </ProfileSection>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: '#888888',
    lineHeight: 20,
    marginBottom: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 9999,
    paddingVertical: 10,
  },
  ctaText: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  form: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 14,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#333',
  },
  chipActive: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
  },
  chipText: {
    color: '#AAA',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#000',
  },
  input: {
    minHeight: 130,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    borderRadius: 9999,
    paddingVertical: 14,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#000',
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
  },
  doneWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
    alignItems: 'center',
  },
  doneTitle: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
  },
  doneBody: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
});
