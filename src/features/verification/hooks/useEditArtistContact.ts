import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/components/ui/Toast';

interface ArtistContactForm {
  relationship: string;
  artistName: string;
  inmateNumber: string;
  artistEmail: string;
  artistPhoneCountryCode: string;
  artistPhone: string;
}

/**
 * useEditArtistContact — Manages form state for editing artist contact info.
 *
 * Single Responsibility: Handles validation, submission, and error state.
 */
export function useEditArtistContact() {
  const { t } = useTranslation(['validation', 'common']);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [form, setForm] = useState<ArtistContactForm>({
    relationship: user?.relationship ?? '',
    artistName: user?.artistName ?? '',
    inmateNumber: user?.inmateNumber ?? '',
    artistEmail: user?.artistEmail ?? '',
    artistPhoneCountryCode: '+1',
    artistPhone: user?.artistPhone?.replace(/^\+1/, '') ?? '',
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof ArtistContactForm | 'submit', string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback(
    <K extends keyof ArtistContactForm>(field: K, value: ArtistContactForm[K]) => {
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

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!form.relationship) newErrors.relationship = t('validation:relationshipRequired');
    if (!form.artistName.trim())
      newErrors.artistName = t('validation:artistNameRequired');
    if (!form.inmateNumber.trim())
      newErrors.inmateNumber = t('validation:inmateNumberRequired');

    if (form.artistEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.artistEmail)) {
      newErrors.artistEmail = t('validation:emailInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!validate()) return false;

    setIsSubmitting(true);
    setErrors({});
    try {
      const fullPhone = form.artistPhone
        ? form.artistPhoneCountryCode + form.artistPhone
        : undefined;

      await updateProfile({
        artistName: form.artistName,
        inmateNumber: form.inmateNumber,
        relationship: form.relationship,
        artistEmail: form.artistEmail || undefined,
        artistPhone: fullPhone,
      });
      showToast(t('common:toasts.artistContactUpdated'));
      return true;
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : t('common:toasts.failedToUpdate');
      setErrors({ submit: msg });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, validate, updateProfile]);

  return { form, errors, isSubmitting, updateField, save };
}
