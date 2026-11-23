import { Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type JSX, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useCircleMutations, useCircles, usePeople } from '@/hooks/people';
import type { Circle } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { CircleDrawer, type CircleDrawerTarget } from './CircleDrawer';
import classes from './PeopleSection.module.css';

/** Your circles: named groups of people here, only you see them. */
export function CirclesPanel(): JSX.Element {
  const { t, i18n } = useTranslation();
  const circles = useCircles();
  const people = usePeople();
  const { remove } = useCircleMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [target, setTarget] = useState<CircleDrawerTarget>();
  const names = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.name])), [people.data]);
  const list = useMemo(() => new Intl.ListFormat(i18n.language, { type: 'conjunction' }), [i18n.language]);
  const members = (c: Circle): string =>
    c.memberIds.length ? list.format(c.memberIds.map((id) => names.get(id) ?? '…')) : t('people.circles.noMembers');

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={3} size="h5">
          {t('people.circles.title')}
        </Title>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} aria-hidden />}
          onClick={(): void => setTarget({ kind: 'create' })}
        >
          {t('people.circles.new')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        {t('people.circles.hint')}
      </Text>
      {circles.isPending && <Loader size="sm" aria-label={t('common.loading')} />}
      {circles.error && (
        <QueryErrorAlert
          title={t('people.circles.loadFailed')}
          error={circles.error}
          onRetry={(): void => void circles.refetch()}
        />
      )}
      {circles.data?.length === 0 && <Text size="sm">{t('people.circles.empty')}</Text>}
      <Stack component="ul" gap={0} className={classes.list} aria-label={t('people.circles.title')}>
        {circles.data?.map((c) => (
          <Group component="li" key={c.id} justify="space-between" wrap="nowrap" className={classes.item}>
            <Stack gap={0}>
              <Text fw={600}>{c.name}</Text>
              <Text size="xs" c="dimmed">
                {members(c)}
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant="default"
                onClick={(): void => setTarget({ kind: 'edit', circle: c })}
                aria-label={t('people.circles.editLabel', { name: c.name })}
              >
                {t('people.circles.edit')}
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={(): void =>
                  remove.mutate(c.id, { onSuccess: () => announce(t('people.circles.deleted', { name: c.name })) })
                }
                aria-label={t('people.circles.deleteLabel', { name: c.name })}
              >
                {t('people.circles.delete')}
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
      <CircleDrawer target={target} people={people.data ?? []} onClose={(): void => setTarget(undefined)} />
    </Stack>
  );
}
