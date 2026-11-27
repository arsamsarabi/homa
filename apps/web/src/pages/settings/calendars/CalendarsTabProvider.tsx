import { createContext, type JSX, type ReactNode, useContext } from 'react';
import { type CalendarsTabModel, useCalendarsTab } from './useCalendarsTab';

const Context = createContext<CalendarsTabModel | null>(null);

/** Runs useCalendarsTab once and shares it with the cards and drawers of Settings → Calendars. */
export function CalendarsTabProvider({ children }: { children: ReactNode }): JSX.Element {
  return <Context.Provider value={useCalendarsTab()}>{children}</Context.Provider>;
}

export function useCalendarsTabModel(): CalendarsTabModel {
  const model = useContext(Context);
  if (!model) throw new Error('useCalendarsTabModel needs a CalendarsTabProvider');
  return model;
}
