/**
 * Railway's public API enforces an hourly request quota. When it is exhausted
 * every call returns HTTP 429 with "Rate limit exceeded, please try again in N
 * seconds" until the window resets. Waiting is the only correct response:
 * nothing is wrong with the request, the credentials or the configuration.
 */

const MESSAGE = /Rate limit exceeded, please try again in (\d+(?:\.\d+)?) seconds/i;

/** Seconds Railway asks callers to wait, parsed from any error text; null when the text is not a Railway rate limit. */
export function railwayRetrySeconds(text: string): number | null {
  const match = MESSAGE.exec(text);
  return match ? Math.ceil(Number(match[1])) : null;
}

/**
 * Longest total wait for one operation. The quota window is one hour, so a
 * full wait always reaches a fresh window. Deploy sets a budget above one hour;
 * interactive tools keep the short default and report the limit instead.
 */
export function railwayWaitBudgetSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = env['RAILWAY_RATE_LIMIT_WAIT_SECONDS']?.trim();
  const value = Number(raw);
  return raw && Number.isFinite(value) && value >= 0 ? value : 120;
}

/** A margin past the reset so the first request lands in the new window. */
export const RESET_MARGIN_SECONDS = 15;

function responseRetrySeconds(response: Response, body: string): number | null {
  const fromBody = railwayRetrySeconds(body);
  if (fromBody !== null) return fromBody;
  const header = Number(response.headers.get('retry-after') ?? '');
  if (Number.isFinite(header) && header >= 0) return Math.ceil(header);
  const reset = Number(response.headers.get('x-ratelimit-reset') ?? '');
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.ceil(reset - Date.now() / 1000));
  return 60;
}

/**
 * fetch for the Railway API that waits out 429 responses within the budget.
 * Every other status, including a 429 beyond the budget, is returned to the
 * caller unchanged so its own error handling still applies.
 */
export function railwayRequest(
  options: {
    request?: (url: string, init: RequestInit) => Promise<Response>;
    sleep?: (milliseconds: number) => Promise<unknown>;
    budgetSeconds?: number;
    report?: (message: string) => void;
  } = {},
): (url: string, init: RequestInit, timeoutMs?: number) => Promise<Response> {
  const request = options.request ?? fetch;
  const sleep = options.sleep ?? Bun.sleep;
  const report = options.report ?? console.log;
  let remaining = options.budgetSeconds ?? railwayWaitBudgetSeconds();
  return async (url, init, timeoutMs = 15_000) => {
    for (let attempt = 0; ; attempt++) {
      // A timeout signal starts counting when created, so a retry needs its own.
      const response = await request(url, attempt === 0 ? init : { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status !== 429) return response;
      const body = await response.clone().text();
      const seconds = (responseRetrySeconds(response, body) ?? 60) + RESET_MARGIN_SECONDS;
      if (seconds > remaining) return response;
      remaining -= seconds;
      report(`Railway API rate limit reached; waiting ${seconds}s for the quota window to reset.`);
      await sleep(seconds * 1000);
    }
  };
}
