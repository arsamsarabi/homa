import { Button, Modal, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sessionQuery } from '@/hooks/session';

const KEY = 'homa-demo-welcome-seen';

const seenFor = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** On a demo instance, a centered note when someone signs in: shared account, nightly reset. Once per sign-in. */
export function DemoWelcome(): JSX.Element | null {
  const { t } = useTranslation();
  const sessionId = useQuery(sessionQuery).data?.session.id;
  const [closed, setClosed] = useState<string | null>(seenFor);
  const close = (): void => {
    if (!sessionId) return;
    setClosed(sessionId);
    try {
      localStorage.setItem(KEY, sessionId);
    } catch {
      // Private mode or blocked storage: it just shows again next time.
    }
  };
  if (!sessionId || closed === sessionId) return null;
  return (
    <Modal opened onClose={close} centered title={t('demo.welcomeTitle')}>
      <Text size="sm" mb="md">
        {t('demo.banner')}
      </Text>
      <Button fullWidth onClick={close} data-autofocus>
        {t('demo.gotIt')}
      </Button>
    </Modal>
  );
}
