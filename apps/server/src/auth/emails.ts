// The account emails Better Auth asks for (confirm your address, reset your password), in English or
// Farsi: a plain-text part and a simple HTML part in Homa's brand colors (homa-infra
// brand/email/email.css), light by default and dark where the mail app asks for it.
import type { Mail } from '@/reminders';

export type AccountEmail = 'verify' | 'reset';
export type EmailLanguage = 'en' | 'fa';

const TEXT = {
  en: {
    brand: 'Homa',
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
    brand: 'هما',
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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

/** The email to `to`, greeting `name`, with the link `url`. */
export function accountEmail(
  kind: AccountEmail,
  language: EmailLanguage,
  to: { email: string; name: string },
  url: string,
): Mail {
  const w = TEXT[language];
  const m = w[kind];
  const hi = w.hi(to.name.trim() || to.email);
  const text = `${hi}\n\n${m.body}\n\n${m.button}: ${url}\n\n${m.note}\n`;
  const dir = language === 'fa' ? 'rtl' : 'ltr';
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const href = escapeHtml(url);
  const html = `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(m.subject)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .homa-page { background-color: #16162a !important; }
    .homa-card { background-color: #22223b !important; color: #f2e9e4 !important; }
    .homa-title, .homa-brand { color: #f2e9e4 !important; }
    .homa-muted { color: #a99ca7 !important; }
    .homa-link { color: #c9ada7 !important; }
    .homa-button { background-color: #c9ada7 !important; color: #22223b !important; }
  }
</style>
</head>
<body class="homa-page" style="margin:0;padding:0;background-color:#f9f5f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="homa-page" style="background-color:#f9f5f2">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="homa-card" style="max-width:480px;background-color:#fefcfb;color:#22223b;border:1px solid #c9ada7;border-radius:12px;font-family:${font};font-size:16px;line-height:1.6" dir="${dir}">
<tr><td style="padding:32px">
<p class="homa-brand" style="margin:0 0 24px;font-family:'Rajdhani',${font};font-size:28px;font-weight:700;letter-spacing:0.01em;color:#22223b">${w.brand}</p>
<h1 class="homa-title" style="margin:0 0 16px;font-family:'Rajdhani',${font};font-size:24px;font-weight:700;color:#22223b">${escapeHtml(m.heading)}</h1>
<p style="margin:0 0 16px">${escapeHtml(hi)}</p>
<p style="margin:0 0 24px">${escapeHtml(m.body)}</p>
<p style="margin:0 0 24px"><a class="homa-button" href="${href}" style="display:inline-block;padding:12px 20px;background-color:#4a4e69;color:#f2e9e4;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(m.button)}</a></p>
<p class="homa-muted" style="margin:0 0 8px;font-size:14px;color:#4a4e69">${escapeHtml(w.orLink)}</p>
<p style="margin:0 0 24px;font-size:14px;word-break:break-all" dir="ltr"><a class="homa-link" href="${href}" style="color:#4a4e69">${href}</a></p>
<p class="homa-muted" style="margin:0;font-size:14px;color:#4a4e69">${escapeHtml(m.note)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  return { to: to.email, subject: m.subject, text, html };
}
