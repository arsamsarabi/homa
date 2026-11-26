import {
  Alert,
  Avatar,
  Button,
  ColorInput,
  Drawer,
  FileButton,
  Group,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPhoto, IconRefresh } from '@tabler/icons-react';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useCircleMutations } from '@/hooks/people';
import { SWATCHES } from '@/pages/settings/calendars';
import type { Circle, Person } from '@/schemas';
import { circleAvatarSrc, randomAvatarSeed, randomCircleColor, readImageAsDataUrl } from '@/services/people';
import { useAnnouncer } from '@/stores';

/** What the drawer is open for: a new circle, or one to change. */
export type CircleDrawerTarget = { kind: 'create' } | { kind: 'edit'; circle: Circle };

export type CircleDrawerProps = { target: CircleDrawerTarget | undefined; people: Person[]; onClose: () => void };

type Appearance = { color: string; avatarSeed: string; avatarImage: string | null };

const freshAppearance = (): Appearance => ({
  color: randomCircleColor(SWATCHES),
  avatarSeed: randomAvatarSeed(),
  avatarImage: null,
});

/** Name a circle, pick its look, and choose who is in it. */
export function CircleDrawer({ target, people, onClose }: CircleDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const { create, update } = useCircleMutations();
  const announce = useAnnouncer((s) => s.announce);
  const editing = target?.kind === 'edit' ? target.circle : undefined;
  const [memberIds, setMemberIds] = useState<string[]>();
  const [appearance, setAppearance] = useState<Appearance>(freshAppearance);
  const [error, setError] = useState<string>();
  const chosen = memberIds ?? editing?.memberIds ?? [];
  const saving = create.isPending || update.isPending;
  const preview = circleAvatarSrc(appearance);

  useEffect(() => {
    if (!target) return;
    setMemberIds(undefined);
    setError(undefined);
    setAppearance(
      target.kind === 'edit'
        ? {
            color: target.circle.color,
            avatarSeed: target.circle.avatarSeed,
            avatarImage: target.circle.avatarImage,
          }
        : freshAppearance(),
    );
  }, [target]);

  const guard = useConfirmClose(() => {
    setMemberIds(undefined);
    setError(undefined);
    onClose();
  });
  const done = (c: Circle): void => {
    announce(t('people.circles.saved', { name: c.name }));
    guard.forceClose();
  };
  const fail = (err: Error): void => setError(t('people.circles.saveFailed', { message: err.message }));

  const shuffle = (): void => {
    guard.markDirty();
    setAppearance((a) => ({ ...a, avatarSeed: randomAvatarSeed(), avatarImage: null }));
  };

  const onUpload = async (file: File | null): Promise<void> => {
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setAppearance((a) => ({ ...a, avatarImage: dataUrl }));
      setError(undefined);
    } catch {
      setError(t('people.circles.avatarTooLarge'));
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    const body = { name, memberIds: chosen, ...appearance };
    if (editing) {
      const patch: Partial<Omit<typeof body, 'memberIds'>> = {};
      if (name !== editing.name) patch.name = name;
      if (appearance.color !== editing.color) patch.color = appearance.color;
      if (appearance.avatarSeed !== editing.avatarSeed) patch.avatarSeed = appearance.avatarSeed;
      if (appearance.avatarImage !== editing.avatarImage) patch.avatarImage = appearance.avatarImage;
      update.mutate({ id: editing.id, ...body, patch }, { onSuccess: done, onError: fail });
    } else create.mutate(body, { onSuccess: done, onError: fail });
  };

  return (
    <>
      <Drawer
        opened={target !== undefined}
        onClose={guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={editing ? t('people.circles.editTitle') : t('people.circles.new')}
      >
        {target && (
          <form onSubmit={submit} onInput={guard.markDirty} onChange={guard.markDirty}>
            <Stack>
              {error && (
                <Alert color="red" role="alert">
                  {error}
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
                disabled={saving}
              />
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  {t('people.circles.avatar')}
                </Text>
                <Group gap="md" align="center">
                  <Avatar
                    src={preview}
                    alt=""
                    size={56}
                    radius="md"
                    style={{ border: `3px solid ${appearance.color}` }}
                  />
                  <Group gap="xs">
                    <Button
                      type="button"
                      size="xs"
                      variant="default"
                      leftSection={<IconRefresh size={14} aria-hidden />}
                      onClick={shuffle}
                      disabled={saving}
                    >
                      {t('people.circles.shuffleAvatar')}
                    </Button>
                    <FileButton
                      onChange={(f: File | null) => void onUpload(f)}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                    >
                      {(props: { onClick: () => void }) => (
                        <Button
                          {...props}
                          type="button"
                          size="xs"
                          variant="light"
                          leftSection={<IconPhoto size={14} aria-hidden />}
                          disabled={saving}
                        >
                          {t('people.circles.uploadAvatar')}
                        </Button>
                      )}
                    </FileButton>
                  </Group>
                </Group>
                <Text size="xs" c="dimmed">
                  {t('people.circles.avatarHint')}
                </Text>
              </Stack>
              <ColorInput
                label={t('people.circles.color')}
                value={appearance.color}
                onChange={(color: string) => setAppearance((a) => ({ ...a, color }))}
                format="hex"
                swatches={[...SWATCHES]}
                swatchesPerRow={7}
                closeOnColorSwatchClick
                disabled={saving}
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
                disabled={saving}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={guard.requestClose} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={saving} disabled={saving}>
                  {t('people.circles.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Drawer>
      <ConfirmCloseModal opened={guard.asking} onDiscard={guard.discard} onKeep={guard.keepEditing} />
    </>
  );
}
