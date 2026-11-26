import { Button, Text, Title } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusCard } from '@/components';

/** Full-page 404: decorative code, short copy, single path back to the calendar. */
export function NotFoundPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <StatusCard
      title={t('errors.notFoundTitle')}
      eyebrow={
        <Title order={2} ta="center" c="dimmed" fw={700} style={{ fontSize: '3rem', lineHeight: 1 }}>
          {t('errors.notFoundCode')}
        </Title>
      }
    >
      <Text ta="center" size="sm">
        {t('errors.notFoundBody')}
      </Text>
      <Button onClick={(): void => void navigate({ to: '/' })}>{t('errors.goCalendar')}</Button>
    </StatusCard>
  );
}
