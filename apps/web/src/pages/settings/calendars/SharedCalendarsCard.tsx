import { Alert, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { SharedOwnerGroup } from '@/services/calendar-sharing';
import { CalendarCard } from './CalendarCard';
import { CalendarRow } from './CalendarRow';
import { useCalendarsTabModel } from './CalendarsTabProvider';

/** The calendars one person shares with you; color and hiding are yours alone. */
export function SharedCalendarsCard({ group }: { group: SharedOwnerGroup }): JSX.Element {
  const { t } = useTranslation();
  const tab = useCalendarsTabModel();
  const title = t('calendars.sharedBy', { name: group.ownerName });
  const error = tab.updateErrorFor(group.calendars.map((c) => c.id));
  return (
    <CalendarCard
      title={title}
      subtitle={t('calendars.sharedHint')}
      listLabel={t('connections.calendarsOf', { name: title })}
      notes={
        error && (
          <Alert color="red" role="alert" p="xs">
            <Text size="xs">{t('calendars.saveFailed', { message: error })}</Text>
          </Alert>
        )
      }
    >
      {group.calendars.map((c) => (
        <CalendarRow key={c.id} calendar={c} note={t(`sharing.level.${c.access}`)} editable={false} />
      ))}
    </CalendarCard>
  );
}
