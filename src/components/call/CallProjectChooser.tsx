import { useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, FolderOpen, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Toast, showToast } from '@/components/ui/Toast';
import { useProjects, useCreateProject } from '@/features/projects/hooks/useProjects';
import { useCallStore } from '@/stores/callStore';
import { useCallBarVisible, IN_CALL_BAR_HEIGHT } from '@/hooks/useInCallChrome';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { COLORS } from '@/constants/theme';

/**
 * FULL-SCREEN project chooser for an in-call Record Pro session.
 *
 * Record Pro's whole point is that the rep manages projects, so when a call is
 * answered we must let them CHOOSE which project to record into instead of
 * deciding for them (David, Jul 19: "si caigo de una vez a la pantalla de
 * edición, no pude elegir el proyecto"). ActiveCallScreen renders this whenever
 * the call has no project yet — picking or creating one sets it on the call
 * store, which flips that screen over to the timeline editor.
 *
 * Deliberately a screen, not a bottom sheet: it is the primary decision at that
 * moment, and a sheet over an empty editor read as a stuck/loading screen.
 */
interface CallProjectChooserProps {
  /**
   * Leave the chooser without picking a project (back to the feed, call intact).
   * Without this the screen was a dead end: choosing a project was the ONLY way
   * out, so a rep who just wanted to talk was trapped on it for the whole call
   * (David, Aug 3). The call keeps running — the floating in-call bar stays on
   * top — so this is "not right now", not "hang up".
   */
  onBack?: () => void;
}

export function CallProjectChooser({ onBack }: CallProjectChooserProps) {
  const { t } = useTranslation(['calls', 'common']);
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const setActiveProjectId = useCallStore((s) => s.setActiveProjectId);
  const callBarVisible = useCallBarVisible();

  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const pick = (projectId: string, how: 'selected' | 'created') => {
    analytics.capture(ANALYTICS_EVENTS.CALL.RECORDER_STATE, {
      state: `project_${how}`,
      project_id: projectId,
    });
    setActiveProjectId(projectId);
  };

  const handleCreateSubmit = () => {
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: (project) => pick(project.id, 'created'),
        onError: () => showToast(t('common:toasts.failedToCreateProject')),
      }
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, callBarVisible && { paddingTop: IN_CALL_BAR_HEIGHT }]}
      edges={['top', 'bottom']}
    >
      {mode === 'list' ? (
        <>
          <View style={styles.header}>
            {onBack && (
              <Pressable
                onPress={() => {
                  analytics.capture(ANALYTICS_EVENTS.CALL.RECORDER_STATE, {
                    state: 'chooser_dismissed',
                  });
                  onBack();
                }}
                style={styles.headerBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <ArrowLeft size={24} color="#FFF" strokeWidth={2.25} />
              </Pressable>
            )}
            <Text variant="h2" style={styles.title}>
              {t('projectPicker.selectProject')}
            </Text>
            <Text variant="caption" style={styles.subtitle}>
              {t('projectPicker.subtitle')}
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#3B82F6" style={styles.loader} />
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable style={styles.option} onPress={() => setMode('create')}>
                <View style={[styles.iconCircle, styles.createCircle]}>
                  <Plus size={22} color="#3B82F6" strokeWidth={2.25} />
                </View>
                <View style={styles.textContainer}>
                  <Text variant="body" style={styles.createText}>
                    {t('projectPicker.newProject')}
                  </Text>
                </View>
              </Pressable>

              {projects?.map((project) => (
                <Pressable
                  key={project.id}
                  style={styles.option}
                  onPress={() => pick(project.id, 'selected')}
                >
                  <View style={styles.iconCircle}>
                    <FolderOpen size={20} color="#FFF" strokeWidth={2.25} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text variant="body" style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {(project.segmentCount ?? 0) > 0 && (
                      <Text variant="caption" style={styles.meta}>
                        {t('projectPicker.segmentCount', {
                          count: project.segmentCount,
                        })}
                      </Text>
                    )}
                  </View>
                  <ChevronRight size={18} color="#555" strokeWidth={2.25} />
                </Pressable>
              ))}

              {(!projects || projects.length === 0) && !isLoading && (
                <Text variant="caption" style={styles.emptyText}>
                  {t('projectPicker.noProjects')}
                </Text>
              )}
            </ScrollView>
          )}
        </>
      ) : (
        <View style={styles.createForm}>
          <Pressable style={styles.backButton} onPress={() => setMode('list')}>
            <ArrowLeft size={20} color="#888" strokeWidth={2.25} />
            <Text variant="caption" style={styles.backText}>
              {t('common:buttons.back')}
            </Text>
          </Pressable>
          <Text variant="h2" style={styles.title}>
            {t('projectPicker.newProject')}
          </Text>
          <Input
            placeholder={t('projectPicker.projectName')}
            value={name}
            onChangeText={setName}
            maxLength={200}
            autoFocus
          />
          <Input
            placeholder={t('projectPicker.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={styles.descriptionInput}
          />
          <Button
            title={t('common:buttons.create')}
            onPress={handleCreateSubmit}
            disabled={!name.trim() || createProject.isPending}
            loading={createProject.isPending}
          />
        </View>
      )}
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerBack: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  title: {
    color: '#FFF',
  },
  subtitle: {
    color: '#888',
    marginTop: 6,
    fontSize: 13,
  },
  loader: {
    marginVertical: 32,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCircle: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  createText: {
    color: '#3B82F6',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  projectName: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  meta: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
  createForm: {
    gap: 16,
    paddingTop: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    color: '#888',
    fontSize: 13,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
