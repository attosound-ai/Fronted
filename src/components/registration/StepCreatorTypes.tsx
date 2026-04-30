import {
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import {
  Mic,
  Music,
  Megaphone,
  Headphones,
  Palette,
  Box,
  Camera,
  BookOpen,
  PenLine,
  Film,
  PersonStanding,
  Sparkles,
  MoreHorizontal,
  AlertCircle,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button } from '@/components/ui';
import { StepProps } from '@/types/registration';
import { CREATOR_TYPES, getValidGenreIds } from '@/constants/creatorData';
import { haptic } from '@/lib/haptics/hapticService';

const CREATOR_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  mic: Mic,
  'musical-notes': Music,
  megaphone: Megaphone,
  headset: Headphones,
  'color-palette': Palette,
  cube: Box,
  camera: Camera,
  book: BookOpen,
  create: PenLine,
  film: Film,
  body: PersonStanding,
  sparkles: Sparkles,
  'ellipsis-horizontal': MoreHorizontal,
};

/**
 * StepCreatorTypes - Step 11: Multi-select creator type chips
 */
export function StepCreatorTypes({
  state,
  dispatch,
  onNext,
  isLoading,
  apiError,
}: StepProps) {
  const { t } = useTranslation(['registration', 'common']);
  const { height: screenHeight } = useWindowDimensions();
  const isSmallScreen = screenHeight < 930;

  const handleToggle = (typeId: string) => {
    haptic('light');
    const current = state.creatorTypes;
    const updated = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId];

    dispatch({ type: 'UPDATE_FIELD', field: 'creatorTypes', value: updated });

    // Clean up orphaned genres
    const validIds = getValidGenreIds(updated);
    const cleaned = state.creatorGenres.filter((id) => validIds.has(id));
    if (cleaned.length !== state.creatorGenres.length) {
      dispatch({ type: 'UPDATE_FIELD', field: 'creatorGenres', value: cleaned });
    }
  };

  const canContinue = state.creatorTypes.length > 0;

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
        {t('creatorTypes.subtitle')}
      </Text>

      {apiError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={20} color="#FFFFFF" strokeWidth={2.25} />
          <Text variant="small" style={styles.errorBannerText}>
            {apiError}
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        {CREATOR_TYPES.map((type) => {
          const selected = state.creatorTypes.includes(type.id);
          return (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                isSmallScreen && styles.chipSmall,
              ]}
              onPress={() => handleToggle(type.id)}
              activeOpacity={0.7}
            >
              {(() => {
                const TypeIcon = CREATOR_TYPE_ICON_MAP[type.iconName] ?? MoreHorizontal;
                return (
                  <TypeIcon
                    size={isSmallScreen ? 15 : 18}
                    color={selected ? '#000000' : '#FFFFFF'}
                    strokeWidth={2.25}
                  />
                );
              })()}
              <Text
                variant="body"
                style={[
                  styles.chipText,
                  selected && styles.chipTextSelected,
                  isSmallScreen && styles.chipTextSmall,
                ]}
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
  chipSmall: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  chipTextSmall: {
    fontSize: 12,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
});
