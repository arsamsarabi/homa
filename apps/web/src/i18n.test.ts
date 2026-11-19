import { expect, test } from 'bun:test';
import en from './locales/en.json';
import fa from './locales/fa.json';

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

test('Farsi has every English string and no extras', () => {
  expect(keys(fa).sort()).toEqual(keys(en).sort());
});
