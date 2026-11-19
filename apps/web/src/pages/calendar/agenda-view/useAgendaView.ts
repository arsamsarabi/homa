import { useMemo } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { type AgendaGroup, agendaGroups } from '@/services/calendar-layout';
import { type Span, wallSpan } from '@/services/dates';
import { type Occasion, occasionsOn } from '@/services/jalali';

export type AgendaViewModel = {
  groups: AgendaGroup[];
  open: (o: Occurrence) => void;
  /** An occurrence's times as wall times in the viewed zone. */
  span: (o: Occurrence) => Span;
  /** Persian occasions on a day, when the Jalali calendar is on. */
  occasions: (day: Date) => Occasion[];
};

export function useAgendaView(): AgendaViewModel {
  const { range, tz, secondary, occurrences, drawer } = useCalendarPageModel();
  const occ = occurrences.data;
  const groups = useMemo((): AgendaGroup[] => agendaGroups(range.days, occ ?? [], tz), [range.days, occ, tz]);
  return {
    groups,
    open: drawer.openEdit,
    span: (o: Occurrence): Span => wallSpan(o, tz),
    occasions: (day: Date): Occasion[] => (secondary === 'jalali' ? occasionsOn(day) : []),
  };
}
