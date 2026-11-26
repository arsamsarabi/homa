// The email an invite link is sent in, in English or Farsi, in the shared email layout.
import { type EmailLanguage, emailHtml } from '@/email/layout';
import type { Mail } from '@/reminders';

const TEXT = {
  en: {
    subject: (inviter: string, instance: string): string => `${inviter} invited you to ${instance} on Homa`,
    heading: 'You are invited to Homa',
    body: (inviter: string, instance: string): string =>
      `${inviter} invited you to make an account on ${instance}, a Homa calendar you can share with them.`,
    button: 'Accept the invite',
    orLink: "If the button doesn't work, open this link:",
    note: "The link works once, for 7 days. If you weren't expecting this, you can ignore this email.",
  },
  fa: {
    subject: (inviter: string, instance: string): string => `${inviter} شما را به ${instance} در هما دعوت کرده است`,
    heading: 'به هما دعوت شده‌اید',
    body: (inviter: string, instance: string): string =>
      `${inviter} شما را دعوت کرده تا در ${instance} حساب بسازید؛ تقویم همایی که می‌توانید با او هم‌رسانی کنید.`,
    button: 'پذیرفتن دعوت',
    orLink: 'اگر دکمه کار نکرد، این پیوند را باز کنید:',
    note: 'این پیوند فقط یک بار و تا ۷ روز کار می‌کند. اگر انتظارش را نداشتید، این ایمیل را نادیده بگیرید.',
  },
} as const;

export function inviteEmail(
  language: EmailLanguage,
  to: string,
  from: { inviter: string; instance: string },
  url: string,
  appUrl: string,
): Mail {
  const w = TEXT[language];
  const subject = w.subject(from.inviter, from.instance);
  const body = w.body(from.inviter, from.instance);
  const text = `${body}\n\n${w.button}: ${url}\n\n${w.note}\n`;
  const html = emailHtml({
    language,
    appUrl,
    title: subject,
    heading: w.heading,
    paragraphs: [body],
    button: { label: w.button, url, fallback: w.orLink },
    note: w.note,
  });
  return { to, subject, text, html };
}
