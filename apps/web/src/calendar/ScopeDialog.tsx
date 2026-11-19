// Asks which part of a recurring event a change or delete applies to.
import { Button, Modal, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scope } from './api';

type Ask = { action: 'change' | 'delete'; allowed: Scope[]; resolve: (s: Scope | null) => void };

/** `ask(...)` resolves with the chosen scope, or null if cancelled; render `dialog` once. */
export function useScopeDialog() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Ask>();
  const ask = (action: Ask['action'], allowed: Scope[] = ['this', 'following', 'all']) =>
    new Promise<Scope | null>((resolve) => setPending({ action, allowed, resolve }));
  const close = (s: Scope | null) => {
    pending?.resolve(s);
    setPending(undefined);
  };
  const dialog = (
    <Modal
      opened={Boolean(pending)}
      onClose={() => close(null)}
      title={t(`scope.${pending?.action ?? 'change'}Title`)}
      size="sm"
    >
      <Stack>
        <Text size="sm">{t('scope.question')}</Text>
        {(['this', 'following', 'all'] as const)
          .filter((s) => pending?.allowed.includes(s))
          .map((s) => (
            <Button key={s} variant={s === 'this' ? 'filled' : 'default'} onClick={() => close(s)}>
              {t(`scope.${s}`)}
            </Button>
          ))}
        <Button variant="subtle" onClick={() => close(null)}>
          {t('common.cancel')}
        </Button>
      </Stack>
    </Modal>
  );
  return { ask, dialog };
}
