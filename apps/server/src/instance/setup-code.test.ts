import { expect, test } from 'bun:test';
import { createSetupGate, MAX_SETUP_ATTEMPTS } from './setup-code';

test('the code is four digits and announced once', () => {
  const seen: string[] = [];
  const gate = createSetupGate({ announce: (c) => seen.push(c) });
  const code = gate.current();
  expect(code).toMatch(/^\d{4}$/);
  expect(gate.current()).toBe(code);
  expect(seen).toEqual([code]);
});

test('only the right code passes', () => {
  const gate = createSetupGate({ fixed: '0420', announce: () => {} });
  expect(gate.check('0420')).toBe(true);
  expect(gate.check('0421')).toBe(false);
  expect(gate.check(null)).toBe(false);
  expect(gate.check(undefined)).toBe(false);
});

test('too many wrong guesses replace the code and announce the new one', () => {
  const seen: string[] = [];
  const gate = createSetupGate({ announce: (c) => seen.push(c) });
  const first = gate.current();
  const wrong = first === '0000' ? '0001' : '0000';
  for (let i = 0; i < MAX_SETUP_ATTEMPTS; i++) gate.check(wrong);
  expect(seen.length).toBe(2);
  expect(gate.current()).toBe(seen[1] as string);
});

test('a pinned code never changes', () => {
  const gate = createSetupGate({ fixed: '1234', announce: () => {} });
  for (let i = 0; i < MAX_SETUP_ATTEMPTS * 2; i++) gate.check('9999');
  expect(gate.check('1234')).toBe(true);
});
