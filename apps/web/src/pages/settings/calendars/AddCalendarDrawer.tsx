import { Drawer, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './AddCalendarDrawer.module.css';
import { useCalendarsTabModel } from './CalendarsTabProvider';
import type { AddSource } from './useCalendarsTab';

type Option = { key: string; source: AddSource };

const OPTIONS: readonly Option[] = [
  { key: 'google', source: { kind: 'google' } },
  { key: 'microsoft', source: { kind: 'microsoft' } },
  { key: 'icloud', source: { kind: 'caldav', preset: 'icloud' } },
  { key: 'fastmail', source: { kind: 'caldav', preset: 'fastmail' } },
  { key: 'nextcloud', source: { kind: 'caldav', preset: 'nextcloud' } },
  { key: 'caldav', source: { kind: 'caldav', preset: 'other' } },
  { key: 'link', source: { kind: 'link' } },
  { key: 'holidays', source: { kind: 'holidays' } },
];

/** "Where is the calendar?": one choice per place a calendar can come from, each leading to its own form. */
export function AddCalendarDrawer(): JSX.Element {
  const { t } = useTranslation();
  const tab = useCalendarsTabModel();
  // Google and Outlook only when the server is set up for them.
  const options = OPTIONS.filter(
    (o) => (o.source.kind !== 'google' && o.source.kind !== 'microsoft') || tab.providers[o.source.kind],
  );
  return (
    <Drawer
      opened={tab.picker.opened}
      onClose={tab.picker.close}
      position="right"
      size="md"
      padding="lg"
      title={t('addCalendar.title')}
    >
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          {t('addCalendar.question')}
        </Text>
        <Stack component="ul" gap="xs" className={classes.list}>
          {options.map((o) => (
            <li key={o.key}>
              <UnstyledButton className={classes.option} onClick={(): void => tab.picker.add(o.source)}>
                <Stack gap={2}>
                  <Text size="sm" fw={600}>
                    {t(`addCalendar.options.${o.key}`)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(`addCalendar.hints.${o.key}`)}
                  </Text>
                </Stack>
                <IconChevronRight size={16} className={classes.chevron} aria-hidden />
              </UnstyledButton>
            </li>
          ))}
        </Stack>
      </Stack>
    </Drawer>
  );
}
