import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { VIEWS, type View } from '@/schemas';
import { jalaliViewTitle, viewTitle } from '@/services/calendar-layout';
import { step } from '@/services/dates';
import { newEventSlot } from '@/services/event-form';
import { instantOf, timeZones, wallOf } from '@/services/zones';

export type CalendarToolbar = {
  title: string;
  /** The Jalali months shown, when that calendar is on. */
  jalaliTitle: string | undefined;
  view: View;
  views: { value: View; label: string }[];
  tz: string;
  zones: string[];
  today: () => void;
  previous: () => void;
  next: () => void;
  pickView: (v: string) => void;
  pickZone: (tz: string | null) => void;
  newEvent: () => void;
};

export function useCalendarToolbar(): CalendarToolbar {
  const { t } = useTranslation();
  const { view, date, range, formats, secondary, today, tz, homeTz, go, setZone, drawer } = useCalendarPageModel();
  const views = useMemo(() => VIEWS.map((v) => ({ value: v, label: t(`calendar.views.${v}`) })), [t]);
  const zones = useMemo((): string[] => timeZones(), []);
  return {
    title: viewTitle(view, date, range, formats),
    jalaliTitle: secondary === 'jalali' ? jalaliViewTitle(view, date, range, formats) : undefined,
    view,
    views,
    tz,
    zones,
    today: (): void => go({ date: today }),
    previous: (): void => go({ date: step(view, date, -1) }),
    next: (): void => go({ date: step(view, date, 1) }),
    pickView: (v: string): void => go({ view: v as View }),
    pickZone: (zone: string | null): void => setZone(zone ?? homeTz),
    newEvent: (): void => {
      const { start, end } = newEventSlot(date, wallOf(new Date(), tz));
      drawer.openCreate(instantOf(start, tz), instantOf(end, tz), false);
    },
  };
}
