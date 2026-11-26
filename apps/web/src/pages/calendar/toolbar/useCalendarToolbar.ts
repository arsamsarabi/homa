import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { VIEWS, type View } from '@/schemas';
import { jalaliViewTitle, viewTitle } from '@/services/calendar-layout';
import { step } from '@/services/dates';
import { newEventSlot } from '@/services/event-form';
import { instantOf, wallOf } from '@/services/zones';

export type CalendarToolbar = {
  title: string;
  /** The Jalali months shown, when that calendar is on. */
  jalaliTitle: string | undefined;
  view: View;
  views: { value: View; label: string }[];
  tz: string;
  today: () => void;
  previous: () => void;
  next: () => void;
  pickView: (v: string) => void;
  newEvent: () => void;
};

export function useCalendarToolbar(): CalendarToolbar {
  const { t } = useTranslation();
  const { view, date, range, formats, secondary, today, tz, go, editor } = useCalendarPageModel();
  const views = useMemo(() => VIEWS.map((v) => ({ value: v, label: t(`calendar.views.${v}`) })), [t]);
  return {
    title: viewTitle(view, date, range, formats),
    jalaliTitle: secondary === 'jalali' ? jalaliViewTitle(view, date, range, formats) : undefined,
    view,
    views,
    tz,
    today: (): void => go({ date: today }),
    previous: (): void => go({ date: step(view, date, -1) }),
    next: (): void => go({ date: step(view, date, 1) }),
    pickView: (v: string): void => go({ view: v as View }),
    newEvent: (): void => {
      const { start, end } = newEventSlot(date, wallOf(new Date(), tz));
      editor.openCreate(instantOf(start, tz), instantOf(end, tz), false);
    },
  };
}
