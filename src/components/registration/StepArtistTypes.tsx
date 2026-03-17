import { ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text, Button } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { ARTIST_TYPES, getValidGenreIds } from '@/constants/artistData';
import { haptic } from '@/lib/haptics/hapticService';

/**
 * StepArtistTypes - Step 11: Multi-select artist type chips
 */
export function StepArtistTypes({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);

  const handleToggle = (typeId: string) => {
    haptic('light');
    const current = state.artistTypes;
    const updated = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId];

    dispatch({ type: 'UPDATE_FIELD', field: 'artistTypes', value: updated });

    // Clean up orphaned genres
    const validIds = getValidGenreIds(updated);
    const cleaned = state.artistGenres.filter((id) => validIds.has(id));
    if (cleaned.length !== state.artistGenres.length) {
      dispatch({ type: 'UPDATE_FIELD', field: 'artistGenres', value: cleaned });
    }
  };

  const canContinue = state.artistTypes.length > 0;

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
    >
      <Text variant="h2" style={styles.title}>
        {t('artistTypes.title')}
      </Text>
      <Text variant="body" style={styles.subtitle}>
        {t('artistTypes.subtitle')}
      </Text>

      {apiError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
          <Text variant="small" style={styles.errorBannerText}>
            {apiError}
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        {ARTIST_TYPES.map((type) => {
          const selected = state.artistTypes.includes(type.id);
          return (
            <TouchableOpacity
              key={type.id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => handleToggle(type.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={type.iconName as any}
                size={18}
                color={selected ? '#000000' : '#FFFFFF'}
              />
              <Text
                variant="body"
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {t(type.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111111',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
