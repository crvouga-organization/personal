#!/usr/bin/env bun
/** T3 binaryPath adapter for Cursor. Cursor's backend cannot be reached through
 * the CLI proxy, so every node signs in as the same Cursor account with the
 * shared CURSOR_API_KEY from Vault; it is never written to disk or argv.
 */
import { cursorKey } from '../cli/lib/agents/secrets';
import { AgentConfigurationError } from '../cli/lib/agents/errors';
import { pinnedPath } from '../cli/lib/agents/toolchain';

const args = process.argv.slice(2);
const env: Record<string, string | undefined> = {
  ...process.env,
  CURSOR_INVOKED_AS: 'cursor-agent',
  PATH: pinnedPath(),
  // The key arrives on every launch; never persist it (and never touch the
  // macOS keychain, which is locked in SSH and service sessions).
  AGENT_CLI_CREDENTIAL_STORE: 'memory',
};
try {
  // Version probes need no credentials.
  if (!(args.length === 1 && ['--version', '-v'].includes(args[0]!)))
    env['CURSOR_API_KEY'] = await cursorKey();
  process.exitCode = await Bun.spawn(['cursor-agent', ...args], {
    env,
    stdio: ['inherit', 'inherit', 'inherit'],
  }).exited;
} catch (error) {
  process.stderr.write(
    `${error instanceof AgentConfigurationError ? error.message : 'Cursor launcher unavailable.'} Run personal fleet-sync from a terminal to repair this machine.\n`
  );
  process.exitCode = 1;
}
