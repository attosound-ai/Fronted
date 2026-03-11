import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

interface CreateProjectSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => void;
  isLoading?: boolean;
}

export function CreateProjectSheet({
  visible,
  onClose,
  onSubmit,
  isLoading,
}: CreateProjectSheetProps) {
  const { t } = useTranslation('projects');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim() || undefined);
    setName('');
    setDescription('');
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <View style={styles.container}>
        <Text variant="h3" style={styles.title}>
          {t('create.sheetTitle')}
        </Text>
        <Input
          placeholder={t('create.namePlaceholder')}
          value={name}
          onChangeText={setName}
          maxLength={200}
          autoFocus
        />
        <Input
          placeholder={t('create.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={styles.descriptionInput}
        />
        <Button
          title={t('create.createButton')}
          onPress={handleSubmit}
          disabled={!name.trim() || isLoading}
          loading={isLoading}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
