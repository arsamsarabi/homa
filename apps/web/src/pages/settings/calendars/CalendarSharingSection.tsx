// Per-calendar sharing: default access plus person and circle grants (owner only).
import { ActionIcon, Alert, Button, Group, Loader, NativeSelect, Stack, Text, Title } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type ChangeEvent, type JSX, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useCalendarGrants, usePutCalendarGrants } from '@/hooks/calendar';
import { useCircles, usePeople } from '@/hooks/people';
import type { CalendarDefaultAccess, CalendarGrants, GrantLevel, GrantTarget } from '@/schemas';

export type CalendarSharingSectionProps = { calendarId: string };

type DraftGrant = { key: string; target: 'user' | 'circle'; targetId: string; level: GrantLevel };

const DEFAULT_LEVELS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'sharing.defaultFollowPreset' },
  { value: 'none', labelKey: 'sharing.level.none' },
  { value: 'freebusy', labelKey: 'sharing.level.freebusy' },
  { value: 'read', labelKey: 'sharing.level.read' },
];

const GRANT_LEVELS: GrantLevel[] = ['none', 'freebusy', 'read', 'edit'];

const toDraft = (grants: readonly GrantTarget[]): DraftGrant[] =>
  grants.map((g: GrantTarget, i: number) => ({
    key: `${i}-${g.userId ?? g.circleId}`,
    target: g.userId ? 'user' : 'circle',
    targetId: g.userId ?? g.circleId ?? '',
    level: g.level,
  }));

const fromDraft = (rows: readonly DraftGrant[]): GrantTarget[] =>
  rows
    .filter((r: DraftGrant) => r.targetId)
    .map((r: DraftGrant) =>
      r.target === 'user' ? { userId: r.targetId, level: r.level } : { circleId: r.targetId, level: r.level },
    );

/** Default access and who else can see this calendar. */
export function CalendarSharingSection({ calendarId }: CalendarSharingSectionProps): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const grantsQuery = useCalendarGrants(calendarId);
  const put = usePutCalendarGrants();
  const people = usePeople();
  const circles = useCircles();
  const [defaultAccess, setDefaultAccess] = useState<CalendarDefaultAccess>(null);
  const [rows, setRows] = useState<DraftGrant[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!grantsQuery.data) return;
    setDefaultAccess(grantsQuery.data.defaultAccess);
    setRows(toDraft(grantsQuery.data.grants));
    setError(undefined);
  }, [grantsQuery.data, calendarId]);

  const save = (): void => {
    const body: CalendarGrants = { defaultAccess, grants: fromDraft(rows) };
    put.mutate(
      { id: calendarId, body },
      {
        onSuccess: (): void => setError(undefined),
        onError: (err: Error): void => setError(err.message),
      },
    );
  };

  const personOptions = (people.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.email}` }));
  const circleOptions = (circles.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <Stack gap="sm" mt="md" aria-labelledby={headingId}>
      <Title order={4} size="h5" id={headingId}>
        {t('sharing.calendarTitle')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('sharing.calendarHint')}
      </Text>
      {grantsQuery.isPending && <Loader size="sm" aria-label={t('sharing.loading')} />}
      {grantsQuery.isError && (
        <QueryErrorAlert
          title={t('sharing.loadFailed')}
          error={grantsQuery.error}
          onRetry={() => void grantsQuery.refetch()}
        />
      )}
      {grantsQuery.data && (
        <>
          <NativeSelect
            label={t('sharing.defaultAccess')}
            description={t('sharing.defaultAccessHint')}
            data={DEFAULT_LEVELS.map((l: { value: string; labelKey: string }) => ({
              value: l.value,
              label: t(l.labelKey),
            }))}
            value={defaultAccess ?? ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
              const v = e.currentTarget.value;
              setDefaultAccess(v === '' ? null : (v as Exclude<CalendarDefaultAccess, null>));
            }}
          />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('sharing.peopleAndCircles')}
            </Text>
            {rows.map((row: DraftGrant) => (
              <Group key={row.key} gap="xs" wrap="nowrap" align="flex-end">
                <NativeSelect
                  aria-label={t('sharing.targetKind')}
                  data={[
                    { value: 'user', label: t('sharing.person') },
                    { value: 'circle', label: t('sharing.circle') },
                  ]}
                  value={row.target}
                  onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
                    const target = e.currentTarget.value as 'user' | 'circle';
                    setRows((rs: DraftGrant[]) =>
                      rs.map((r: DraftGrant) => (r.key === row.key ? { ...r, target, targetId: '' } : r)),
                    );
                  }}
                  style={{ flex: '0 0 7rem' }}
                />
                <NativeSelect
                  aria-label={t('sharing.target')}
                  data={[
                    { value: '', label: t('sharing.chooseTarget') },
                    ...(row.target === 'user' ? personOptions : circleOptions),
                  ]}
                  value={row.targetId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
                    const targetId = e.currentTarget.value;
                    setRows((rs: DraftGrant[]) =>
                      rs.map((r: DraftGrant) => (r.key === row.key ? { ...r, targetId } : r)),
                    );
                  }}
                  style={{ flex: 1 }}
                />
                <NativeSelect
                  aria-label={t('sharing.levelLabel')}
                  data={GRANT_LEVELS.map((l: GrantLevel) => ({ value: l, label: t(`sharing.level.${l}`) }))}
                  value={row.level}
                  onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
                    const level = e.currentTarget.value as GrantLevel;
                    setRows((rs: DraftGrant[]) => rs.map((r: DraftGrant) => (r.key === row.key ? { ...r, level } : r)));
                  }}
                  style={{ flex: '0 0 8rem' }}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t('sharing.removeGrant')}
                  onClick={(): void => setRows((rs: DraftGrant[]) => rs.filter((r: DraftGrant) => r.key !== row.key))}
                >
                  <IconTrash size={16} aria-hidden />
                </ActionIcon>
              </Group>
            ))}
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} aria-hidden />}
              w="fit-content"
              onClick={(): void =>
                setRows((rs: DraftGrant[]) => [
                  ...rs,
                  { key: `new-${rs.length}-${Date.now()}`, target: 'user', targetId: '', level: 'freebusy' },
                ])
              }
            >
              {t('sharing.addGrant')}
            </Button>
          </Stack>
          {(error || put.isError) && (
            <Alert color="red" role="alert">
              {t('sharing.saveFailed', { message: error ?? put.error?.message })}
            </Alert>
          )}
          <Button onClick={save} loading={put.isPending} w="fit-content">
            {t('sharing.save')}
          </Button>
        </>
      )}
    </Stack>
  );
}
