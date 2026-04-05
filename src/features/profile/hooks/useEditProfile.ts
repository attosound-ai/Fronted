import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { setAccountUser } from '@/lib/auth/storage';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { showToast } from '@/components/ui/Toast';
import { QUERY_KEYS } from '@/constants/queryKeys';

interface ProfileForm {
  displayName: string;
  username: string;
  bio: string;
  avatarUri: string | null;
  avatarChanged: boolean;
  // Creator fields
  creatorName: string;
  inmateNumber: string;
  // Representative fields
  relationship: string;
  inmateState: string;
  creatorEmail: string;
  creatorPhoneCountryCode: string;
  creatorPhone: string;
  // Social media links + extended bio
  socialInstagram: string;
  socialTiktok: string;
  socialYoutube: string;
  socialSoundcloud: string;
  socialSpotify: string;
  socialTwitter: string;
  website: string;
  location: string;
  recordLabel: string;
  bookingEmail: string;
}

export function useEditProfile() {
  const { t } = useTranslation(['profile', 'validation', 'common']);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const queryClient = useQueryClient();
  const { upload, isUploading } = useMediaUpload();

  const [form, setForm] = useState<ProfileForm>({
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    bio: user?.bio ?? '',
    avatarUri: user?.avatar ?? null,
    avatarChanged: false,
    creatorName: user?.creatorName ?? '',
    inmateNumber: user?.inmateNumber ?? '',
    relationship: user?.relationship ?? '',
    inmateState: user?.inmateState ?? '',
    creatorEmail: user?.creatorEmail ?? '',
    creatorPhoneCountryCode: '+1',
    creatorPhone: user?.creatorPhone?.replace(/^\+1/, '') ?? '',
    socialInstagram: user?.socialInstagram ?? '',
    socialTiktok: user?.socialTiktok ?? '',
    socialYoutube: user?.socialYoutube ?? '',
    socialSoundcloud: user?.socialSoundcloud ?? '',
    socialSpotify: user?.socialSpotify ?? '',
    socialTwitter: user?.socialTwitter ?? '',
    website: user?.website ?? '',
    location: user?.location ?? '',
    recordLabel: user?.recordLabel ?? '',
    bookingEmail: user?.bookingEmail ?? '',
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof ProfileForm | 'submit', string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback(
    <K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [errors]
  );

  const setAvatar = useCallback((uri: string) => {
    setForm((prev) => ({ ...prev, avatarUri: uri, avatarChanged: true }));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!form.displayName.trim())
      newErrors.displayName = t('validation:displayNameRequired');
    if (!form.username.trim()) newErrors.username = t('validation:usernameRequired');

    if (user?.role === 'representative') {
      if (!form.creatorName.trim())
        newErrors.creatorName = t('validation:creatorNameRequired');
      if (!form.inmateNumber.trim())
        newErrors.inmateNumber = t('validation:inmateNumberRequired');
      if (!form.relationship)
        newErrors.relationship = t('validation:relationshipRequired');
    }

    // creatorName and inmateNumber are optional for creators during edit
    // (they were set during registration; if empty, username is used as fallback)

    if (form.creatorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.creatorEmail)) {
      newErrors.creatorEmail = t('validation:emailInvalid');
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      const firstError = Object.values(newErrors)[0];
      if (firstError) showToast(firstError);
    }
    return Object.keys(newErrors).length === 0;
  }, [form, user?.role]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!validate()) return false;

    setIsSubmitting(true);
    setErrors({});
    try {
      let avatarPublicId: string | undefined;

      if (form.avatarChanged && form.avatarUri) {
        const publicId = await upload(
          form.avatarUri,
          'avatar.jpg',
          'image/jpeg',
          'avatar'
        );
        if (!publicId) {
          setErrors({ submit: t('common:toasts.failedToUploadAvatar') });
          return false;
        }
        avatarPublicId = publicId;
      }

      const data: Record<string, string | undefined> = {
        displayName: form.displayName,
        username: form.username,
        bio: form.bio || undefined,
      };

      if (avatarPublicId) {
        data.avatar = avatarPublicId;
      }

      if (user?.role === 'creator' || user?.role === 'representative') {
        data.creatorName = form.creatorName;
        data.inmateNumber = form.inmateNumber;
      }

      // Social media links + extended bio (all roles, but UI only shows for creators)
      data.socialInstagram = form.socialInstagram || undefined;
      data.socialTiktok = form.socialTiktok || undefined;
      data.socialYoutube = form.socialYoutube || undefined;
      data.socialSoundcloud = form.socialSoundcloud || undefined;
      data.socialSpotify = form.socialSpotify || undefined;
      data.socialTwitter = form.socialTwitter || undefined;
      data.website = form.website || undefined;
      data.location = form.location || undefined;
      data.recordLabel = form.recordLabel || undefined;
      data.bookingEmail = form.bookingEmail || undefined;

      if (user?.role === 'representative') {
        data.relationship = form.relationship;
        data.inmateState = form.inmateState || undefined;
        data.creatorEmail = form.creatorEmail || undefined;
        data.creatorPhone = form.creatorPhone
          ? form.creatorPhoneCountryCode + form.creatorPhone
          : undefined;
      }

      await updateProfile(data);
      // Invalidate cached profile so the screen re-fetches with the new avatar/data
      const freshUser = useAuthStore.getState().user;
      if (freshUser?.id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.USERS.PROFILE(freshUser.id),
        });
        // Update per-account SecureStore entry + reload accountStore for tab icon
        await setAccountUser(freshUser.id, freshUser);
        await useAccountStore.getState().loadAccounts();
      }
      showToast(t('common:toasts.profileUpdated'));
      return true;
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : t('common:errors.profileUpdateFailed');
      setErrors({ submit: msg });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, validate, updateProfile, upload, user?.role]);

  return {
    form,
    errors,
    isSubmitting: isSubmitting || isUploading,
    updateField,
    setAvatar,
    save,
  };
}
