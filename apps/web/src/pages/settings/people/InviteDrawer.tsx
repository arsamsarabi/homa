import { Alert, Button, CopyButton, Drawer, Group, Stack, Text, TextInput } from '@mantine/core';
import { type FocusEvent, type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useInviteMutations } from '@/hooks/people';
import { isolate } from '@/lib/i18n';
import type { CreatedInvite } from '@/schemas';
import { inviteLink } from '@/services/people';

export type InviteDrawerProps = { opened: boolean; onClose: () => void };

/** Create an invite, then show its link once (and whether Homa emailed it). */
export function InviteDrawer({ opened, onClose }: InviteDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const { create } = useInviteMutations();
  const [created, setCreated] = useState<CreatedInvite>();
  const [error, setError] = useState<string>();
  const guard = useConfirmClose(() => {
    setCreated(undefined);
    setError(undefined);
    onClose();
  });
  useEffect(() => {
    if (!opened) guard.resetDirty();
  }, [opened]);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setError(undefined);
    create.mutate(email ? { email } : {}, {
      onSuccess: (invite: CreatedInvite): void => {
        guard.resetDirty();
        setCreated(invite);
      },
      onError: (err: Error) => setError(err.message),
    });
  };
  const link = created ? inviteLink(window.location.origin, created.token) : '';

  return (
    <>
      <Drawer
        opened={opened}
        onClose={created ? guard.forceClose : guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={t('people.invites.new')}
      >
        {created ? (
          <Stack>
            {created.emailed && created.email && (
              <Alert color="green">{t('people.invites.emailed', { email: isolate(created.email) })}</Alert>
            )}
            <Text size="sm">{t('people.invites.linkHint')}</Text>
            <TextInput
              label={t('people.invites.link')}
              value={link}
              readOnly
              dir="ltr"
              onFocus={(e: FocusEvent<HTMLInputElement>): void => e.currentTarget.select()}
            />
            <Group justify="flex-end">
              <CopyButton value={link}>
                {({ copied, copy }: { copied: boolean; copy: () => void }): JSX.Element => (
                  <Button variant="default" onClick={copy}>
                    {copied ? t('people.invites.copied') : t('people.invites.copy')}
                  </Button>
                )}
              </CopyButton>
              <Button onClick={guard.forceClose}>{t('common.done')}</Button>
            </Group>
          </Stack>
        ) : (
          <form onSubmit={submit} onInput={guard.markDirty} onChange={guard.markDirty}>
            <Stack>
              {error && (
                <Alert color="red" role="alert">
                  {t('people.invites.failed', { message: error })}
                </Alert>
              )}
              <TextInput
                name="email"
                type="email"
                label={t('people.invites.email')}
                description={t('people.invites.emailHint')}
                maxLength={254}
                data-autofocus
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={guard.requestClose}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={create.isPending} disabled={create.isPending}>
                  {t('people.invites.create')}
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
