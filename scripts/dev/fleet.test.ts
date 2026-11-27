import { expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function git(cwd: string, args: string[], date?: string): string {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
  };
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

/** A homelab source with an older and a newer commit; the machine runs `applied`. */
function fleetSync(pin: 'older' | 'newer') {
  const home = mkdtempSync(join(tmpdir(), 'fleet-sync-'));
  try {
    const source = join(home, '.local/share/homelab/source');
    mkdirSync(join(source, 'bootstrap'), { recursive: true });
    git(source, ['init', '--quiet']);
    const commit = (label: string, date: string) => {
      writeFileSync(
        join(source, 'bootstrap/fleet-manager-run.sh'),
        `echo ran ${label}\n`
      );
      git(source, ['add', '.']);
      git(source, ['commit', '--quiet', '-m', label], date);
      return git(source, ['rev-parse', 'HEAD']);
    };
    const older = commit('older', '2026-01-01T00:00:00Z');
    const newer = commit('newer', '2026-02-01T00:00:00Z');
    const fleet = join(home, '.local/share/personal/fleet');
    mkdirSync(fleet, { recursive: true });
    git(source, [
      'worktree',
      'add',
      '--quiet',
      '--detach',
      join(fleet, 'current'),
      newer,
    ]);
    const root = join(home, 'checkout');
    mkdirSync(join(root, 'scripts/dev'), { recursive: true });
    writeFileSync(
      join(root, 'scripts/dev/fleet.sh'),
      readFileSync(join(import.meta.dir, 'fleet.sh'))
    );
    writeFileSync(
      join(root, 'fleet.revision'),
      pin === 'older' ? older : newer
    );
    writeFileSync(
      join(root, 'fleet.json'),
      JSON.stringify({ source: { repository: source } })
    );
    return spawnSync('sh', [join(root, 'scripts/dev/fleet.sh'), 'converge'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const unix = test.skipIf(process.platform === 'win32');

unix('converge refuses a pin older than the homelab the machine runs', () => {
  // An older revision's bootstrap would replace the newer mise its global config requires.
  const result = fleetSync('older');
  expect(result.status).toBe(5);
  expect(result.stdout).not.toContain('ran');
  expect(result.stderr).toContain('git pull');
});

unix('converge runs a pin at or after the applied revision', () => {
  const result = fleetSync('newer');
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('ran newer');
});
