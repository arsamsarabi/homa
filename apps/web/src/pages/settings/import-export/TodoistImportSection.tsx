import { Alert, Button, FileInput, Group, Stack, Text, Title } from '@mantine/core';
import { type JSX, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomeZone } from '@/hooks/settings';
import { useTodoistImport } from '@/hooks/tasks';
import { useAnnouncer } from '@/stores';

/** Settings section: import Todoist's project CSVs into tasks, one project per file. */
export function TodoistImportSection(): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const tz = useHomeZone();
  const importer = useTodoistImport();
  const announce = useAnnouncer((s) => s.announce);
  const [files, setFiles] = useState<File[]>([]);

  const run = (): void =>
    importer.mutate(
      { files, tz },
      {
        onSuccess: () => {
          announce(t('todoist.done'));
          setFiles([]);
        },
      },
    );

  return (
    <Stack component="section" aria-labelledby={headingId} mt="xl">
      <Title order={2} size="h3" id={headingId}>
        {t('todoist.title')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('todoist.hint')}
      </Text>
      <FileInput
        label={t('todoist.files')}
        placeholder={t('todoist.filesPlaceholder')}
        accept=".csv,text/csv"
        multiple
        value={files}
        onChange={setFiles}
        clearable
      />
      <Group>
        <Button onClick={run} disabled={files.length === 0} loading={importer.isPending}>
          {t('todoist.import')}
        </Button>
        {importer.isPending && (
          <Text size="sm" role="status">
            {t('todoist.importing')}
          </Text>
        )}
      </Group>
      {importer.isError && (
        <Alert color="red" role="alert">
          {t('todoist.failed', { message: importer.error.message })}
        </Alert>
      )}
      {importer.isSuccess && (
        <Alert color="green" title={t('todoist.done')}>
          <Text size="sm">{t('todoist.summary', importer.data)}</Text>
          {importer.data.unreadDates > 0 && (
            <Text size="sm">{t('todoist.unreadDates', { count: importer.data.unreadDates })}</Text>
          )}
          {importer.data.sections > 0 && (
            <Text size="sm">{t('todoist.sections', { count: importer.data.sections })}</Text>
          )}
        </Alert>
      )}
    </Stack>
  );
}
