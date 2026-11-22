// The HTML shell every Homa email shares, in Homa's brand colors (homa-infra brand/email/email.css):
// brand, heading, paragraphs, an optional button and a muted note, light by default and dark where
// the mail app asks for it, right to left in Farsi. Callers pass plain text; it's escaped here.
export type EmailLanguage = 'en' | 'fa';

export type EmailLayout = {
  language: EmailLanguage;
  /** The document title, usually the subject. */
  title: string;
  heading: string;
  paragraphs: string[];
  /** `fallback` adds a "if the button doesn't work" line with the bare link under it. */
  button?: { label: string; url: string; fallback?: string };
  note?: string;
};

const BRAND = { en: 'Homa', fa: 'هما' } as const;

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function emailHtml(e: EmailLayout): string {
  const dir = e.language === 'fa' ? 'rtl' : 'ltr';
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const paragraphs = e.paragraphs
    .map((p, i) => `<p style="margin:0 0 ${i === e.paragraphs.length - 1 ? 24 : 16}px">${escapeHtml(p)}</p>\n`)
    .join('');
  let button = '';
  if (e.button) {
    const href = escapeHtml(e.button.url);
    button = `<p style="margin:0 0 24px"><a class="homa-button" href="${href}" style="display:inline-block;padding:12px 20px;background-color:#4a4e69;color:#f2e9e4;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(e.button.label)}</a></p>\n`;
    if (e.button.fallback)
      button += `<p class="homa-muted" style="margin:0 0 8px;font-size:14px;color:#4a4e69">${escapeHtml(e.button.fallback)}</p>
<p style="margin:0 0 24px;font-size:14px;word-break:break-all" dir="ltr"><a class="homa-link" href="${href}" style="color:#4a4e69">${href}</a></p>\n`;
  }
  const note = e.note
    ? `<p class="homa-muted" style="margin:0;font-size:14px;color:#4a4e69">${escapeHtml(e.note)}</p>\n`
    : '';
  return `<!doctype html>
<html lang="${e.language}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(e.title)}</title>
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
<p class="homa-brand" style="margin:0 0 24px;font-family:'Rajdhani',${font};font-size:28px;font-weight:700;letter-spacing:0.01em;color:#22223b">${BRAND[e.language]}</p>
<h1 class="homa-title" style="margin:0 0 16px;font-family:'Rajdhani',${font};font-size:24px;font-weight:700;color:#22223b">${escapeHtml(e.heading)}</h1>
${paragraphs}${button}${note}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}
