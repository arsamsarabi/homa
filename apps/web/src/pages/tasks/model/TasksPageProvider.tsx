import { createContext, type JSX, type ReactNode, useContext } from 'react';
import { type TasksPageModel, useTasksPage } from './useTasksPage';

const TasksPageContext = createContext<TasksPageModel | null>(null);

/** Builds the page model once and shares it with the page's children. */
export function TasksPageProvider({ children }: { children: ReactNode }): JSX.Element {
  return <TasksPageContext.Provider value={useTasksPage()}>{children}</TasksPageContext.Provider>;
}

export function useTasksPageModel(): TasksPageModel {
  const model = useContext(TasksPageContext);
  if (!model) throw new Error('useTasksPageModel must be used inside TasksPageProvider');
  return model;
}
