import { Stack } from '@mantine/core';
import type { JSX } from 'react';
import { CalendarContent } from '@/pages/calendar/content';
import { EventEditor } from '@/pages/calendar/event-editor';
import { CalendarPageProvider } from '@/pages/calendar/model';
import { QuickAdd } from '@/pages/calendar/quick-add';
import { ScopeModal } from '@/pages/calendar/scope-modal';
import { CalendarToolbar } from '@/pages/calendar/toolbar';

/** The calendar: toolbar, quick add, the current view, the event editor and the scope question. */
export function CalendarPage(): JSX.Element {
  return (
    <CalendarPageProvider>
      <Stack gap="md">
        <CalendarToolbar />
        <QuickAdd />
        <CalendarContent />
      </Stack>
      <EventEditor />
      <ScopeModal />
    </CalendarPageProvider>
  );
}
