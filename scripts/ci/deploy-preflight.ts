/** Read-only OpenTofu credential probe, including any pending resource moves. */
import { appendFileSync } from 'node:fs';
import {
  railwayRetrySeconds,
  railwayWaitBudgetSeconds,
  RESET_MARGIN_SECONDS,
} from '../../packages/infra/lib/railway-rate-limit';

/** Seconds to wait when every error is Railway's API quota; null otherwise. */
export function rateLimitWait(output: string): number | null {
  try {
    const errors = output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
      .filter(
        (event) =>
          event.type === 'diagnostic' && event.diagnostic?.severity === 'error'
      )
      .map((event) =>
        railwayRetrySeconds(
          `${event.diagnostic.summary} ${event.diagnostic.detail}`
        )
      );
    if (errors.length === 0 || errors.some((seconds) => seconds === null))
      return null;
    return Math.max(...(errors as number[])) + RESET_MARGIN_SECONDS;
  } catch {
    return null;
  }
}

export function requiredMoveTargets(output: string): string[] | null {
  try {
    const diagnostics = output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
      .filter((event) => event.type === 'diagnostic')
      .map((event) => event.diagnostic);
    if (diagnostics.some((error) => !error || !error.severity)) return null;
    const failures = diagnostics.filter((error) => error.severity === 'error');
    if (
      failures.length === 0 ||
      failures.some(
        (error) =>
          error.summary !== 'Moved resource instances excluded by targeting' ||
          typeof error.detail !== 'string'
      )
    )
      return null;
    const targets: string[] = [];
    for (const error of failures) {
      const matches = [
        ...error.detail.matchAll(/^\s*-target=("(?:[^"\\]|\\.)+")\s*$/gm),
      ];
      if (matches.length === 0) return null;
      for (const match of matches) targets.push(JSON.parse(match[1]));
    }
    return [...new Set(targets)];
  } catch {
    return null;
  }
}

export function checkDeploymentCredentials(
  root = 'packages/infra/tofu/foundation',
  sleep: (milliseconds: number) => void = Bun.sleepSync,
  rateLimitBudget = railwayWaitBudgetSeconds()
): number {
  const targets = ['railway_project.workspace'];
  let budget = rateLimitBudget;
  // OpenTofu lists all excluded move endpoints in its diagnostic. Include those
  // once; do not retry authorization, configuration or mixed failures. Waiting
  // out Railway's hourly API quota does not use up an attempt.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = Bun.spawnSync(
      [
        'tofu',
        `-chdir=${root}`,
        'plan',
        '-json',
        '-refresh-only',
        '-input=false',
        '-lock=false',
        '-parallelism=1',
        ...targets.map((target) => `-target=${target}`),
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'inherit' }
    );
    const output = result.stdout.toString();
    console.log(output);
    if (result.exitCode === 0) return 0;
    const wait = rateLimitWait(output);
    if (wait !== null && wait <= budget) {
      budget -= wait;
      console.log(
        `Railway API rate limit reached; waiting ${wait}s for the quota window to reset.`
      );
      sleep(wait * 1000);
      attempt--;
      continue;
    }
    const required = requiredMoveTargets(output);
    const additional = required?.filter((target) => !targets.includes(target));
    if (attempt === 1 || !additional?.length) return result.exitCode || 1;
    console.log('Including pending resource moves in the read-only preflight.');
    targets.push(...additional);
  }
  return 1;
}

if (import.meta.main) {
  process.exitCode = checkDeploymentCredentials();
  if (process.exitCode !== 0) {
    const message =
      'Read-only OpenTofu deployment preflight failed. See the diagnostics for state, configuration or provider access errors; no changes were applied.';
    console.error(`::error title=Deployment preflight failed::${message}`);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Deployment blocked before builds\n\n${message}\n`
      );
  }
}
