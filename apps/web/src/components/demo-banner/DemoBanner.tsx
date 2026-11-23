import { Paper, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './DemoBanner.module.css';

/** A note pinned to the corner of every page on a demo instance. */
export function DemoBanner(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Paper className={classes.banner} role="note" shadow="sm" withBorder px="sm" py={6}>
      <Text size="sm">{t('demo.banner')}</Text>
    </Paper>
  );
}
