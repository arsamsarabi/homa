import { createContext, type JSX, type ReactNode, useContext } from 'react';
import { type CalendarPageModel, useCalendarPage } from './useCalendarPage';

const CalendarPageContext = createContext<CalendarPageModel | null>(null);

/** Builds the page model once and shares it with the page's children. */
export function CalendarPageProvider({ children }: { children: ReactNode }): JSX.Element {
  return <CalendarPageContext.Provider value={useCalendarPage()}>{children}</CalendarPageContext.Provider>;
}

export function useCalendarPageModel(): CalendarPageModel {
  const model = useContext(CalendarPageContext);
  if (!model) throw new Error('useCalendarPageModel must be used inside CalendarPageProvider');
  return model;
}
