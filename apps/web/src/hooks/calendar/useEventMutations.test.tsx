import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import type { Occurrence } from '@/schemas';
import { calendarKeys } from './queries';
import { useEventMutations } from './useEventMutations';

const REAL = '11111111-1111-4111-8111-111111111111';
const event = {
  id: REAL,
  calendarId: 'c1',
  uid: 'u1',
  summary: 'Dentist',
  description: null,
  location: null,
  start: '2026-11-28T10:00:00.000Z',
  end: '2026-11-28T11:00:00.000Z',
  allDay: false,
  tz: 'UTC',
  rrule: null,
  travelMinutes: null,
  pollId: null,
  exdates: [],
  rdates: [],
  reminders: [],
  createdAt: '2026-11-28T00:00:00.000Z',
  updatedAt: '2026-11-28T00:00:00.000Z',
};

describe('event mutations', () => {
  test('a change made while the create is in flight waits for the real id', async () => {
    let finishCreate: () => void = () => {};
    const patched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const req = new Request(input instanceof URL ? input.href : input, init);
      const url = new URL(req.url, 'http://localhost:3000');
      const ok = (): Response =>
        new Response(JSON.stringify(event), { headers: { 'content-type': 'application/json' } });
      if (req.method === 'POST') return new Promise<Response>((resolve) => (finishCreate = () => resolve(ok())));
      if (req.method === 'PATCH') patched.push(url.pathname);
      return req.method === 'GET' ? new Response('[]', { headers: { 'content-type': 'application/json' } }) : ok();
    }) as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = [...calendarKeys.occurrences, 'test'];
    qc.setQueryData<Occurrence[]>(key, []);
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEventMutations(), { wrapper });

    act(() => {
      result.current.create.mutate({
        calendarId: 'c1',
        summary: 'Dentist',
        start: event.start,
        end: event.end,
        allDay: false,
        tz: 'UTC',
      });
    });
    await waitFor(() => expect(qc.getQueryData<Occurrence[]>(key)?.length).toBe(1));
    const tempId = qc.getQueryData<Occurrence[]>(key)?.[0]?.eventId ?? '';
    expect(tempId.startsWith('temp-')).toBe(true);

    act(() => {
      result.current.update.mutate({ id: tempId, scope: 'all', patch: { start: '2026-11-28T12:00:00.000Z' } });
    });
    finishCreate();
    await waitFor(() => expect(patched).toEqual([`/api/events/${REAL}`]));
  });
});
