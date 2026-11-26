import { expect, test } from 'bun:test';
import { accountEmail, emailLanguage } from './emails';

const req = (lang?: string): Request =>
  new Request('http://localhost/', lang ? { headers: { 'accept-language': lang } } : {});

test("the request's language wins, else the instance default", () => {
  expect(emailLanguage(req('fa-IR,fa;q=0.9,en;q=0.8'), 'en')).toBe('fa');
  expect(emailLanguage(req('en-GB,en;q=0.9'), 'fa')).toBe('en');
  expect(emailLanguage(req('de-DE'), 'fa')).toBe('fa');
  expect(emailLanguage(req(), 'en')).toBe('en');
  expect(emailLanguage(undefined, 'fa')).toBe('fa');
});

test('both parts carry the link; the HTML escapes the name and goes right to left in Farsi', () => {
  const url = 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email';
  const appUrl = 'http://localhost:3000';
  const en = accountEmail('verify', 'en', { email: 'ada@example.com', name: '<Ada>' }, url, appUrl);
  expect(en).toMatchObject({ to: 'ada@example.com', subject: 'Confirm your email address for Homa' });
  expect(en.text).toContain(url);
  expect(en.html).toContain(
    'href="http://localhost:3000/api/auth/verify-email?token=abc&amp;callbackURL=%2Fverify-email"',
  );
  expect(en.html).toContain('src="http://localhost:3000/icon-192.png"');
  expect(en.html).toContain('Hi &lt;Ada&gt;,');
  expect(en.html).not.toContain('<Ada>');

  const fa = accountEmail('reset', 'fa', { email: 'dara@example.com', name: '' }, url, appUrl);
  expect(fa.subject).toBe('بازنشانی گذرواژهٔ هما');
  expect(fa.html).toContain('dir="rtl"');
  expect(fa.html).toContain('src="http://localhost:3000/icon-192.png"');
  expect(fa.text).toStartWith('سلام dara@example.com،');
});
