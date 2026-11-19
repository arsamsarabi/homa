import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { VIEWS, type View } from '@/schemas';
import { viewTitle } from '@/services/calendar-layout';
import { step } from '@/services/dates';
import { newEventSlot } from '@/services/event-form';

export type CalendarToolbar = {
  title: string;
  view: View;
  views: { value: View; label: string }[];
  today: () => void;
  previous: () => void;
  next: () => void;
  pickView: (v: string) => void;
  newEvent: () => void;
};

export function useCalendarToolbar(): CalendarToolbar {
  const { t } = useTranslation();
  const { view, date, range, formats, go, drawer } = useCalendarPageModel();
  const views = useMemo(() => VIEWS.map((v) => ({ value: v, label: t(`calendar.views.${v}`) })), [t]);
  return {
    title: viewTitle(view, date, range, formats),
    view,
    views,
    today: (): void => go({ date: new Date() }),
    previous: (): void => go({ date: step(view, date, -1) }),
    next: (): void => go({ date: step(view, date, 1) }),
    pickView: (v: string): void => go({ view: v as View }),
    newEvent: (): void => {
      const { start, end } = newEventSlot(date, new Date());
      drawer.openCreate(start, end, false);
    },
  };
}
