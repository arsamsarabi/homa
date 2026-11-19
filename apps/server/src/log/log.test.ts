import { expect, test } from 'bun:test';
import { errorFields, formatLine } from './log';

test('a log line is one JSON object with time, level, message and fields', () => {
  const line = formatLine('info', 'listening', { port: 3000 }, new Date('2026-11-19T12:00:00Z'));
  expect(JSON.parse(line)).toEqual({ time: '2026-11-19T12:00:00.000Z', level: 'info', msg: 'listening', port: 3000 });
});

test('errors keep their message and name', () => {
  expect(errorFields(new TypeError('boom'))).toMatchObject({ error: 'boom', name: 'TypeError' });
  expect(errorFields('plain')).toEqual({ error: 'plain' });
});
