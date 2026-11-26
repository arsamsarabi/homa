import { Stack } from '@mantine/core';
import type { JSX } from 'react';
import { CalendarContent } from '@/pages/calendar/content';
import { EventEditor } from '@/pages/calendar/event-editor';
import { CalendarPageProvider, useCalendarPageModel } from '@/pages/calendar/model';
import { QuickAdd } from '@/pages/calendar/quick-add';
import { ScopeModal } from '@/pages/calendar/scope-modal';
import { CalendarToolbar } from '@/pages/calendar/toolbar';
import classes from './CalendarPage.module.css';

/** The calendar: toolbar, quick add, the current view, the event editor and the scope question. */
export function CalendarPage(): JSX.Element {
  return (
    <CalendarPageProvider>
      <CalendarPageBody />
      <EventEditor />
      <ScopeModal />
    </CalendarPageProvider>
  );
}

function CalendarPageBody(): JSX.Element {
  const { view } = useCalendarPageModel();
  const fill = view === 'day' || view === 'week';
  return (
    <Stack gap="md" className={fill ? classes.fill : undefined}>
      <CalendarToolbar />
      <QuickAdd />
      <div className={fill ? classes.content : undefined}>
        <CalendarContent />
      </div>
    </Stack>
  );
}
