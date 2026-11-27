import { Anchor, Breadcrumbs, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import type { JSX, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** One step of the trail; the last one is the current page and has no link. */
export type Crumb = { label: string; href?: string };

/** "Calendar › …" above a page title, so you can step back up from any screen. */
export function PageBreadcrumbs({ trail }: { trail: readonly Crumb[] }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const crumbs: Crumb[] = [{ label: t('nav.calendar'), href: '/' }, ...trail];
  return (
    <nav aria-label={t('nav.breadcrumb')}>
      <Breadcrumbs separatorMargin={6}>
        {crumbs.map((c, i) =>
          c.href && i < crumbs.length - 1 ? (
            <Anchor
              key={c.label}
              href={c.href}
              size="sm"
              onClick={(e: MouseEvent<HTMLAnchorElement>): void => {
                e.preventDefault();
                void navigate({ href: c.href });
              }}
            >
              {c.label}
            </Anchor>
          ) : (
            <Text key={c.label} size="sm" c="dimmed" aria-current="page">
              {c.label}
            </Text>
          ),
        )}
      </Breadcrumbs>
    </nav>
  );
}
