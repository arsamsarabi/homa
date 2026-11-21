// What the channel senders need from the environment: the encryption key, the SSRF switch, the app's
// address for links, and the SMTP transport when one is set up.
import type { CredentialKey } from '@homa/sync';
import { parseCredentialKey } from '@homa/sync';
import nodemailer from 'nodemailer';
import type { Config } from '@/config';

export type Mail = { to: string; subject: string; text: string };

export type NotifySettings = {
  /** Unset when HOMA_ENCRYPTION_KEY is: ntfy, Gotify and webhook channels are then unavailable. */
  key: CredentialKey | undefined;
  /** HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS: http and loopback, private and link-local addresses allowed. */
  allowPrivate: boolean;
  /** HOMA_URL, for links in messages. */
  appUrl: string;
  /** Unset without HOMA_SMTP_URL: email isn't offered. */
  sendMail?: (m: Mail) => Promise<void>;
};

export function notifySettingsFrom(config: Config): NotifySettings {
  const smtp = config.HOMA_SMTP_URL;
  const from = config.HOMA_MAIL_FROM;
  const transport = smtp && from ? nodemailer.createTransport(smtp) : undefined;
  return {
    key: config.HOMA_ENCRYPTION_KEY ? parseCredentialKey(config.HOMA_ENCRYPTION_KEY) : undefined,
    allowPrivate: config.HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS,
    appUrl: config.HOMA_URL,
    ...(transport && {
      sendMail: async (m: Mail): Promise<void> => {
        await transport.sendMail({ from, ...m });
      },
    }),
  };
}
