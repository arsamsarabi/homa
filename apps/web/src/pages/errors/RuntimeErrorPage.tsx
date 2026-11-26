import { Accordion, Button, Stack, Text } from '@mantine/core';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusCard } from '@/components/status-card';

export type RuntimeErrorPageProps = {
  error: unknown;
  onRetry: () => void;
};

/** Full-page runtime error: retry, go home, and collapsed technical details. */
export function RuntimeErrorPage({ error, onRetry }: RuntimeErrorPageProps): JSX.Element {
  const { t } = useTranslation();
  const [details, setDetails] = useState<string | null>(null);
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    <StatusCard title={t('errors.runtimeTitle')}>
      <Text ta="center" size="sm">
        {t('errors.runtimeBody')}
      </Text>
      <Stack gap="xs">
        <Button onClick={onRetry}>{t('errors.tryAgain')}</Button>
        <Button variant="default" onClick={(): void => window.location.assign('/')}>
          {t('errors.goCalendar')}
        </Button>
      </Stack>
      {message ? (
        <Accordion
          variant="contained"
          chevronPosition="left"
          keepMounted={false}
          transitionDuration={0}
          value={details}
          onChange={setDetails}
        >
          <Accordion.Item value="details">
            <Accordion.Control>{t('errors.details')}</Accordion.Control>
            <Accordion.Panel>
              <Text size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {message}
              </Text>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      ) : null}
    </StatusCard>
  );
}
