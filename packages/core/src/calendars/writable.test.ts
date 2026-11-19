import { expect, test } from 'bun:test';
import { ReadOnlyError } from '../errors';
import { assertWritable } from './writable';

test('read-only calendars refuse writes; others accept them', () => {
  expect(() => assertWritable({ readOnly: true })).toThrow(ReadOnlyError);
  expect(() => assertWritable({ readOnly: false })).not.toThrow();
});
