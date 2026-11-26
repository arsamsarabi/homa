import { Alert, Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { type ChangeEvent, type JSX, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/api';
import { isolate } from '@/lib/i18n';

type PasskeyRow = {
  id: string;
  name?: string | null;
  createdAt?: Date | string | null;
};

/** Settings → Security: list, add and remove passkeys for this account. */
export function SecuritySection(): JSX.Element {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | undefined>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const supported = typeof globalThis.PublicKeyCredential !== 'undefined';

  const reload = useCallback(async (): Promise<void> => {
    const res = await authClient.passkey.listUserPasskeys();
    if (res.error) {
      setError(res.error.message ?? res.error.statusText);
      setPasskeys([]);
      return;
    }
    setPasskeys(res.data ?? []);
    setError(undefined);
  }, []);

  useEffect(() => {
    if (!supported) {
      setPasskeys([]);
      return;
    }
    void reload();
  }, [reload, supported]);

  async function add(): Promise<void> {
    setBusy(true);
    setError(undefined);
    const res = await authClient.passkey.addPasskey({
      ...(name.trim() !== '' && { name: name.trim() }),
    });
    if (res.error) setError(res.error.message ?? res.error.statusText);
    else {
      setName('');
      await reload();
    }
    setBusy(false);
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    const res = await authClient.passkey.deletePasskey({ id });
    if (res.error) setError(res.error.message ?? res.error.statusText);
    else await reload();
    setBusy(false);
  }

  const addedLabel = (row: PasskeyRow): string => {
    if (!row.createdAt) return '';
    const d = typeof row.createdAt === 'string' ? new Date(row.createdAt) : row.createdAt;
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };

  return (
    <Stack component="section" gap="md" aria-labelledby="security-settings">
      <Stack gap={4}>
        <Title order={2} size="h4" id="security-settings">
          {t('security.title')}
        </Title>
        <Text size="sm" c="dimmed">
          {t('security.hint')}
        </Text>
      </Stack>
      {!supported && <Text size="sm">{t('security.unsupported')}</Text>}
      {error && (
        <Alert color="red" role="alert">
          {t('security.failed', { message: error })}
        </Alert>
      )}
      {supported && passkeys === undefined && <Text size="sm">{t('common.loading')}</Text>}
      {supported && passkeys !== undefined && passkeys.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('security.empty')}
        </Text>
      )}
      {supported &&
        passkeys?.map((row) => (
          <Group key={row.id} justify="space-between" wrap="nowrap">
            <Stack gap={0}>
              <Text size="sm">{isolate(row.name?.trim() || t('security.unnamed'))}</Text>
              {addedLabel(row) !== '' && (
                <Text size="xs" c="dimmed">
                  {t('security.added', { date: addedLabel(row) })}
                </Text>
              )}
            </Stack>
            <Button size="xs" variant="subtle" color="red" disabled={busy} onClick={(): void => void remove(row.id)}>
              {t('security.remove')}
            </Button>
          </Group>
        ))}
      {supported && (
        <Group align="flex-end" wrap="nowrap">
          <TextInput
            label={t('security.name')}
            description={t('security.nameHint')}
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => setName(e.currentTarget.value)}
            style={{ flex: 1 }}
            maxLength={60}
          />
          <Button loading={busy} disabled={busy} onClick={(): void => void add()}>
            {t('security.add')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
