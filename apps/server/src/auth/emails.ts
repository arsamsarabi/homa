// The account emails Better Auth asks for (confirm your address, reset your password), in English or
// Farsi: a plain-text part and an HTML part in the shared email layout (@/email/layout).
import { type EmailLanguage, emailHtml } from '@/email/layout';
import type { Mail } from '@/reminders';

export type AccountEmail = 'verify' | 'reset';

const TEXT = {
  en: {
    hi: (name: string): string => `Hi ${name},`,
    orLink: "If the button doesn't work, open this link:",
    verify: {
      subject: 'Confirm your email address for Homa',
      heading: 'Confirm your email address',
      body: 'Confirm that this is your email address to finish setting up your Homa account.',
      button: 'Confirm email address',
      note: "The link works for 1 hour. If you didn't create an account, you can ignore this email.",
    },
    reset: {
      subject: 'Reset your Homa password',
      heading: 'Reset your password',
      body: 'Someone asked to reset the password for your Homa account. Choose a new one with the button below.',
      button: 'Choose a new password',
      note: "The link works once, for 1 hour. If you didn't ask for this, ignore this email and your password stays the same.",
    },
  },
  fa: {
    hi: (name: string): string => `سلام ${name}،`,
    orLink: 'اگر دکمه کار نکرد، این پیوند را باز کنید:',
    verify: {
      subject: 'نشانی ایمیل خود را برای هما تأیید کنید',
      heading: 'نشانی ایمیل خود را تأیید کنید',
      body: 'برای تکمیل ساخت حساب هما، تأیید کنید که این نشانی ایمیل شماست.',
      button: 'تأیید نشانی ایمیل',
      note: 'این پیوند تا یک ساعت کار می‌کند. اگر شما حسابی نساخته‌اید، این ایمیل را نادیده بگیرید.',
    },
    reset: {
      subject: 'بازنشانی گذرواژهٔ هما',
      heading: 'گذرواژهٔ خود را بازنشانی کنید',
      body: 'درخواستی برای بازنشانی گذرواژهٔ حساب همای شما رسیده است. با دکمهٔ زیر گذرواژهٔ تازه‌ای انتخاب کنید.',
      button: 'انتخاب گذرواژهٔ تازه',
      note: 'این پیوند فقط یک بار و تا یک ساعت کار می‌کند. اگر این درخواست از شما نبوده، این ایمیل را نادیده بگیرید؛ گذرواژه‌تان تغییر نمی‌کند.',
    },
  },
} as const;

/**
 * The language for an account email: the request's (the web app sends its own as Accept-Language),
 * else the instance's default.
 */
export function emailLanguage(request: Request | undefined, fallback: string): EmailLanguage {
  const first = request?.headers.get('accept-language')?.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('fa')) return 'fa';
  if (first.startsWith('en')) return 'en';
  return fallback === 'fa' ? 'fa' : 'en';
}

/** The email to `to`, greeting `name`, with the link `url`. `appUrl` is HOMA_URL (logo and deep links). */
export function accountEmail(
  kind: AccountEmail,
  language: EmailLanguage,
  to: { email: string; name: string },
  url: string,
  appUrl: string,
): Mail {
  const w = TEXT[language];
  const m = w[kind];
  const hi = w.hi(to.name.trim() || to.email);
  const text = `${hi}\n\n${m.body}\n\n${m.button}: ${url}\n\n${m.note}\n`;
  const html = emailHtml({
    language,
    appUrl,
    title: m.subject,
    heading: m.heading,
    paragraphs: [hi, m.body],
    button: { label: m.button, url, fallback: w.orLink },
    note: m.note,
  });
  return { to: to.email, subject: m.subject, text, html };
}
