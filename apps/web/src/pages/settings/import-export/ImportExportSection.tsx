import { Alert, Button, FileInput, Group, List, Select, Stack, Text, Title } from '@mantine/core';
import { type JSX, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useCalendars, useIcsImport } from '@/hooks/calendar';
import { useAnnouncer } from '@/stores';

/** Settings section: import an .ics file into a calendar, and download all your data as JSON. */
export function ImportExportSection(): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const calendars = useCalendars();
  const importer = useIcsImport();
  const announce = useAnnouncer((s) => s.announce);
  const [picked, setPicked] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  // Import is owner-only (shared calendars answer 404); subscriptions stay out too.
  const writable = useMemo(() => calendars.data?.filter((c) => c.access === 'owner' && !c.readOnly), [calendars.data]);
  const calendarId = picked ?? writable?.[0]?.id ?? null;

  const run = (): void => {
    if (!calendarId || !file) return;
    importer.mutate({ calendarId, file }, { onSuccess: () => announce(t('importExport.done')) });
  };

  return (
    <Stack component="section" aria-labelledby={headingId}>
      <Title order={2} size="h3" id={headingId}>
        {t('importExport.title')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('importExport.importHint')}
      </Text>
      {calendars.isError && (
        <QueryErrorAlert
          title={t('importExport.calendarsFailed')}
          error={calendars.error}
          onRetry={() => void calendars.refetch()}
        />
      )}
      <Select
        label={t('importExport.calendar')}
        data={writable?.map((c) => ({ value: c.id, label: c.name })) ?? []}
        value={calendarId}
        onChange={setPicked}
        disabled={!calendars.data}
        allowDeselect={false}
      />
      <FileInput
        label={t('importExport.file')}
        placeholder={t('importExport.filePlaceholder')}
        accept=".ics,text/calendar"
        value={file}
        onChange={setFile}
        clearable
      />
      <Group>
        <Button onClick={run} disabled={!calendarId || !file} loading={importer.isPending}>
          {t('importExport.import')}
        </Button>
        {importer.isPending && (
          <Text size="sm" role="status">
            {t('importExport.importing')}
          </Text>
        )}
      </Group>
      {importer.isError && (
        <Alert color="red" role="alert">
          {t('importExport.failed', { message: importer.error.message })}
        </Alert>
      )}
      {importer.isSuccess && (
        <Alert color="green" title={t('importExport.done')}>
          <Text size="sm">{t('importExport.summary', importer.data)}</Text>
          {importer.data.warnings.length > 0 && (
            <>
              <Text size="sm" fw={600} mt="xs">
                {t('importExport.warnings')}
              </Text>
              <List size="sm">
                {importer.data.warnings.map((w) => (
                  <List.Item key={w}>{w}</List.Item>
                ))}
              </List>
            </>
          )}
        </Alert>
      )}
      <Text size="sm" c="dimmed" mt="md">
        {t('importExport.exportHint')}
      </Text>
      <Group>
        {/* A plain link: the browser downloads the attachment with the session cookie. */}
        <Button component="a" href="/api/export" download variant="default">
          {t('importExport.export')}
        </Button>
      </Group>
    </Stack>
  );
}
