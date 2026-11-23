import { expect, test } from 'bun:test';
import { railwayRequest, railwayRetrySeconds, railwayWaitBudgetSeconds } from './railway-rate-limit';

test('parses both recorded Railway quota messages', () => {
  expect(railwayRetrySeconds('returned error 429 Too Many Requests: Rate limit exceeded, please try again in 1793.711 seconds.')).toBe(1794);
  expect(railwayRetrySeconds("invalid character 'R' looking for beginning of value ---> Rate limit exceeded, please try again in 981.98 seconds.")).toBe(982);
  expect(railwayRetrySeconds('Not Authorized')).toBeNull();
});

test('the wait budget defaults short and reads the deploy override', () => {
  expect(railwayWaitBudgetSeconds({})).toBe(120);
  expect(railwayWaitBudgetSeconds({ RAILWAY_RATE_LIMIT_WAIT_SECONDS: '3900' })).toBe(3900);
  expect(railwayWaitBudgetSeconds({ RAILWAY_RATE_LIMIT_WAIT_SECONDS: 'x' })).toBe(120);
});

test('waits out 429 responses within one shared budget, then returns the response', async () => {
  const waits: number[] = [];
  const statuses = [429, 429, 200];
  const request = railwayRequest({
    request: async () => new Response('Rate limit exceeded, please try again in 100 seconds.', { status: statuses.shift()! }),
    sleep: async (ms) => waits.push(ms),
    budgetSeconds: 300,
    report: () => {},
  });
  expect((await request('https://railway.test', {})).status).toBe(200);
  expect(waits).toEqual([115_000, 115_000]);
  // The budget is spent: the next quota response goes back to the caller.
  statuses.push(429);
  expect((await request('https://railway.test', {})).status).toBe(429);
  expect(waits).toHaveLength(2);
});

test('uses Retry-After when the body has no message, and passes other errors through', async () => {
  const waits: number[] = [];
  const responses = [new Response('', { status: 429, headers: { 'retry-after': '20' } }), new Response('', { status: 500 })];
  const request = railwayRequest({ request: async () => responses.shift()!, sleep: async (ms) => waits.push(ms), budgetSeconds: 120, report: () => {} });
  expect((await request('https://railway.test', {})).status).toBe(500);
  expect(waits).toEqual([35_000]);
});
