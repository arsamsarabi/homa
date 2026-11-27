import { Alert, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCard } from './CalendarCard';
import { CalendarRow } from './CalendarRow';
import { useCalendarsTabModel } from './CalendarsTabProvider';

/** Your calendars stored in Homa itself, which you can share with people. */
export function HomaCalendarsCard(): JSX.Element {
  const { t } = useTranslation();
  const tab = useCalendarsTabModel();
  const error = tab.updateErrorFor(tab.homa.map((c) => c.id));
  const title = t('calendars.homaTitle');
  return (
    <CalendarCard
      title={title}
      subtitle={t('calendars.homaHint')}
      listLabel={t('connections.calendarsOf', { name: title })}
      notes={
        error && (
          <Alert color="red" role="alert" p="xs">
            <Text size="xs">{t('calendars.saveFailed', { message: error })}</Text>
          </Alert>
        )
      }
    >
      {tab.homa.map((c) => (
        <CalendarRow key={c.id} calendar={c} editable />
      ))}
    </CalendarCard>
  );
}
