// Importing Todoist's project CSVs. A finished import refetches the task lists and projects.
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type TodoistSummary, TodoistSummarySchema } from '@/schemas';
import { taskKeys } from './useTasks';

export type TodoistImportVars = { files: readonly File[]; tz: string };

export function useTodoistImport(): UseMutationResult<TodoistSummary, Error, TodoistImportVars> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, tz }: TodoistImportVars): Promise<TodoistSummary> =>
      TodoistSummarySchema.parse(
        await unwrap(
          homaClient.POST('/tasks/import/todoist', {
            body: { tz, files: await Promise.all(files.map(async (f) => ({ name: f.name, csv: await f.text() }))) },
          }),
        ),
      ),
    onSuccess: async (): Promise<void> => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKeys.all }),
        qc.invalidateQueries({ queryKey: taskKeys.projects }),
        qc.invalidateQueries({ queryKey: taskKeys.tags }),
      ]);
    },
  });
}
