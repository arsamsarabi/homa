import { Alert, Button, ColorInput, Drawer, Group, Stack, TextInput } from '@mantine/core';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal } from '@/components';
import { useCalendarUpdate } from '@/hooks/calendar';
import { useConfirmClose } from '@/hooks/confirm-close';
import type { Calendar } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { SWATCHES } from './swatches';

export type CalendarEditDrawerProps = { calendar: Calendar | undefined; onClose: () => void };

/** Rename or recolor a calendar. For a connected one, only Homa's copy changes, not the original. */
export function CalendarEditDrawer({ calendar, onClose }: CalendarEditDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const editCalendar = useCalendarUpdate();
  const announce = useAnnouncer((s) => s.announce);
  const [color, setColor] = useState<string>();
  const guard = useConfirmClose(() => {
    editCalendar.reset();
    setColor(undefined);
    onClose();
  });
  useEffect(() => {
    guard.resetDirty();
  }, [calendar?.id]);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!calendar) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    editCalendar.mutate(
      { id: calendar.id, name, color: color ?? calendar.color },
      {
        onSuccess: () => {
          announce(t('connections.calendarSaved'));
          guard.forceClose();
        },
      },
    );
  };

  return (
    <>
      <Drawer
        opened={calendar !== undefined}
        onClose={guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={t('connections.editTitle')}
      >
        {calendar && (
          <form onSubmit={submit} onInput={guard.markDirty} onChange={guard.markDirty}>
            <Stack>
              <TextInput
                name="name"
                label={t('connections.name')}
                defaultValue={calendar.name}
                maxLength={100}
                required
                data-autofocus
              />
              <ColorInput
                label={t('connections.color')}
                value={color ?? calendar.color}
                onChange={(v: string): void => {
                  guard.markDirty();
                  setColor(v);
                }}
                format="hex"
                swatches={[...SWATCHES]}
                swatchesPerRow={7}
                closeOnColorSwatchClick
              />
              {editCalendar.isError && (
                <Alert color="red" role="alert">
                  {editCalendar.error.message}
                </Alert>
              )}
              <Group justify="flex-end">
                <Button variant="default" onClick={guard.requestClose}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={editCalendar.isPending}>
                  {t('connections.save')}
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
