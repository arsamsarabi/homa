// Importing an .ics file into a calendar. A finished import refetches the occurrences on screen.
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type ImportSummary, ImportSummarySchema } from '@/schemas';
import { calendarKeys } from './queries';

export type IcsImportVars = { calendarId: string; file: File };

/**
 * @example
 * const importer = useIcsImport();
 * importer.mutate({ calendarId, file }); // then importer.data is the summary
 */
export function useIcsImport(): UseMutationResult<ImportSummary, Error, IcsImportVars> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ calendarId, file }: IcsImportVars): Promise<ImportSummary> =>
      ImportSummarySchema.parse(
        await unwrap(
          homaClient.POST('/calendars/{id}/import', {
            params: { path: { id: calendarId } },
            body: await file.text(),
            bodySerializer: (body: string): string => body,
            headers: { 'content-type': 'text/calendar' },
          }),
        ),
      ),
    onSuccess: async (): Promise<void> => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: calendarKeys.occurrences }),
        qc.invalidateQueries({ queryKey: ['event'] }),
      ]);
    },
  });
}
