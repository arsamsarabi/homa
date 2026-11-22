import { ActionIcon, Badge, Group, NativeSelect, NavLink, type NavLinkProps, Stack, Text } from '@mantine/core';
import { IconCalendarDue, IconCalendarEvent, IconCircleCheck, IconInbox, IconPlus } from '@tabler/icons-react';
import { createLink, useNavigate } from '@tanstack/react-router';
import { type AnchorHTMLAttributes, type ChangeEvent, type CSSProperties, forwardRef, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { TasksSearch } from '@/schemas';
import { useTasksPageModel } from './model';
import classes from './TasksPage.module.css';

/** Mantine's NavLink as a typed router link. */
const ListLink = createLink(
  forwardRef<HTMLAnchorElement, NavLinkProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => (
    <NavLink component="a" ref={ref} {...props} />
  )),
);

const LISTS = [
  { list: 'inbox', icon: IconInbox },
  { list: 'today', icon: IconCalendarDue },
  { list: 'upcoming', icon: IconCalendarEvent },
  { list: 'completed', icon: IconCircleCheck },
] as const;

const searchOf = (key: string): TasksSearch => {
  const [kind, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  return kind === 'project' ? { project: value } : kind === 'tag' ? { tag: value } : { list: value as 'inbox' };
};

/** The lists: Inbox, Today, Upcoming and Completed, then projects and tags. A select on phones. */
export function TasksNav(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const m = useTasksPageModel();
  const v = m.view;
  const current = v.kind === 'project' ? `project:${v.id}` : v.kind === 'tag' ? `tag:${v.name}` : `list:${v.kind}`;
  const count = (list: string): number | undefined =>
    list === 'inbox' ? m.counts.inbox : list === 'today' ? m.counts.today : undefined;

  return (
    <>
      <NativeSelect
        hiddenFrom="sm"
        label={t('tasks.pickList')}
        value={current}
        onChange={(e: ChangeEvent<HTMLSelectElement>): void =>
          void navigate({ to: '/tasks', search: searchOf(e.currentTarget.value) })
        }
        data={[
          ...LISTS.map(({ list }) => ({ value: `list:${list}`, label: t(`tasks.${list}`) })),
          ...(m.projects.length
            ? [
                {
                  group: t('tasks.projects'),
                  items: m.projects.map((p) => ({ value: `project:${p.id}`, label: p.name })),
                },
              ]
            : []),
          ...(m.tags.length
            ? [{ group: t('tasks.tags'), items: m.tags.map((g) => ({ value: `tag:${g.name}`, label: `#${g.name}` })) }]
            : []),
        ]}
      />
      <Stack component="nav" aria-label={t('tasks.lists')} gap={4} visibleFrom="sm">
        {LISTS.map(({ list, icon: Icon }) => {
          const n = count(list);
          return (
            <ListLink
              key={list}
              to="/tasks"
              search={{ list }}
              label={t(`tasks.${list}`)}
              leftSection={<Icon size={18} aria-hidden />}
              rightSection={
                n ? (
                  <Badge size="sm" variant="light" aria-label={t('tasks.count', { count: n })}>
                    {n}
                  </Badge>
                ) : undefined
              }
              active={current === `list:${list}`}
              aria-current={current === `list:${list}` ? 'page' : undefined}
            />
          );
        })}
        <Group justify="space-between" mt="md" px="sm">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            {t('tasks.projects')}
          </Text>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t('tasks.newProject')}
            onClick={(): void => m.setProjectDraft({ kind: 'create' })}
          >
            <IconPlus size={14} aria-hidden />
          </ActionIcon>
        </Group>
        {m.projects.length === 0 && (
          <Text size="xs" c="dimmed" px="sm">
            {t('tasks.noProjects')}
          </Text>
        )}
        {m.projects.map((p) => (
          <ListLink
            key={p.id}
            to="/tasks"
            search={{ project: p.id }}
            label={p.name}
            leftSection={
              <span className={classes.dot} style={{ '--c': p.color ?? undefined } as CSSProperties} aria-hidden />
            }
            active={current === `project:${p.id}`}
            aria-current={current === `project:${p.id}` ? 'page' : undefined}
          />
        ))}
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" px="sm">
          {t('tasks.tags')}
        </Text>
        {m.tags.length === 0 && (
          <Text size="xs" c="dimmed" px="sm">
            {t('tasks.noTags')}
          </Text>
        )}
        {m.tags.map((g) => (
          <ListLink
            key={g.id}
            to="/tasks"
            search={{ tag: g.name }}
            label={<bdi>#{g.name}</bdi>}
            active={current === `tag:${g.name}`}
            aria-current={current === `tag:${g.name}` ? 'page' : undefined}
          />
        ))}
      </Stack>
    </>
  );
}
