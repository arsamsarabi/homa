import {
  Alert,
  Button,
  ColorInput,
  Drawer,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { type FormEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { type SubscribeVars, useConnectionMutations, useHolidayCalendars } from '@/hooks/connections';
import { useAnnouncer } from '@/stores';
import { SWATCHES } from './swatches';

export type SubscribeDrawerProps = { opened: boolean; onClose: () => void };

type Mode = 'url' | 'holidays';

/** Subscribe to an ICS feed by its address, or pick a public-holiday calendar. */
export function SubscribeDrawer({ opened, onClose }: SubscribeDrawerProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'fa' ? 'fa' : 'en';
  const { subscribe } = useConnectionMutations();
  const holidays = useHolidayCalendars();
  const announce = useAnnouncer((s) => s.announce);
  const [mode, setMode] = useState<Mode>('url');
  const [holidayId, setHolidayId] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const feed = holidays.data?.find((h) => h.id === holidayId);

  const close = (): void => {
    subscribe.reset();
    onClose();
  };

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim() || (feed ? feed.names[lang] : undefined);
    const source = mode === 'url' ? { url: String(form.get('url') ?? '') } : { holidayId: feed?.id ?? '' };
    const vars: SubscribeVars = { ...source, ...(name && { name }), ...(color && { color }) };
    subscribe.mutate(vars, {
      onSuccess: () => {
        announce(t('connections.added'));
        close();
      },
    });
  };

  return (
    <Drawer opened={opened} onClose={close} position="right" size="md" padding="lg" title={t('connections.addTitle')}>
      <form onSubmit={submit}>
        <Stack>
          <SegmentedControl
            value={mode}
            onChange={(v: string): void => setMode(v as Mode)}
            data={[
              { value: 'url', label: t('connections.byAddress') },
              { value: 'holidays', label: t('connections.holidays') },
            ]}
          />
          {mode === 'url' ? (
            <TextInput
              name="url"
              type="url"
              label={t('connections.url')}
              description={t('connections.urlHint')}
              placeholder="https://… .ics"
              required
              data-autofocus
            />
          ) : holidays.isError ? (
            <QueryErrorAlert
              title={t('connections.holidaysFailed')}
              error={holidays.error}
              onRetry={() => void holidays.refetch()}
            />
          ) : (
            <Select
              label={t('connections.holidayCalendar')}
              placeholder={t('connections.holidayPlaceholder')}
              data={holidays.data?.map((h) => ({ value: h.id, label: h.names[lang] })) ?? []}
              value={holidayId}
              onChange={setHolidayId}
              disabled={!holidays.data}
              searchable
              required
              description={feed ? t('connections.source', { source: feed.source }) : undefined}
            />
          )}
          <TextInput
            name="name"
            label={t('connections.name')}
            description={t('connections.nameHint')}
            maxLength={100}
          />
          <ColorInput
            label={t('connections.color')}
            value={color}
            onChange={setColor}
            format="hex"
            swatches={[...SWATCHES]}
            swatchesPerRow={8}
            withPicker={false}
            closeOnColorSwatchClick
          />
          {subscribe.isError && (
            <Alert color="red" role="alert">
              {subscribe.error.message}
            </Alert>
          )}
          {subscribe.isPending && (
            <Text size="sm" role="status">
              {t('connections.fetching')}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={subscribe.isPending} disabled={mode === 'holidays' && !feed}>
              {t('connections.subscribe')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Drawer>
  );
}
