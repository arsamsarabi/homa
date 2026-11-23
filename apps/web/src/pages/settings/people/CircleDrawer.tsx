import { Alert, Button, Drawer, Group, MultiSelect, Stack, TextInput } from '@mantine/core';
import { type FormEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCircleMutations } from '@/hooks/people';
import type { Circle, Person } from '@/schemas';
import { useAnnouncer } from '@/stores';

/** What the drawer is open for: a new circle, or one to change. */
export type CircleDrawerTarget = { kind: 'create' } | { kind: 'edit'; circle: Circle };

export type CircleDrawerProps = { target: CircleDrawerTarget | undefined; people: Person[]; onClose: () => void };

/** Name a circle and pick who is in it. */
export function CircleDrawer({ target, people, onClose }: CircleDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const { create, update } = useCircleMutations();
  const announce = useAnnouncer((s) => s.announce);
  const editing = target?.kind === 'edit' ? target.circle : undefined;
  const [memberIds, setMemberIds] = useState<string[]>();
  const [error, setError] = useState<string>();
  const chosen = memberIds ?? editing?.memberIds ?? [];

  const close = (): void => {
    setMemberIds(undefined);
    setError(undefined);
    onClose();
  };
  const done = (c: Circle): void => {
    announce(t('people.circles.saved', { name: c.name }));
    close();
  };
  const fail = (err: Error): void => setError(err.message);
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (editing)
      update.mutate(
        { id: editing.id, name, memberIds: chosen, renamed: name !== editing.name },
        { onSuccess: done, onError: fail },
      );
    else create.mutate({ name, memberIds: chosen }, { onSuccess: done, onError: fail });
  };

  return (
    <Drawer
      opened={target !== undefined}
      onClose={close}
      position="right"
      size="md"
      padding="lg"
      title={editing ? t('people.circles.editTitle') : t('people.circles.new')}
    >
      {target && (
        <form onSubmit={submit}>
          <Stack>
            {error && (
              <Alert color="red" role="alert">
                {t('people.circles.saveFailed', { message: error })}
              </Alert>
            )}
            <TextInput
              name="name"
              label={t('people.circles.name')}
              placeholder={t('people.circles.namePlaceholder')}
              defaultValue={editing?.name ?? ''}
              maxLength={60}
              required
              data-autofocus
            />
            <MultiSelect
              label={t('people.circles.members')}
              description={people.length ? undefined : t('people.circles.nobodyYet')}
              data={people.map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }))}
              value={chosen}
              onChange={setMemberIds}
              searchable
              clearable
              hidePickedOptions
              nothingFoundMessage={t('people.circles.nobodyFound')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {t('people.circles.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Drawer>
  );
}
