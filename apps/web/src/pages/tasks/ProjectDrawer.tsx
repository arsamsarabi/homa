import { Alert, Button, ColorInput, Drawer, Group, Stack, Text, TextInput } from '@mantine/core';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useProjectMutations } from '@/hooks/tasks';
import { SWATCHES } from '@/pages/settings/calendars';
import { useAnnouncer } from '@/stores';
import { type ProjectDraft, useTasksPageModel } from './model';

function ProjectForm({
  draft,
  onClose,
  onSaved,
  onDirty,
}: {
  draft: ProjectDraft;
  onClose: () => void;
  onSaved: () => void;
  onDirty: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const { create, update, remove } = useProjectMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();
  const project = draft.kind === 'edit' ? draft.project : undefined;
  const fail = (err: Error): void => setError(err.message);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fields = { name: String(f.get('name') ?? '').trim(), color: String(f.get('color') ?? '') || null };
    const done = (): void => {
      announce(t('tasks.projectSaved'));
      onSaved();
    };
    if (project) update.mutate({ id: project.id, ...fields }, { onSuccess: done, onError: fail });
    else create.mutate(fields, { onSuccess: done, onError: fail });
  };

  const onDelete = (): void => {
    if (!project) return;
    remove.mutate(project.id, {
      onSuccess: () => {
        announce(t('tasks.projectDeleted', { name: project.name }));
        onSaved();
        m.leaveList();
      },
      onError: fail,
    });
  };

  return (
    <form onSubmit={submit} onInput={onDirty} onChange={onDirty}>
      <Stack>
        {error && (
          <Alert color="red" role="alert">
            {t('tasks.projectFailed', { message: error })}
          </Alert>
        )}
        <TextInput
          name="name"
          label={t('tasks.projectName')}
          defaultValue={project?.name ?? ''}
          maxLength={100}
          required
          data-autofocus
        />
        <ColorInput
          name="color"
          label={t('tasks.projectColor')}
          description={t('tasks.projectColorHint')}
          defaultValue={project?.color ?? ''}
          format="hex"
          withPicker={false}
          swatches={[...SWATCHES]}
          swatchesPerRow={7}
          closeOnColorSwatchClick
        />
        <Group justify={project ? 'space-between' : 'flex-end'}>
          {project && (
            <Button variant="light" color="red" onClick={onDelete} loading={remove.isPending}>
              {t('tasks.projectDelete')}
            </Button>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {t('tasks.projectSave')}
            </Button>
          </Group>
        </Group>
        {project && (
          <Text size="xs" c="dimmed">
            {t('tasks.projectDeleteHint')}
          </Text>
        )}
      </Stack>
    </form>
  );
}

/** Create a project, or rename, recolor or delete one. */
export function ProjectDrawer(): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const draft = m.projectDraft;
  const guard = useConfirmClose(() => m.setProjectDraft(undefined));
  const draftKey = draft?.kind === 'edit' ? draft.project.id : draft?.kind === 'create' ? 'new' : 'closed';
  useEffect(() => {
    guard.resetDirty();
  }, [draftKey]);
  return (
    <>
      <Drawer
        opened={draft !== undefined}
        onClose={guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={draft?.kind === 'edit' ? t('tasks.editProject') : t('tasks.projectNew')}
      >
        {draft && (
          <ProjectForm
            key={draftKey}
            draft={draft}
            onClose={guard.requestClose}
            onSaved={guard.forceClose}
            onDirty={guard.markDirty}
          />
        )}
      </Drawer>
      <ConfirmCloseModal opened={guard.asking} onDiscard={guard.discard} onKeep={guard.keepEditing} />
    </>
  );
}
