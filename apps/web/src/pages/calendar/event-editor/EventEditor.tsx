// The create and edit panel. On wide screens it floats beside the event or the dashed draft, with the
// calendar still in view (not modal); on phones it's a bottom sheet. A new draft remounts the form.
import { Drawer, FocusTrap, Paper } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { type JSX, type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Draft } from '@/services/event-form';
import { type Box, placeBeside } from '@/services/popover';
import classes from './EventEditor.module.css';
import { EventForm } from './EventForm';

export function EventEditor(): JSX.Element | null {
  const { t, i18n } = useTranslation();
  const { draft, anchor, close } = useCalendarPageModel().editor;
  const phone = useMediaQuery('(max-width: 48em)');
  const label = t(draft?.kind === 'edit' ? 'editor.editTitle' : 'editor.newTitle');
  const key = JSON.stringify(draft);

  if (phone) {
    return (
      <Drawer
        opened={draft !== undefined}
        onClose={close}
        position="bottom"
        size="auto"
        padding="md"
        withCloseButton={false}
        aria-label={label}
        classNames={{ content: classes.sheet }}
      >
        {draft && <EventForm key={key} draft={draft} />}
      </Drawer>
    );
  }
  if (!draft) return null;
  return (
    <FloatingPanel key={key} draft={draft} label={label} anchor={anchor} rtl={i18n.dir() === 'rtl'} onClose={close} />
  );
}

type PanelProps = { draft: Draft; label: string; anchor: Box | undefined; rtl: boolean; onClose: () => void };

function FloatingPanel({ draft, label, anchor, rtl, onClose }: PanelProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>();
  useLayoutEffect(() => {
    const place = (): void => {
      const el = ref.current;
      if (!el) return;
      // A new event sits beside its dashed placeholder; an existing one beside where it was opened.
      const draftBox = document.querySelector('[data-draft]')?.getBoundingClientRect();
      const box = draftBox
        ? { top: draftBox.top, left: draftBox.left, width: draftBox.width, height: draftBox.height }
        : anchor;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      setPos(placeBeside(box, size, { width: window.innerWidth, height: window.innerHeight }, rtl));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor, rtl]);

  return (
    <Paper
      ref={ref}
      role="dialog"
      aria-label={label}
      shadow="lg"
      withBorder
      radius="md"
      p="md"
      className={classes.panel}
      style={pos ?? { visibility: 'hidden' }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <FocusTrap active>
        <div>
          <EventForm draft={draft} />
        </div>
      </FocusTrap>
    </Paper>
  );
}
