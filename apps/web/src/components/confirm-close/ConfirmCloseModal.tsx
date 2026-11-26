import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

export type ConfirmCloseModalProps = {
  opened: boolean;
  onDiscard: () => void;
  onKeep: () => void;
};

/** Short confirm before discarding unsaved edits (Esc, overlay, Close). */
export function ConfirmCloseModal({ opened, onDiscard, onKeep }: ConfirmCloseModalProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onKeep} title={t('common.unsavedTitle')} centered>
      <Stack>
        <Text size="sm">{t('common.unsavedBody')}</Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onKeep}>
            {t('common.keepEditing')}
          </Button>
          <Button color="red" onClick={onDiscard}>
            {t('common.discard')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
