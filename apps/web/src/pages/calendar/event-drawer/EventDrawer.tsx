import { Drawer } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { EventForm } from './EventForm';

/** The create and edit drawer. A new draft remounts the form so it starts fresh. */
export function EventDrawer(): JSX.Element {
  const { t } = useTranslation();
  const { draft, close } = useCalendarPageModel().drawer;
  return (
    <Drawer
      opened={draft !== undefined}
      onClose={close}
      position="right"
      size="md"
      padding="lg"
      title={t(draft?.kind === 'edit' ? 'editor.editTitle' : 'editor.newTitle')}
    >
      {draft && <EventForm key={JSON.stringify(draft)} draft={draft} />}
    </Drawer>
  );
}
