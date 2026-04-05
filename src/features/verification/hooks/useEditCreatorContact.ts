import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/components/ui/Toast';

interface CreatorContactForm {
  relationship: string;
  creatorName: string;
  inmateNumber: string;
  creatorEmail: string;
  creatorPhoneCountryCode: string;
  creatorPhone: string;
}

/**
 * useEditCreatorContact — Manages form state for editing creator contact info.
 *
 * Single Responsibility: Handles validation, submission, and error state.
 */
export function useEditCreatorContact() {
  const { t } = useTranslation(['validation', 'common']);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [form, setForm] = useState<CreatorContactForm>({
    relationship: user?.relationship ?? '',
    creatorName: user?.creatorName ?? '',
    inmateNumber: user?.inmateNumber ?? '',
    creatorEmail: user?.creatorEmail ?? '',
    creatorPhoneCountryCode: '+1',
    creatorPhone: user?.creatorPhone?.replace(/^\+1/, '') ?? '',
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof CreatorContactForm | 'submit', string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback(
    <K extends keyof CreatorContactForm>(field: K, value: CreatorContactForm[K]) => {
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
    if (!form.creatorName.trim())
      newErrors.creatorName = t('validation:creatorNameRequired');
    if (!form.inmateNumber.trim())
      newErrors.inmateNumber = t('validation:inmateNumberRequired');

    if (form.creatorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.creatorEmail)) {
      newErrors.creatorEmail = t('validation:emailInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!validate()) return false;

    setIsSubmitting(true);
    setErrors({});
    try {
      const fullPhone = form.creatorPhone
        ? form.creatorPhoneCountryCode + form.creatorPhone
        : undefined;

      await updateProfile({
        creatorName: form.creatorName,
        inmateNumber: form.inmateNumber,
        relationship: form.relationship,
        creatorEmail: form.creatorEmail || undefined,
        creatorPhone: fullPhone,
      });
      showToast(t('common:toasts.creatorContactUpdated'));
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
