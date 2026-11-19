import { useMemo } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { type AgendaGroup, agendaGroups } from '@/services/calendar-layout';

export type AgendaViewModel = { groups: AgendaGroup[]; open: (o: Occurrence) => void };

export function useAgendaView(): AgendaViewModel {
  const { range, occurrences, drawer } = useCalendarPageModel();
  const occ = occurrences.data;
  const groups = useMemo((): AgendaGroup[] => agendaGroups(range.days, occ ?? []), [range.days, occ]);
  return { groups, open: drawer.openEdit };
}
