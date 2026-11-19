import { Spotlight, type SpotlightActionData, type SpotlightActionGroupData } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

export type CommandPaletteProps = { actions: (SpotlightActionData | SpotlightActionGroupData)[] };

/** The command palette (⌘K / Ctrl K): search and run any action. */
export function CommandPalette({ actions }: CommandPaletteProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Spotlight
      actions={actions}
      shortcut="mod + K"
      nothingFound={t('palette.nothingFound')}
      highlightQuery
      searchProps={{ leftSection: <IconSearch size={18} aria-hidden />, placeholder: t('palette.placeholder') }}
    />
  );
}
