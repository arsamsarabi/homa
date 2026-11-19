import { Stack } from '@mantine/core';
import type { JSX } from 'react';
import { CalendarContent } from '@/pages/calendar/content';
import { EventDrawer } from '@/pages/calendar/event-drawer';
import { CalendarPageProvider } from '@/pages/calendar/model';
import { ScopeModal } from '@/pages/calendar/scope-modal';
import { CalendarToolbar } from '@/pages/calendar/toolbar';

/** The calendar: toolbar, the current view, the event drawer and the scope question. */
export function CalendarPage(): JSX.Element {
  return (
    <CalendarPageProvider>
      <Stack gap="md">
        <CalendarToolbar />
        <CalendarContent />
      </Stack>
      <EventDrawer />
      <ScopeModal />
    </CalendarPageProvider>
  );
}
