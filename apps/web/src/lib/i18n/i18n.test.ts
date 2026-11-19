import { expect, test } from 'bun:test';
import i18n, { applyDefaultLanguage, setLanguage } from './i18n';
import en from './locales/en.json';
import fa from './locales/fa.json';

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

test('Farsi has every English string and no extras', () => {
  expect(keys(fa).sort()).toEqual(keys(en).sort());
});

test("the instance's default language applies only without a saved choice", () => {
  localStorage.removeItem('homa-language');
  applyDefaultLanguage('fa');
  expect(i18n.language).toBe('fa');
  expect(document.documentElement.dir).toBe('rtl');

  setLanguage('en');
  applyDefaultLanguage('fa');
  expect(i18n.language).toBe('en');
  localStorage.removeItem('homa-language');
});
