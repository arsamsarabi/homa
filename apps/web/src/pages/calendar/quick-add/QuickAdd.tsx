import { Badge, Button, Group, Text, TextInput } from '@mantine/core';
import { IconBolt } from '@tabler/icons-react';
import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ShortcutHint } from '@/components';
import classes from './QuickAdd.module.css';
import { QUICK_ADD_INPUT_ID, useQuickAdd } from './useQuickAdd';

/** One line that becomes an event: "Dentist tue 3pm 45m". Shows what it will create as you type. */
export function QuickAdd(): JSX.Element {
  const { t } = useTranslation();
  const q = useQuickAdd();
  const p = q.preview;
  const preview = p && (
    <Group gap={6} className={classes.preview} data-testid="quick-add-preview">
      {q.calendarColor && <span className={classes.dot} style={{ background: q.calendarColor }} aria-hidden />}
      <Text size="sm" fw={600}>
        {p.title || t('calendar.untitled')}
      </Text>
      <Badge variant="light" tt="none">
        {p.when}
      </Badge>
      {p.jalali && (
        <Badge variant="outline" tt="none">
          {p.jalali}
        </Badge>
      )}
      {p.length && (
        <Badge variant="light" color="gray" tt="none">
          {p.length}
        </Badge>
      )}
      {p.repeatText && (
        <Badge variant="light" color="gray" tt="none">
          {p.repeatText}
        </Badge>
      )}
      <Text size="sm" c="dimmed">
        {q.calendarName ?? t('quickAdd.noCalendar')}
      </Text>
      {p.defaulted && (
        <Text size="xs" c="dimmed">
          {t('quickAdd.noDate')}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {t(q.noCalendar ? 'quickAdd.hintNoCalendar' : 'quickAdd.hint')}
      </Text>
    </Group>
  );
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <TextInput
        id={QUICK_ADD_INPUT_ID}
        flex={1}
        aria-label={t('quickAdd.label')}
        placeholder={t('quickAdd.placeholder')}
        leftSection={<IconBolt size={16} aria-hidden />}
        rightSection={q.text ? undefined : <ShortcutHint command="quickAdd" />}
        value={q.text}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => q.setText(e.currentTarget.value)}
        onKeyDown={q.onKeyDown}
        readOnly={q.busy}
        maxLength={500}
        autoComplete="off"
        error={q.error}
        // The preview is the input's description, so screen readers read it with the field.
        description={preview}
        descriptionProps={{ component: 'div' }}
        inputWrapperOrder={['label', 'input', 'description', 'error']}
      />
      <Button variant="default" onClick={q.more} disabled={!q.text.trim()}>
        {t('quickAdd.more')}
      </Button>
    </Group>
  );
}
