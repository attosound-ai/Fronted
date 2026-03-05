import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
          New Project
        </Text>
        <Input
          placeholder="Project name"
          value={name}
          onChangeText={setName}
          maxLength={200}
          autoFocus
        />
        <Input
          placeholder="Description (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={styles.descriptionInput}
        />
        <Button
          title="Create"
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
