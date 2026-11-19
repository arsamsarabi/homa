import { Group, Kbd, Modal, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { SHORTCUTS } from '@/services/shortcuts';

export type ShortcutsHelpProps = { opened: boolean; onClose: () => void };

/** The keyboard shortcut sheet. */
export function ShortcutsHelp({ opened, onClose }: ShortcutsHelpProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={t('shortcuts.title')} size="sm">
      <Stack gap="xs">
        {SHORTCUTS.map((s) => (
          <Group key={s.hotkey} justify="space-between" wrap="nowrap">
            <Text size="sm">{t(`shortcuts.${s.command}`)}</Text>
            <Kbd>{s.label}</Kbd>
          </Group>
        ))}
        <Text size="xs" c="dimmed" mt="xs">
          {t('shortcuts.note')}
        </Text>
      </Stack>
    </Modal>
  );
}
