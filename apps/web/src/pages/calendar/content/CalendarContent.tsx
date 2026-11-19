import { Alert, Center, Loader } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { AgendaView } from '@/pages/calendar/agenda-view';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { MonthView } from '@/pages/calendar/month-view';
import { TimeGrid } from '@/pages/calendar/time-grid';
import { YearView } from '@/pages/calendar/year-view';

/** The current view, or its loading and error states. */
export function CalendarContent(): JSX.Element {
  const { t } = useTranslation();
  const { view, occurrences, actions } = useCalendarPageModel();

  if (occurrences.isPending)
    return (
      <Center mih={240}>
        <Loader aria-label={t('calendar.loading')} />
      </Center>
    );
  if (occurrences.isError)
    return (
      <QueryErrorAlert
        title={t('calendar.loadFailed')}
        error={occurrences.error}
        onRetry={() => void occurrences.refetch()}
      />
    );

  return (
    <>
      {actions.error && (
        <Alert color="red" role="alert" withCloseButton onClose={actions.clearError} mb="sm">
          {t('calendar.moveFailed', { message: actions.error })}
        </Alert>
      )}
      {(view === 'day' || view === 'week') && <TimeGrid />}
      {view === 'month' && <MonthView />}
      {view === 'year' && <YearView />}
      {view === 'agenda' && <AgendaView />}
    </>
  );
}
