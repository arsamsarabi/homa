import { Tabs } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { JSX, ReactNode } from 'react';
import classes from './PageTabs.module.css';

export type PageTabsProps<T extends string> = {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  /** The tab's name, as shown in its button. */
  label: (tab: T) => string;
  /** One `Tabs.Panel` per tab. */
  children: ReactNode;
};

/**
 * A page's tabs, as on Settings and Admin: down the side with names at the reading edge, or across
 * the top on phones, where a side list would squeeze the content. Only the open panel is mounted.
 *
 * @example
 * <PageTabs tabs={ADMIN_TABS} value={tab} onChange={pick} label={(x) => t(`instance.tabs.${x}`)}>
 *   <Tabs.Panel value="general">…</Tabs.Panel>
 * </PageTabs>
 */
export function PageTabs<T extends string>({ tabs, value, onChange, label, children }: PageTabsProps<T>): JSX.Element {
  const phone = useMediaQuery('(max-width: 48em)');
  return (
    <Tabs
      value={value}
      onChange={(next: string | null): void => {
        const found = tabs.find((x) => x === next);
        if (found) onChange(found);
      }}
      keepMounted={false}
      orientation={phone ? 'horizontal' : 'vertical'}
      classNames={{ tabLabel: classes.label }}
    >
      <Tabs.List mb={phone ? 'md' : undefined} me={phone ? undefined : 'xl'}>
        {tabs.map((x) => (
          <Tabs.Tab key={x} value={x}>
            {label(x)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {children}
    </Tabs>
  );
}
