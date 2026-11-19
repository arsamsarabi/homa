// Month view: whole weeks, up to three events per day. Drag an event to another day to move it.
import { Text, UnstyledButton } from '@mantine/core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Occurrence } from './api';
import { addDays, isoDate, localSpan, parseIsoDate, sameDay, startOfDay, touchesDay } from './dates';

const SHOWN = 3;

type Props = {
  month: Date;
  days: Date[];
  occurrences: Occurrence[];
  colors: Record<string, string>;
  locale: string;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (o: Occurrence) => void;
  onMove: (o: Occurrence, start: Date, end: Date) => void;
  onPickDay: (d: Date) => void;
};

export function MonthView({ month, days, occurrences, colors, locale, onCreate, onOpen, onMove, onPickDay }: Props) {
  const { t } = useTranslation();
  const [over, setOver] = useState<string>();
  const grab = useRef<{ o: Occurrence; from: string; moved: boolean }>(undefined);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dayNum = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const today = new Date();

  const cellAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-date]') as HTMLElement | null)?.dataset.date;

  function startDrag(e: React.PointerEvent, o: Occurrence, day: Date) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.stopPropagation();
    grab.current = { o, from: isoDate(day), moved: false };
    const move = (ev: PointerEvent) => {
      const g = grab.current;
      if (!g) return;
      const at = cellAt(ev.clientX, ev.clientY);
      if (at && at !== g.from) g.moved = true;
      setOver(g.moved ? at : undefined);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const g = grab.current;
      grab.current = undefined;
      setOver(undefined);
      if (!g) return;
      const at = cellAt(ev.clientX, ev.clientY);
      if (!g.moved || !at) return onOpen(g.o);
      const shift = Math.round((parseIsoDate(at).getTime() - parseIsoDate(g.from).getTime()) / 86_400_000);
      const s = new Date(g.o.start);
      const e2 = new Date(g.o.end);
      onMove(g.o, addDays(s, shift), addDays(e2, shift));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className="mv" style={{ '--weeks': days.length / 7 } as React.CSSProperties}>
      {days.slice(0, 7).map((d) => (
        <Text key={`h${d.getDay()}`} size="xs" c="dimmed" ta="center" fw={500} className="mv-head">
          {weekday.format(d)}
        </Text>
      ))}
      {days.map((d) => {
        const items = occurrences
          .filter((o) => touchesDay(localSpan(o), d))
          .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
        const key = isoDate(d);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: the day number button is the accessible way in; clicking blank space is a mouse shortcut
          // biome-ignore lint/a11y/useKeyWithClickEvents: as above
          <div
            key={key}
            data-date={key}
            className="mv-cell"
            data-outside={d.getMonth() !== month.getMonth() || undefined}
            data-over={over === key || undefined}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                const s = startOfDay(d);
                s.setHours(9);
                onCreate(s, new Date(s.getTime() + 3_600_000), false);
              }
            }}
          >
            <UnstyledButton
              className="mv-num"
              aria-current={sameDay(d, today) ? 'date' : undefined}
              onClick={() => onPickDay(d)}
            >
              {dayNum.format(d)}
            </UnstyledButton>
            {items.slice(0, SHOWN).map((o) => (
              <UnstyledButton
                key={`${o.eventId}${o.recurrenceId}`}
                className={o.allDay ? 'ev ev-chip' : 'ev ev-line'}
                style={{ '--c': colors[o.calendarId] } as React.CSSProperties}
                onPointerDown={(e) => startDrag(e, o, d)}
                onClick={(e) => {
                  if ((e.nativeEvent as PointerEvent).pointerType === 'touch' || e.detail === 0) onOpen(o);
                }}
              >
                {!o.allDay && <span className="ev-time">{time.format(new Date(o.start))}</span>}
                {o.summary || t('calendar.untitled')}
              </UnstyledButton>
            ))}
            {items.length > SHOWN && (
              <UnstyledButton className="mv-more" onClick={() => onPickDay(d)}>
                {t('calendar.more', { count: items.length - SHOWN })}
              </UnstyledButton>
            )}
          </div>
        );
      })}
    </div>
  );
}
