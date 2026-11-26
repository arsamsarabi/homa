import { Alert, Button, Drawer, Group, Stack, Text, TextInput } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useTagMutations } from '@/hooks/tasks';
import type { Tag } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { useTasksPageModel } from './model';

function TagForm({
  tag,
  onClose,
  onSaved,
  onDirty,
}: {
  tag: Tag;
  onClose: () => void;
  onSaved: () => void;
  onDirty: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const navigate = useNavigate();
  const { rename, remove } = useTagMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();
  const fail = (err: Error): void => setError(err.message);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    rename.mutate(
      { id: tag.id, name },
      {
        onSuccess: () => {
          announce(t('tasks.tagSaved'));
          onSaved();
          // The tag list's URL is its name.
          void navigate({ to: '/tasks', search: { tag: name } });
        },
        onError: fail,
      },
    );
  };

  const onDelete = (): void =>
    remove.mutate(tag.id, {
      onSuccess: () => {
        announce(t('tasks.tagDeleted', { name: tag.name }));
        onSaved();
        m.leaveList();
      },
      onError: fail,
    });

  return (
    <form onSubmit={submit} onInput={onDirty} onChange={onDirty}>
      <Stack>
        {error && (
          <Alert color="red" role="alert">
            {t('tasks.tagFailed', { message: error })}
          </Alert>
        )}
        <TextInput
          name="name"
          label={t('tasks.tagName')}
          defaultValue={tag.name}
          maxLength={50}
          required
          data-autofocus
        />
        <Group justify="space-between">
          <Button variant="light" color="red" onClick={onDelete} loading={remove.isPending}>
            {t('tasks.tagDelete')}
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={rename.isPending}>
              {t('tasks.tagSave')}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          {t('tasks.tagDeleteHint')}
        </Text>
      </Stack>
    </form>
  );
}

/** Rename or delete a tag. */
export function TagDrawer(): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const guard = useConfirmClose(() => m.setTagEditing(undefined));
  useEffect(() => {
    guard.resetDirty();
  }, [m.tagEditing?.id]);
  return (
    <>
      <Drawer
        opened={m.tagEditing !== undefined}
        onClose={guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={t('tasks.editTag')}
      >
        {m.tagEditing && (
          <TagForm
            key={m.tagEditing.id}
            tag={m.tagEditing}
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
