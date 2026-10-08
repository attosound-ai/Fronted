import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { decideRename, PROJECT_NAME_MAX } from '../projectName';

interface RenameProjectSheetProps {
  /** The project being renamed, or null when the sheet is closed. */
  project: { id: string; name: string } | null;
  onClose: () => void;
  onSubmit: (id: string, name: string) => void;
  isLoading?: boolean;
}

/**
 * The name of a project, to change it from the list (client, Oct 7 2026:
 * "Is there a way for us to rename files?"). Opens with the current name
 * selected, so typing replaces it.
 */
export function RenameProjectSheet({
  project,
  onClose,
  onSubmit,
  isLoading,
}: RenameProjectSheetProps) {
  const { t } = useTranslation('projects');
  const [name, setName] = useState('');
  const nameRef = useRef<TextInput>(null);
  // Native sheet: focus once it is on screen (autoFocus fires too early).
  const focusName = useCallback(() => nameRef.current?.focus(), []);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  const decision = decideRename(project?.name ?? '', name);

  const handleSubmit = () => {
    if (!project) return;
    if (decision.kind === 'unchanged') {
      onClose();
      return;
    }
    if (decision.kind === 'rename') onSubmit(project.id, decision.name);
  };

  return (
    <BottomSheet visible={project !== null} onClose={onClose} onPresented={focusName}>
      <View style={styles.container}>
        <Text variant="h3" style={styles.title}>
          {t('rename.sheetTitle')}
        </Text>
        <Input
          ref={nameRef}
          placeholder={t('create.namePlaceholder')}
          value={name}
          onChangeText={setName}
          maxLength={PROJECT_NAME_MAX}
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
        <Button
          title={t('rename.saveButton')}
          onPress={handleSubmit}
          disabled={decision.kind === 'empty' || isLoading}
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
});
