import { useEffect, useRef } from 'react';
import { ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { getGenresForSelectedTypes } from '@/constants/creatorData';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * StepCreatorGenres - Step 12: Multi-select genre chips, grouped by category.
 * Auto-skips if no genres apply (e.g., only "multifaceted" selected).
 */
export function StepCreatorGenres({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);
  const skippedRef = useRef(false);

  const grouped = getGenresForSelectedTypes(state.creatorTypes);

  // Auto-skip if no genres to show
  useEffect(() => {
    if (grouped.length === 0 && !skippedRef.current) {
      skippedRef.current = true;
      onNext();
    }
  }, [grouped.length, onNext]);

  if (grouped.length === 0) return null;

  const handleToggle = (genreId: string) => {
    haptic('light');
    const current = state.creatorGenres;
    const updated = current.includes(genreId)
      ? current.filter((id) => id !== genreId)
      : [...current, genreId];

    dispatch({ type: 'UPDATE_FIELD', field: 'creatorGenres', value: updated });
  };

  const canContinue = state.creatorGenres.length > 0;
  const showHeaders = grouped.length > 1;

  const handleContinue = () => {
    if (!canContinue) {
      haptic('error');
      return;
    }
    haptic('light');
    onNext();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
    >
      <Text variant="body" style={styles.subtitle}>
        {t('creatorGenres.subtitle')}
      </Text>

      {apiError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
          <Text variant="small" style={styles.errorBannerText}>
            {apiError}
          </Text>
        </View>
      )}

      <View style={styles.sections}>
        {grouped.map((group) => (
          <View key={group.category} style={styles.section}>
            {showHeaders && (
              <Text variant="body" style={styles.sectionHeader}>
                {t(group.categoryLabelKey)}
              </Text>
            )}
            <View style={styles.grid}>
              {group.genres.map((genre) => {
                const selected = state.creatorGenres.includes(genre.id);
                return (
                  <TouchableOpacity
                    key={genre.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => handleToggle(genre.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      variant="body"
                      style={[styles.chipText, selected && styles.chipTextSelected]}
                    >
                      {t(genre.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={t('common:buttons.continue')}
          onPress={handleContinue}
          disabled={isLoading || !canContinue}
          loading={isLoading}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 4,
  },
  subtitle: {
    color: '#888888',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#FFFFFF',
    flex: 1,
  },
  sections: {
    paddingHorizontal: 24,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    color: '#888888',
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: '#111111',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Archivo_500Medium',
  },
  chipTextSelected: {
    color: '#000000',
  },
  buttonContainer: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
});
