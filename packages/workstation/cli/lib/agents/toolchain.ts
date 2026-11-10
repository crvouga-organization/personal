import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** mise shims resolve every agent to the version pinned in the shared lock.
 * Putting them first keeps an unmanaged copy elsewhere on PATH (a vendor
 * installer in ~/.local/bin, an nvm global) from shadowing the pinned one.
 */
export function pinnedPath(env: NodeJS.ProcessEnv = process.env): string {
  const data =
    env['MISE_DATA_DIR'] ??
    join(env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share'), 'mise');
  const shims = join(data, 'shims');
  const rest = (env['PATH'] ?? '')
    .split(delimiter)
    .filter((entry) => entry && entry !== shims);
  return [shims, ...rest].join(delimiter);
}
