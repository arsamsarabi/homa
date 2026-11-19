import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

export type QueryErrorAlertProps = { title: string; error: Error; onRetry: () => void };

/** A failed load, with the reason and a retry button. */
export function QueryErrorAlert({ title, error, onRetry }: QueryErrorAlertProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Alert color="red" role="alert" title={title} icon={<IconAlertTriangle size={18} aria-hidden />}>
      <Group justify="space-between" wrap="wrap">
        <Text size="sm">{error.message}</Text>
        <Button size="xs" variant="default" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </Group>
    </Alert>
  );
}
