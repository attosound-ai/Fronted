/**
 * AccountTypeSheet: the first question of the registration flow.
 *
 * Until Sep 2026 the wizard asked "will you represent a creator?" (and then
 * "do you have an inmate number?") in a sheet that popped AFTER the profile
 * step, once the user had already typed an email, an OTP, a name, a birth
 * date, a password and a username. Branching that late meant people filled
 * five screens before finding out the flow was not the one they wanted.
 *
 * Now the branch is the very first thing we ask: one native sheet, two
 * explicit choices, one tap each. The chosen role is carried into the wizard
 * as a route param and patched onto the signup draft with the OTP verify, so
 * the server's NextStepFor knows the branch from the start too.
 *
 * Sep 19 2026: the sheet asks only "your own account" or "you represent an
 * artist". Creator and listener are the same flow now, and what tells them
 * apart is the optional inmate lookup at the very end: fill it and the
 * account becomes a creator, skip it and it stays a standard account.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Mic, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import type { Role } from '@/types';

interface AccountTypeSheetProps {
  visible: boolean;
  /** The sheet wants to close, so the owner drops `visible`. Always fired. */
  onClose: () => void;
  /** Fired once the sheet is off screen, with the role the user picked. */
  onSelect: (role: Role) => void;
  /** Fired once the sheet is off screen after a dismissal with no choice. */
  onCancel?: () => void;
}

/**
 * Two doors. `listener` is the starting role of "my own account": the wizard
 * upgrades it to creator at the end if the person validates an inmate.
 */
type OfferedRole = Extract<Role, 'listener' | 'representative'>;

const OPTIONS: { role: OfferedRole; Icon: typeof Mic }[] = [
  { role: 'listener', Icon: Mic },
  { role: 'representative', Icon: Users },
];

/** How long the picked card stays highlighted before the sheet slides away. */
const CONFIRM_MS = 160;

export function AccountTypeSheet({
  visible,
  onClose,
  onSelect,
  onCancel,
}: AccountTypeSheetProps) {
  const { t } = useTranslation('registration');
  const [picked, setPicked] = useState<Role | null>(null);
  // Read from the dismissal callback, which runs outside React's render.
  const pickedRef = useRef<Role | null>(null);

  // A reopened sheet must never show the previous choice still highlighted.
  useEffect(() => {
    if (visible) {
      setPicked(null);
      pickedRef.current = null;
    }
  }, [visible]);

  const handlePick = (role: Role) => {
    if (pickedRef.current) return; // ignore double taps while the sheet closes
    haptic('light');
    pickedRef.current = role;
    setPicked(role);
    // Let the highlight paint, then close. The choice is handed up in
    // `onDismissed` so the sheet is already off screen when we navigate.
    setTimeout(onClose, CONFIRM_MS);
  };

  const handleDismissed = () => {
    const role = pickedRef.current;
    pickedRef.current = null;
    if (role) onSelect(role);
    else onCancel?.();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismissed={handleDismissed}>
      <View style={styles.header}>
        <Text variant="h2" style={styles.title}>
          {t('accountType.title')}
        </Text>
        <Text variant="body" style={styles.subtitle}>
          {t('accountType.subtitle')}
        </Text>
      </View>

      <View style={styles.options}>
        {OPTIONS.map(({ role, Icon }) => {
          const isPicked = picked === role;
          const isDimmed = picked !== null && !isPicked;
          return (
            <Pressable
              key={role}
              onPress={() => handlePick(role)}
              accessibilityRole="button"
              accessibilityLabel={t(`accountType.${role}.title`)}
              accessibilityHint={t(`accountType.${role}.description`)}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
                isPicked && styles.cardPicked,
                isDimmed && styles.cardDimmed,
              ]}
            >
              <View style={[styles.iconCircle, isPicked && styles.iconCirclePicked]}>
                <Icon
                  size={22}
                  color={isPicked ? '#000000' : '#FFFFFF'}
                  strokeWidth={2.25}
                />
              </View>
              <View style={styles.cardText}>
                <Text variant="body" style={styles.cardTitle} numberOfLines={1}>
                  {t(`accountType.${role}.title`)}
                </Text>
                <Text variant="small" style={styles.cardDescription}>
                  {t(`accountType.${role}.description`)}
                </Text>
              </View>
              <ChevronRight size={20} color="#666666" strokeWidth={2.25} />
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#9A9A9A',
    lineHeight: 21,
  },
  options: {
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  cardPressed: {
    backgroundColor: '#1C1C1C',
    borderColor: '#3A3A3A',
  },
  cardPicked: {
    backgroundColor: '#1C1C1C',
    borderColor: '#FFFFFF',
  },
  cardDimmed: {
    opacity: 0.45,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePicked: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
  },
  cardDescription: {
    color: '#8A8A8A',
    lineHeight: 18,
  },
});
