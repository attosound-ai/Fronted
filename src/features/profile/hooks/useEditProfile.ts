import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { showToast } from '@/components/ui/Toast';

interface ProfileForm {
  displayName: string;
  username: string;
  bio: string;
  avatarUri: string | null;
  avatarChanged: boolean;
  // Artist fields
  artistName: string;
  inmateNumber: string;
  // Representative fields
  relationship: string;
  inmateState: string;
  artistEmail: string;
  artistPhoneCountryCode: string;
  artistPhone: string;
}

export function useEditProfile() {
  const { t } = useTranslation(['profile', 'validation', 'common']);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const { upload, isUploading } = useMediaUpload();

  const [form, setForm] = useState<ProfileForm>({
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    bio: user?.bio ?? '',
    avatarUri: user?.avatar ?? null,
    avatarChanged: false,
    artistName: user?.artistName ?? '',
    inmateNumber: user?.inmateNumber ?? '',
    relationship: user?.relationship ?? '',
    inmateState: user?.inmateState ?? '',
    artistEmail: user?.artistEmail ?? '',
    artistPhoneCountryCode: '+1',
    artistPhone: user?.artistPhone?.replace(/^\+1/, '') ?? '',
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
      if (!form.artistName.trim())
        newErrors.artistName = t('validation:artistNameRequired');
      if (!form.inmateNumber.trim())
        newErrors.inmateNumber = t('validation:inmateNumberRequired');
      if (!form.relationship)
        newErrors.relationship = t('validation:relationshipRequired');
    }

    if (user?.role === 'artist') {
      if (!form.artistName.trim())
        newErrors.artistName = t('validation:artistNameRequired');
      if (!form.inmateNumber.trim())
        newErrors.inmateNumber = t('validation:inmateNumberRequired');
    }

    if (form.artistEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.artistEmail)) {
      newErrors.artistEmail = t('validation:emailInvalid');
    }

    setErrors(newErrors);
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

      if (user?.role === 'artist' || user?.role === 'representative') {
        data.artistName = form.artistName;
        data.inmateNumber = form.inmateNumber;
      }

      if (user?.role === 'representative') {
        data.relationship = form.relationship;
        data.inmateState = form.inmateState || undefined;
        data.artistEmail = form.artistEmail || undefined;
        data.artistPhone = form.artistPhone
          ? form.artistPhoneCountryCode + form.artistPhone
          : undefined;
      }

      await updateProfile(data);
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
