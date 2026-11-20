import { ActionIcon, ColorPicker, ColorSwatch, Popover, Text } from '@mantine/core';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SWATCHES } from './swatches';

export type CalendarColorButtonProps = {
  name: string;
  color: string;
  /** Called once a color is settled on: a suggestion clicked, or the picker released. */
  onPick: (color: string) => void;
};

/** A calendar's color as a swatch button; it opens suggested colors that suit both themes and a picker. */
export function CalendarColorButton({ name, color, onPick }: CalendarColorButtonProps): JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(color);
  const pick = (next: string): void => {
    if (next.toLowerCase() !== color.toLowerCase()) onPick(next);
  };
  return (
    <Popover position="bottom-start" shadow="md" withArrow withinPortal={false} onOpen={() => setDraft(color)}>
      <Popover.Target>
        <ActionIcon variant="subtle" size="lg" aria-label={t('calendars.colorOf', { name })}>
          <ColorSwatch color={color} size={20} aria-hidden />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <ColorPicker
          format="hex"
          value={draft}
          onChange={setDraft}
          onChangeEnd={pick}
          swatches={[...SWATCHES]}
          swatchesPerRow={7}
          aria-label={t('calendars.colorOf', { name })}
        />
        <Text size="xs" c="dimmed" mt={6} maw={240}>
          {t('calendars.suggested')}
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}
