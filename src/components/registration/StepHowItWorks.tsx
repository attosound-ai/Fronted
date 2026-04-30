import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StepProps } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * Step 5: How Creator Representation Works
 * Informational step explaining representative responsibilities
 */
export const StepHowItWorks: React.FC<StepProps> = ({ onNext, onBack }) => {
  const { t } = useTranslation(['registration', 'common']);
  const bulletPoints = t('howItWorks.bullets', { returnObjects: true }) as string[];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
    >
      {/* Main content */}
      <Text style={styles.paragraph}>{t('howItWorks.paragraph')}</Text>

      <View style={styles.bulletContainer}>
        {bulletPoints.map((point, index) => (
          <View key={index} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{point}</Text>
          </View>
        ))}
      </View>

      {/* Button — in natural flow, no flex tricks */}
      <View style={styles.buttonWrapper}>
        <Button
          title={t('common:buttons.continue')}
          onPress={() => {
            haptic('light');
            onNext();
          }}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
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
  buttonWrapper: {
    marginTop: 40,
  },
});
