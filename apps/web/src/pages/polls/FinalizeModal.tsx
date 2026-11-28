import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendars } from '@/hooks/calendar';
import { usePollMutations } from '@/hooks/polls';
import { useHomeZone } from '@/hooks/settings';
import type { Poll } from '@/schemas';
import { isWritableCalendar } from '@/services/calendar-sharing';
import { slotLabel } from '@/services/polls';
import { useAnnouncer } from '@/stores';

export type FinalizeModalProps = { poll: Poll; slotId: string | undefined; onClose: () => void };

/** Confirms the chosen time and the calendar for the event; everyone who ranked it gets a copy. */
export function FinalizeModal({ poll, slotId, onClose }: FinalizeModalProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const calendars = useCalendars();
  const { finalize } = usePollMutations();
  const announce = useAnnouncer((s) => s.announce);
  const writable = (calendars.data ?? []).filter(isWritableCalendar);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  useEffect(() => setCalendarId(poll.calendarId ?? writable[0]?.id ?? null), [slotId, calendars.data]);

  const slot = poll.slots.find((s) => s.id === slotId);
  const result = poll.results.find((r) => r.slotId === slotId);
  const others = (result?.canMake ?? []).filter((id) => id !== poll.me.participantId).length;

  return (
    <Modal opened={Boolean(slot)} onClose={onClose} title={t('polls.finalizeTitle')}>
      {slot && (
        <Stack>
          <Text fw={600}>{slotLabel(slot.start, slot.end, i18n.language, tz)}</Text>
          {result && !result.eligible && <Alert color="yellow">{t('polls.notRecommended')}</Alert>}
          <Select
            label={t('polls.fields.calendar')}
            data={writable.map((c) => ({ value: c.id, label: c.name }))}
            value={calendarId}
            onChange={setCalendarId}
            allowDeselect={false}
          />
          <Text size="sm">{t('polls.copies', { count: others })}</Text>
          {finalize.error && (
            <Alert color="red" role="alert">
              {finalize.error.message}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!calendarId}
              loading={finalize.isPending}
              onClick={(): void => {
                if (!calendarId) return;
                finalize.mutate(
                  { id: poll.id, slotId: slot.id, calendarId },
                  {
                    onSuccess: (): void => {
                      announce(t('polls.finalized', { title: poll.title }));
                      onClose();
                    },
                  },
                );
              }}
            >
              {t('polls.setTime')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
