import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/Toast';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { formatDate } from '@/utils/formatters';
import { AppIconPickerSheet, useAppIconStore } from '@/features/appIcon';
import { DeleteAccountBottomSheet } from '@/features/profile/components/DeleteAccountBottomSheet';
import { useBridgeNumber } from '@/features/profile/hooks/useBridgeNumber';
import { useLanguage } from '@/hooks/useLanguage';
import { useFreePlanSwitching, usePaywallRequired } from '@/hooks/usePaywall';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useRecorderModeStore } from '@/stores/recorderModeStore';
import { useEffectiveRecorderMode } from '@/features/settings/useEffectiveRecorderMode';
import {
  ActionRow,
  ConfirmRow,
  FooterText,
  NavRow,
  ProfileCardRow,
  Section,
  SettingsForm,
  ToggleRow,
  ValueRow,
} from '@/features/settings/native';

const DISPLAY_CODE: Record<string, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português',
};

const GREEN = '#30D158';
const AMBER = '#FF9F0A';
const RED = '#FF453A';

/**
 * The person tab of the profile, rebuilt as Apple's Settings (David, Sep 23
 * 2026): one native inset grouped list where every row is a native control
 * and every choice is its own pushed screen.
 */
export default function SettingsScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { currentLanguage } = useLanguage();
  const selectedIconSlot = useAppIconStore((s) => s.selectedSlot);
  const [iconSheetVisible, setIconSheetVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(!analytics.hasOptedOut());
  const storedMode = useRecorderModeStore((s) => s.mode);
  const effectiveMode = useEffectiveRecorderMode();
  const resolvedPlan = useSubscriptionStore((s) => s.getResolvedPlan());
  const subscription = useSubscriptionStore((s) => s.subscription);
  const paywallRequired = usePaywallRequired();
  const freeSwitching = useFreePlanSwitching();
  const {
    bridgeNumber,
    status: bridgeStatus,
    isLoading: bridgeLoading,
  } = useBridgeNumber();
  const queryClient = useQueryClient();

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.PROFILE.SETTINGS_SCREEN_OPENED, {
      screen: 'settings',
      recorder_mode: storedMode,
      recorder_effective: effectiveMode,
    });
  }, [storedMode, effectiveMode]);

  if (!user) return null;

  const phone =
    user.phoneCountryCode && user.phoneNumber
      ? `${user.phoneCountryCode} ${user.phoneNumber}`
      : t('account.phoneNotSet');
  const roleLabel =
    user.role === 'creator'
      ? t('common:roles.creator', { defaultValue: 'Creator' })
      : user.role === 'representative'
        ? t('common:roles.representative', { defaultValue: 'Representative' })
        : t('common:roles.listener', { defaultValue: 'Listener' });
  const PLAN_LABELS: Record<string, string> = {
    connect_free: t('subscription.planConnectFree'),
    record: t('subscription.planRecord'),
    record_pro: t('subscription.planRecordPro'),
    connect_pro: t('subscription.planConnectPro'),
  };
  const planLabel = resolvedPlan ? (PLAN_LABELS[resolvedPlan] ?? resolvedPlan) : '—';
  const showSubscription =
    user.role === 'creator' && !!user.inmateNumber && paywallRequired;
  const bridgeVisible =
    bridgeLoading || !!bridgeNumber || bridgeStatus === 'provisioning';
  const bridgeStatusText =
    bridgeStatus === 'assigned'
      ? t('bridgeNumber.statusActive')
      : bridgeStatus === 'provisioning'
        ? t('bridgeNumber.statusProvisioning')
        : bridgeStatus === 'failed'
          ? t('bridgeNumber.statusFailed')
          : bridgeStatus;
  const bridgeStatusColor =
    bridgeStatus === 'assigned' ? GREEN : bridgeStatus === 'provisioning' ? AMBER : RED;

  const copyBridge = async () => {
    if (!bridgeNumber) return;
    try {
      const ExpoClipboard = require('expo-clipboard');
      await ExpoClipboard.setStringAsync(bridgeNumber);
      showToast(t('bridgeNumber.copiedToast'));
    } catch {
      await Share.share({ message: bridgeNumber });
    }
  };
  const shareBridge = async () => {
    if (!bridgeNumber) return;
    try {
      await Share.share({
        message: t('bridgeNumber.shareMessage', { number: bridgeNumber }),
        title: t('bridgeNumber.shareTitle'),
      });
    } catch {
      // cancelled
    }
  };
  const handleLogout = async () => {
    analytics.capture(ANALYTICS_EVENTS.PROFILE.SETTINGS_ACTION, { action: 'logout' });
    await logout();
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PAYMENTS.BRIDGE_NUMBER });
    router.replace('/(auth)/login');
  };

  return (
    <>
      <SettingsForm>
        <Section>
          <ProfileCardRow
            name={user.displayName || user.username}
            subtitle={`@${user.username} · ${roleLabel}`}
            onPress={() => router.push('/edit-profile')}
          />
        </Section>

        <Section title={t('account.sectionTitle')}>
          <ValueRow
            title={t('account.emailLabel')}
            value={user.email}
            symbol="envelope.fill"
            color="#0A84FF"
          />
          <ValueRow
            title={t('account.phoneLabel')}
            value={phone}
            symbol="phone.fill"
            color="#30D158"
          />
          <ValueRow
            title={t('account.memberSinceLabel')}
            value={formatDate(user.createdAt)}
            symbol="calendar"
            color="#FF453A"
          />
          <ValueRow
            title={t('account.statusLabel')}
            value={t('account.statusActive')}
            valueColor={GREEN}
            symbol="checkmark.shield.fill"
            color="#636366"
          />
          {user.role === 'listener' && (
            <ActionRow
              title={t('account.createCreatorAccount')}
              symbol="person.badge.plus"
              onPress={() => router.push('/(auth)/register?mode=creator')}
            />
          )}
        </Section>

        {user.role === 'creator' && (
          <Section title={t('creator.sectionTitle')}>
            <ValueRow
              title={t('creator.creatorNameLabel')}
              value={user.creatorName ?? t('creator.creatorNameNotSet')}
              symbol="music.mic"
              color="#BF5AF2"
            />
            <ValueRow
              title={t('creator.inmateNumberLabel')}
              value={user.inmateNumber ?? t('creator.inmateNumberNotSet')}
              symbol="person.text.rectangle"
              color="#636366"
            />
            <ValueRow
              title={t('creator.verifiedLabel')}
              value={
                user.profileVerified
                  ? t('creator.verifiedYes')
                  : t('creator.verifiedPending')
              }
              valueColor={user.profileVerified ? GREEN : AMBER}
              symbol="checkmark.seal.fill"
              color="#0A84FF"
            />
          </Section>
        )}

        {user.role === 'representative' && (
          <Section title={t('representative.sectionTitle')}>
            <ValueRow
              title={t('representative.creatorNameLabel')}
              value={user.creatorName ?? t('representative.creatorNameNotSet')}
              symbol="music.mic"
              color="#BF5AF2"
            />
            <ValueRow
              title={t('representative.inmateNumberLabel')}
              value={user.inmateNumber ?? t('representative.inmateNumberNotSet')}
              symbol="person.text.rectangle"
              color="#636366"
            />
            <ValueRow
              title={t('representative.inmateStateLabel')}
              value={user.inmateState ?? t('representative.inmateStateNotSet')}
              symbol="mappin.and.ellipse"
              color="#FF453A"
            />
            <ValueRow
              title={t('representative.relationshipLabel')}
              value={user.relationship ?? t('representative.relationshipNotSet')}
              symbol="person.2.fill"
              color="#0A84FF"
            />
            <ValueRow
              title={t('representative.creatorEmailLabel')}
              value={user.creatorEmail ?? t('representative.creatorEmailNotSet')}
              symbol="envelope.fill"
              color="#0A84FF"
            />
            <ValueRow
              title={t('representative.creatorPhoneLabel')}
              value={user.creatorPhone ?? t('representative.creatorPhoneNotSet')}
              symbol="phone.fill"
              color="#30D158"
            />
            <ValueRow
              title={t('representative.consentToRecordLabel')}
              value={
                user.consentToRecording
                  ? t('representative.consentYes')
                  : t('representative.consentNo')
              }
              valueColor={user.consentToRecording ? GREEN : AMBER}
              symbol="mic.fill"
              color="#FF9F0A"
            />
            <ValueRow
              title={t('representative.verifiedLabel')}
              value={
                user.profileVerified
                  ? t('representative.verifiedYes')
                  : t('representative.verifiedPending')
              }
              valueColor={user.profileVerified ? GREEN : AMBER}
              symbol="checkmark.seal.fill"
              color="#0A84FF"
            />
          </Section>
        )}

        {bridgeVisible && (
          <Section title={t('bridgeNumber.sectionTitle')}>
            <ValueRow
              title={t('bridgeNumber.numberLabel')}
              value={
                bridgeLoading
                  ? t('bridgeNumber.numberLoading')
                  : (bridgeNumber ?? t('bridgeNumber.numberNotAssigned'))
              }
              symbol="phone.arrow.down.left.fill"
              color="#30D158"
            />
            <ValueRow
              title={t('bridgeNumber.statusLabel')}
              value={bridgeStatusText}
              valueColor={bridgeStatusColor}
              symbol="waveform"
              color="#636366"
            />
            {!!bridgeNumber && (
              <ActionRow
                title={t('bridgeNumber.copyButton')}
                symbol="doc.on.doc"
                onPress={copyBridge}
              />
            )}
            {!!bridgeNumber && (
              <ActionRow
                title={t('bridgeNumber.shareButton')}
                symbol="square.and.arrow.up"
                onPress={shareBridge}
              />
            )}
          </Section>
        )}

        {(freeSwitching || showSubscription) && (
          <Section
            title={t('subscription.pickerTitle')}
            footer={
              freeSwitching ? (
                <FooterText>{t('subscription.pickerNote')}</FooterText>
              ) : undefined
            }
          >
            {freeSwitching ? (
              <NavRow
                title={t('subscription.pickerTitle')}
                value={planLabel}
                symbol="star.fill"
                color="#FF9F0A"
                onPress={() => router.push('/settings/plan')}
              />
            ) : (
              <ValueRow
                title={t('subscription.pickerTitle')}
                value={planLabel}
                symbol="star.fill"
                color="#FF9F0A"
              />
            )}
            {showSubscription &&
              resolvedPlan !== 'connect_free' &&
              subscription?.expiresAt && (
                <ValueRow
                  title={t('subscription.renewsLabel', { date: '' }).replace(/\s*$/, '')}
                  value={new Date(subscription.expiresAt).toLocaleDateString()}
                  symbol="arrow.clockwise"
                  color="#636366"
                />
              )}
            {showSubscription && (
              <ActionRow
                title={
                  resolvedPlan === 'connect_free'
                    ? t('subscription.upgradePlan')
                    : t('subscription.manageSubscription')
                }
                symbol="creditcard"
                onPress={() => router.push('/subscription')}
              />
            )}
          </Section>
        )}

        <Section title={t('security.sectionTitle')}>
          <NavRow
            title={t('security.twoFactorLabel')}
            value={user.twoFactorEnabled ? t('settings.on') : t('settings.off')}
            symbol="lock.fill"
            color="#FF453A"
            onPress={() => router.push('/settings/security')}
          />
        </Section>

        <Section title={t('settings.sectionTitle')}>
          <NavRow
            title={t('settings.recorderLabel')}
            value={
              effectiveMode === 'pro'
                ? t('settings.recorderPro')
                : t('settings.recorderSimple')
            }
            symbol="waveform.badge.mic"
            color="#FF453A"
            onPress={() => router.push('/settings/recorder')}
          />
          <NavRow
            title={t('settings.languageLabel')}
            value={DISPLAY_CODE[currentLanguage] ?? currentLanguage}
            symbol="globe"
            color="#0A84FF"
            onPress={() => router.push('/settings/language')}
          />
          <NavRow
            title={t('settings.appIconLabel', { defaultValue: 'App icon' })}
            value={
              selectedIconSlot ?? t('appIcon.defaultLabel', { defaultValue: 'Default' })
            }
            symbol="app.badge"
            color="#636366"
            onPress={() => {
              analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_PICKER_OPENED);
              setIconSheetVisible(true);
            }}
          />
          <ToggleRow
            title={t('settings.analyticsLabel', { defaultValue: 'Analytics' })}
            isOn={analyticsEnabled}
            symbol="chart.bar.fill"
            color="#30D158"
            onChange={(on) => {
              setAnalyticsEnabled(on);
              if (on) analytics.optIn();
              else analytics.optOut();
            }}
          />
        </Section>

        <Section title={t('support.sectionTitle')}>
          <NavRow
            title={t('support.contactButton')}
            symbol="questionmark.circle.fill"
            color="#0A84FF"
            onPress={() => router.push('/settings/support')}
          />
        </Section>

        <Section>
          <ConfirmRow
            title={t('actions.logout')}
            question={t('settings.signOutQuestion')}
            confirmLabel={t('actions.logout')}
            cancelLabel={t('common:cancel', { defaultValue: 'Cancel' })}
            isPresented={logoutAsk}
            onPresentedChange={setLogoutAsk}
            onConfirm={() => void handleLogout()}
          />
          <ActionRow
            title={t('actions.deleteAccount')}
            destructive
            onPress={() => {
              analytics.capture(ANALYTICS_EVENTS.PROFILE.SETTINGS_ACTION, {
                action: 'delete_account_open',
              });
              setDeleteVisible(true);
            }}
          />
        </Section>
      </SettingsForm>

      <AppIconPickerSheet
        visible={iconSheetVisible}
        onClose={() => setIconSheetVisible(false)}
      />
      <DeleteAccountBottomSheet
        visible={deleteVisible}
        onClose={() => setDeleteVisible(false)}
        user={user}
      />
    </>
  );
}
