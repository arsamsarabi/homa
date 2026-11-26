import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Group,
  NativeSelect,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { type ChangeEvent, type FocusEvent, type FormEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelInput, ChannelPatch } from '@/api';
import { ConfirmCloseModal } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useChannelMutations } from '@/hooks/reminders';
import { type Channel, type ChannelKind, REMINDER_KINDS, type ReminderKind } from '@/schemas';
import { useAnnouncer } from '@/stores';
import classes from './ChannelsSection.module.css';

/** What the drawer is open for: a new channel, or one to change. */
export type ChannelDraft = { kind: 'create' } | { kind: 'edit'; channel: Channel };

export type ChannelDrawerProps = { draft: ChannelDraft | undefined; emailAvailable: boolean; onClose: () => void };

const text = (f: FormData, name: string): string => String(f.get(name) ?? '').trim();

/** Add or change a notification channel. A new webhook's secret is shown once, here. */
export function ChannelDrawer({ draft, emailAvailable, onClose }: ChannelDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const { create, update } = useChannelMutations();
  const announce = useAnnouncer((s) => s.announce);
  const editing = draft?.kind === 'edit' ? draft.channel : undefined;
  const kinds: ChannelKind[] = [...(emailAvailable ? (['email'] as const) : []), 'ntfy', 'gotify', 'webhook'];
  const [picked, setPicked] = useState<ChannelKind>();
  const [reminderKinds, setReminderKinds] = useState<ReminderKind[]>();
  const [error, setError] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const kind = editing?.kind ?? picked ?? kinds[0] ?? 'ntfy';
  const chosenKinds = reminderKinds ?? editing?.reminderKinds ?? [...REMINDER_KINDS];

  const guard = useConfirmClose(() => {
    setPicked(undefined);
    setReminderKinds(undefined);
    setError(undefined);
    setSecret(undefined);
    onClose();
  });
  const done = (c: Channel): void => {
    announce(t('channels.saved', { name: c.name }));
    if (c.secret) setSecret(c.secret);
    else guard.forceClose();
  };
  const fail = (err: Error): void => setError(err.message);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!chosenKinds.length) {
      setError(t('channels.pickKind'));
      return;
    }
    const common = { name: text(f, 'name'), reminderKinds: chosenKinds };
    const token = text(f, 'token');
    if (editing) {
      const patch: ChannelPatch = { ...common };
      if (kind === 'ntfy' || kind === 'gotify') patch.server = text(f, 'server');
      if (kind === 'ntfy') patch.topic = text(f, 'topic');
      if (token) patch.token = token;
      if (kind === 'webhook' && text(f, 'url')) patch.url = text(f, 'url');
      update.mutate({ id: editing.id, ...patch }, { onSuccess: done, onError: fail });
      return;
    }
    const body: ChannelInput =
      kind === 'email'
        ? { kind, ...common }
        : kind === 'ntfy'
          ? { kind, ...common, server: text(f, 'server'), topic: text(f, 'topic'), ...(token && { token }) }
          : kind === 'gotify'
            ? { kind, ...common, server: text(f, 'server'), token }
            : { kind, ...common, url: text(f, 'url') };
    create.mutate(body, { onSuccess: done, onError: fail });
  };

  return (
    <>
      <Drawer
        opened={draft !== undefined}
        onClose={secret ? guard.forceClose : guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={editing ? t('channels.editTitle') : t('channels.newTitle')}
      >
        {draft && secret && (
          <Stack>
            <Text size="sm">{t('channels.secretHint')}</Text>
            <TextInput
              label={t('channels.secret')}
              value={secret}
              readOnly
              onFocus={(e: FocusEvent<HTMLInputElement>): void => e.currentTarget.select()}
            />
            <Group justify="flex-end">
              <Button onClick={guard.forceClose}>{t('common.done')}</Button>
            </Group>
          </Stack>
        )}
        {draft && !secret && (
          <form onSubmit={submit} onInput={guard.markDirty} onChange={guard.markDirty}>
            <Stack>
              {error && (
                <Alert color="red" role="alert">
                  {t('channels.saveFailed', { message: error })}
                </Alert>
              )}
              {!editing && (
                <NativeSelect
                  label={t('channels.kind')}
                  value={kind}
                  data={kinds.map((k) => ({ value: k, label: t(`channels.kinds.${k}`) }))}
                  onChange={(e: ChangeEvent<HTMLSelectElement>): void =>
                    setPicked(e.currentTarget.value as ChannelKind)
                  }
                  description={emailAvailable ? undefined : t('channels.noEmail')}
                />
              )}
              <TextInput
                name="name"
                label={t('channels.name')}
                defaultValue={editing?.name ?? t(`channels.kinds.${kind}`)}
                key={`name-${kind}`}
                maxLength={100}
                required
                data-autofocus
              />
              {kind === 'email' && <Text size="sm">{t('channels.emailHint')}</Text>}
              {(kind === 'ntfy' || kind === 'gotify') && (
                <TextInput
                  name="server"
                  type="url"
                  label={t('channels.server')}
                  defaultValue={editing?.server ?? (kind === 'ntfy' ? 'https://ntfy.sh' : '')}
                  key={`server-${kind}`}
                  required
                />
              )}
              {kind === 'ntfy' && (
                <TextInput
                  name="topic"
                  label={t('channels.topic')}
                  description={t('channels.topicHint')}
                  defaultValue={editing?.topic ?? ''}
                  required
                />
              )}
              {(kind === 'ntfy' || kind === 'gotify') && (
                <PasswordInput
                  name="token"
                  label={kind === 'ntfy' ? t('channels.ntfyToken') : t('channels.gotifyToken')}
                  description={editing?.hasToken ? t('channels.tokenKept') : undefined}
                  required={kind === 'gotify' && !editing}
                />
              )}
              {kind === 'webhook' && (
                <TextInput
                  name="url"
                  type="url"
                  label={t('channels.url')}
                  description={editing?.host ? t('channels.urlKept', { host: editing.host }) : t('channels.urlHint')}
                  required={!editing}
                />
              )}
              <Stack component="fieldset" gap="xs" className={classes.fieldset}>
                <Text component="legend" size="sm" fw={500}>
                  {t('channels.which')}
                </Text>
                {REMINDER_KINDS.map((k) => (
                  <Checkbox
                    key={k}
                    label={t(`channels.reminderKinds.${k}`)}
                    checked={chosenKinds.includes(k)}
                    onChange={(e: ChangeEvent<HTMLInputElement>): void => {
                      const on = e.currentTarget.checked;
                      setReminderKinds(REMINDER_KINDS.filter((x) => (x === k ? on : chosenKinds.includes(x))));
                    }}
                  />
                ))}
              </Stack>
              <Group justify="flex-end">
                <Button variant="default" onClick={guard.requestClose}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  loading={create.isPending || update.isPending}
                  disabled={create.isPending || update.isPending}
                >
                  {t('channels.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Drawer>
      <ConfirmCloseModal opened={guard.asking} onDiscard={guard.discard} onKeep={guard.keepEditing} />
    </>
  );
}
