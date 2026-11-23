import { expect, test } from 'bun:test';
import { applyWithRetry } from './tofu-apply';

const quota = {
  severity: 'error',
  summary: 'Client Error',
  address: 'module.service["docs"].railway_service.this',
  detail:
    'Unable to update service, got error: returned error 429 Too Many Requests: Rate limit exceeded, please try again in 600 seconds.',
};
const denied = { ...quota, detail: 'Unable to update service: Not Authorized' };
const ok = { code: 0, valid: true, errors: [] };
const failed = (errors = [quota]) => ({ code: 1, valid: true, errors });

test('a services apply interrupted by the Railway quota waits, replans the remainder and applies it', async () => {
  const events: string[] = [];
  let applies = 0;
  const code = await applyWithRetry(
    'packages/infra/tofu/services',
    {
      apply: async () => (
        events.push('apply'),
        ++applies === 1 ? failed() : ok
      ),
      replan: async () => (events.push('plan'), 0),
      wait: async (ms) => events.push(`wait ${ms}`),
    },
    3900
  );
  expect(code).toBe(0);
  expect(events).toEqual(['apply', 'wait 615000', 'plan', 'apply']);
});

test('apply never retries other failures, other roots or a wait beyond the budget', async () => {
  for (const [root, result, budget] of [
    ['packages/infra/tofu/services', failed([denied]), 3900],
    ['packages/infra/tofu/services', failed([quota, denied]), 3900],
    ['packages/infra/tofu/foundation', failed(), 3900],
    ['packages/infra/tofu/services', failed(), 0],
  ] as const) {
    const events: string[] = [];
    const code = await applyWithRetry(
      root,
      {
        apply: async () => (events.push('apply'), result),
        replan: async () => (events.push('plan'), 0),
        wait: async () => events.push('wait'),
      },
      budget
    );
    expect(code).toBe(1);
    expect(events).toEqual(['apply']);
  }
});

test('a failed replan stops the apply', async () => {
  const code = await applyWithRetry(
    'packages/infra/tofu/services',
    {
      apply: async () => failed(),
      replan: async () => 7,
      wait: async () => {},
    },
    3900
  );
  expect(code).toBe(7);
});
