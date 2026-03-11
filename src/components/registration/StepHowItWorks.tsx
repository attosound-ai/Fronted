import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StepProps } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';

/**
 * Step 5: How Artist Representation Works
 * Informational step explaining representative responsibilities
 *
 * Usage:
 * <StepHowItWorks state={state} dispatch={dispatch} onNext={handleNext} onBack={handleBack} />
 */
export const StepHowItWorks: React.FC<StepProps> = ({ onNext, onBack }) => {
  const { t } = useTranslation(['registration', 'common']);
  const bulletPoints = t('howItWorks.bullets', { returnObjects: true }) as string[];

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
          <Text variant="h1" style={styles.title} numberOfLines={2}>
            {t('howItWorks.title')}
          </Text>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.paragraph}>{t('howItWorks.paragraph')}</Text>

          {/* Bullet points */}
          <View style={styles.bulletContainer}>
            {bulletPoints.map((point, index) => (
              <View key={index} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{point}</Text>
              </View>
            ))}
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
    fontSize: 17,
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  paragraph: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#CCCCCC',
    marginBottom: 24,
  },
  bulletContainer: {
    gap: 16,
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
