/**
 * Apply the reviewed saved plan. When Railway's hourly API quota interrupts
 * the apply, OpenTofu has already recorded every completed change in state;
 * wait for the quota window, review a fresh plan of what remains and apply it.
 * Any other failure stops immediately. Only the services root replans: other
 * roots gate their plans on extra review steps in the workflow.
 */
import { appendFileSync } from 'node:fs';
import { railwayWaitBudgetSeconds } from '../packages/infra/lib/railway-rate-limit';
import {
  planWithRetry,
  rateLimited,
  retryDelay,
  runTofuJson,
  type PlanResult,
} from './tofu-plan';

const ROUNDS = 3;

export async function applyWithRetry(
  root: string,
  steps: {
    apply?: (root: string) => Promise<PlanResult>;
    replan?: (root: string, budget: number) => Promise<number>;
    wait?: (milliseconds: number) => Promise<unknown>;
  } = {},
  rateLimitBudget = railwayWaitBudgetSeconds()
): Promise<number> {
  const apply =
    steps.apply ??
    ((directory: string) =>
      runTofuJson([
        'tofu',
        `-chdir=${directory}`,
        'apply',
        '-json',
        '-input=false',
        '-lock-timeout=15m',
        '-parallelism=1',
        'apply.tfplan',
      ]));
  const replan =
    steps.replan ??
    ((directory: string, budget: number) =>
      planWithRetry(directory, undefined, undefined, budget));
  const wait = steps.wait ?? Bun.sleep;
  let budget = rateLimitBudget;
  for (let round = 0; round < ROUNDS; round++) {
    const result = await apply(root);
    if (result.code === 0) return 0;
    const delay =
      root.endsWith('/services') && rateLimited(result)
        ? retryDelay(result, round, budget)
        : null;
    if (delay === null || round === ROUNDS - 1) return result.code || 1;
    budget -= delay / 1000;
    console.log(
      `Railway API quota interrupted the apply; completed changes are in state. Replanning the remainder in ${delay / 1000}s.`
    );
    await wait(delay);
    const planned = await replan(root, budget);
    if (planned !== 0) return planned;
  }
  return 1;
}

if (import.meta.main) {
  const root = process.env.TOFU_ROOT ?? '';
  if (!/^[a-z-]+$/.test(root))
    throw new Error('TOFU_ROOT must name an OpenTofu root');
  process.exitCode = await applyWithRetry(`packages/infra/tofu/${root}`);
  if (process.exitCode !== 0 && process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### OpenTofu ${root} apply failed\n\nSee the apply log for diagnostics.\n`
    );
}
