import { Alert, Button, ColorInput, Drawer, Group, Stack, TextInput } from '@mantine/core';
import { type FormEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarUpdate } from '@/hooks/calendar';
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

  const close = (): void => {
    editCalendar.reset();
    setColor(undefined);
    onClose();
  };

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!calendar) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    editCalendar.mutate(
      { id: calendar.id, name, color: color ?? calendar.color },
      {
        onSuccess: () => {
          announce(t('connections.calendarSaved'));
          close();
        },
      },
    );
  };

  return (
    <Drawer
      opened={calendar !== undefined}
      onClose={close}
      position="right"
      size="md"
      padding="lg"
      title={t('connections.editTitle')}
    >
      {calendar && (
        <form onSubmit={submit}>
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
              onChange={setColor}
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
              <Button variant="default" onClick={close}>
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
  );
}
