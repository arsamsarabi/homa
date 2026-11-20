import { Alert, Button, Group, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { usePush } from '@/hooks/reminders';

/** Web push on this browser: on or off, with the browser's permission prompt. */
export function NotificationsSection(): JSX.Element {
  const { t } = useTranslation();
  const push = usePush();
  return (
    <Stack component="section" gap="xs" aria-labelledby="notifications-settings">
      <Title order={2} size="h4" id="notifications-settings">
        {t('push.title')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('push.hint')}
      </Text>
      {push.state === 'unsupported' && <Text size="sm">{t('push.unsupported')}</Text>}
      {push.state === 'denied' && <Text size="sm">{t('push.denied')}</Text>}
      {(push.state === 'off' || push.state === 'on' || push.state === 'loading') && (
        <Group>
          <Text size="sm" aria-live="polite">
            {push.state === 'on' ? t('push.on') : push.state === 'off' ? t('push.off') : ''}
          </Text>
          <Button
            size="xs"
            variant={push.state === 'on' ? 'default' : 'filled'}
            loading={push.busy || push.state === 'loading'}
            onClick={(): void => void (push.state === 'on' ? push.disable() : push.enable())}
          >
            {push.state === 'on' ? t('push.disable') : t('push.enable')}
          </Button>
        </Group>
      )}
      {push.error && (
        <Alert color="red" role="alert">
          {t('push.failed', { message: push.error })}
        </Alert>
      )}
    </Stack>
  );
}
