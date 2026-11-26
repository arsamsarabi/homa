import { expect, test } from 'bun:test';
import { emailHtml, emailLogoUrl } from './layout';

test('the logo URL is absolute under HOMA_URL and ignores a trailing slash', () => {
  expect(emailLogoUrl('https://app.homa.day')).toBe('https://app.homa.day/icon-192.png');
  expect(emailLogoUrl('https://app.homa.day/')).toBe('https://app.homa.day/icon-192.png');
});

test('the shared layout includes the brand mark for English and Farsi', () => {
  const en = emailHtml({
    language: 'en',
    appUrl: 'https://app.homa.day/',
    title: 'Hello',
    heading: 'Heading',
    paragraphs: ['Body'],
  });
  expect(en).toContain('src="https://app.homa.day/icon-192.png"');
  expect(en).toContain('width="48"');
  expect(en).toContain('>Homa</p>');
  expect(en).toContain('dir="ltr"');

  const fa = emailHtml({
    language: 'fa',
    appUrl: 'http://localhost:3000',
    title: 'سلام',
    heading: 'عنوان',
    paragraphs: ['متن'],
  });
  expect(fa).toContain('src="http://localhost:3000/icon-192.png"');
  expect(fa).toContain('>هما</p>');
  expect(fa).toContain('<html lang="fa" dir="rtl">');
});
