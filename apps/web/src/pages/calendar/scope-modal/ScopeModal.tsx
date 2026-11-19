import { Button, Modal, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { SCOPES } from '@/schemas';

/** "This event, this and following, or all?" for changes and deletes to repeating events. */
export function ScopeModal(): JSX.Element {
  const { t } = useTranslation();
  const { question, answer } = useCalendarPageModel().scope;
  return (
    <Modal
      opened={question !== undefined}
      onClose={() => answer(null)}
      title={t(`scope.${question?.action ?? 'change'}Title`)}
      size="sm"
    >
      <Stack>
        <Text size="sm">{t('scope.question')}</Text>
        {SCOPES.filter((s) => question?.allowed.includes(s)).map((s) => (
          <Button key={s} variant={s === 'this' ? 'filled' : 'default'} onClick={() => answer(s)}>
            {t(`scope.${s}`)}
          </Button>
        ))}
        <Button variant="subtle" onClick={() => answer(null)}>
          {t('common.cancel')}
        </Button>
      </Stack>
    </Modal>
  );
}
