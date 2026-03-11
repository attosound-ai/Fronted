import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StepProps } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';

/**
 * Step 7: What Happens Next
 * Informational step explaining consent verification and call recording
 *
 * Usage:
 * <StepWhatHappensNext state={state} dispatch={dispatch} onNext={handleNext} onBack={handleBack} />
 */
export const StepWhatHappensNext: React.FC<StepProps> = ({ onNext, onBack }) => {
  const { t } = useTranslation(['registration', 'common']);
  const callFeatures = t('whatHappensNext.callFeatures', {
    returnObjects: true,
  }) as string[];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <Text variant="h1" style={styles.title}>
            {t('whatHappensNext.title')}
          </Text>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          {/* Section 1: Verify Artist Consent */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('whatHappensNext.verifyConsentTitle')}
            </Text>
            <Text style={styles.paragraph}>
              {t('whatHappensNext.verifyConsentParagraph')}
            </Text>
          </View>

          {/* Section 2: How calls work */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('whatHappensNext.howCallsWorkTitle')}
            </Text>
            <Text style={styles.paragraph}>
              {t('whatHappensNext.howCallsWorkParagraph')}
            </Text>

            {/* Bullet points */}
            <View style={styles.bulletContainer}>
              {callFeatures.map((feature, index) => (
                <View key={index} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Highlighted info box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {(() => {
                const raw = t('whatHappensNext.recordingsPrivate');
                const match = raw.match(/^(.*?)<bold>(.*?)<\/bold>(.*)$/s);
                if (!match) return raw;
                return (
                  <>
                    {match[1]}
                    <Text style={styles.boldText}>{match[2]}</Text>
                    {match[3]}
                  </>
                );
              })()}
            </Text>
          </View>
        </View>

        {/* Spacer to push button to bottom */}
        <View style={styles.spacer} />
      </ScrollView>

      {/* Bottom button */}
      <View style={styles.footer}>
        <Button title={t('common:buttons.continue')} onPress={onNext} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  paragraph: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#CCCCCC',
  },
  bulletContainer: {
    marginTop: 8,
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#FFFFFF',
  },
  infoBox: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    padding: 16,
  },
  infoText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#CCCCCC',
  },
  boldText: {
    fontFamily: 'Archivo_600SemiBold',
    color: '#FFFFFF',
  },
  spacer: {
    height: 40,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#222222',
  },
});
