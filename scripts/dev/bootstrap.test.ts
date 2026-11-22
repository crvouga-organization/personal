import { expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = join(import.meta.dir, 'bootstrap.sh');
const pinned = /^MISE_VERSION=(\S+)$/m.exec(readFileSync(script, 'utf8'))?.[1];

/** Runs bootstrap.sh with a fake mise at `installed` and a curl that records downloads. */
function bootstrap(installed: string) {
  const home = mkdtempSync(join(tmpdir(), 'bootstrap-'));
  try {
    const bin = join(home, '.local/bin');
    const fake = join(home, 'fake');
    mkdirSync(bin, { recursive: true });
    mkdirSync(fake);
    writeFileSync(
      join(bin, 'mise'),
      `#!/bin/sh\nif [ "$1" = --version ]; then echo "${installed} macos-arm64 (2026-01-01)"; fi\n`
    );
    writeFileSync(
      join(fake, 'curl'),
      `#!/bin/sh\necho "$@" >>"${home}/downloads"\nexit 22\n`
    );
    chmodSync(join(bin, 'mise'), 0o755);
    chmodSync(join(fake, 'curl'), 0o755);
    const result = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: { HOME: home, PATH: `${fake}:/usr/bin:/bin` },
    });
    let downloads = '';
    try {
      downloads = readFileSync(join(home, 'downloads'), 'utf8');
    } catch {
      // Nothing was downloaded.
    }
    return { status: result.status, downloads };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test('bootstrap keeps the pinned mise and any newer one', () => {
  expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  // A fleet machine: dev-fleet installed a newer mise and its global config requires it.
  for (const installed of [pinned!, '2999.1.0', '2026.10.100']) {
    expect(bootstrap(installed)).toEqual({ status: 0, downloads: '' });
  }
});

test('bootstrap replaces a mise older than the pin', () => {
  for (const installed of ['2020.12.31', '2026.9.30']) {
    const result = bootstrap(installed);
    expect(result.status).not.toBe(0);
    expect(result.downloads).toContain(`mise-v${pinned}-`);
  }
});
