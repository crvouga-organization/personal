import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { PlatformName } from '@crvouga/homelab/src/platform/types';
import { shortName, type NetHost } from './inventory';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * VS Code user `settings.json`, or `null` when unknown on this OS. Lives here
 * because VS Code is workstation configuration: homelab's `Platform` stopped
 * describing it in 0.9.
 */
export function vscodeSettingsPath(
  platform: PlatformName,
  env: Env = process.env,
  home: string = homedir()
): string | null {
  const dir = (name: string, fallback: string) =>
    env[name]?.trim() || join(home, fallback);
  switch (platform) {
    case 'darwin':
      return join(home, 'Library/Application Support/Code/User/settings.json');
    case 'linux':
      return join(dir('XDG_CONFIG_HOME', '.config'), 'Code/User/settings.json');
    case 'windows':
      return join(dir('APPDATA', 'AppData/Roaming'), 'Code/User/settings.json');
    case 'unknown':
      return null;
  }
}

/** VS Code `code` CLI binaries shipped inside the installed app. */
export function vscodeCliBinaries(
  platform: PlatformName,
  env: Env = process.env,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync
): readonly string[] {
  const candidates: Record<PlatformName, readonly string[]> = {
    darwin: [
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    ],
    linux: ['/usr/share/code/bin/code'],
    windows: [
      join(
        env['LOCALAPPDATA']?.trim() || join(home, 'AppData/Local'),
        'Programs/Microsoft VS Code/bin/code.cmd'
      ),
    ],
    unknown: [],
  };
  return candidates[platform].filter(exists);
}

/** Minimum Remote-SSH connect timeout; busy machines need more than the 15s default. */
export const VSCODE_CONNECT_TIMEOUT_S = 60;

export type VscodeMerge =
  | { readonly ok: true; readonly text: string; readonly changed: boolean }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function platformMap(
  existing: unknown,
  hosts: readonly NetHost[]
): Record<string, string> {
  const map: Record<string, string> = isRecord(existing)
    ? Object.fromEntries(
        Object.entries(existing).filter(
          (e): e is [string, string] => typeof e[1] === 'string'
        )
      )
    : {};
  for (const h of hosts) {
    for (const name of [h.alias, h.tailscaleName, shortName(h.tailscaleName)]) {
      map[name] = h.os;
    }
  }
  return map;
}

/**
 * Merge Remote-SSH settings (per-host platform, longer connect timeout) into
 * VS Code `settings.json`. Refuses JSONC (comments / trailing commas) rather
 * than rewriting it lossily. Pure — unit-tested.
 */
export function mergeVscodeSettings(
  raw: string,
  hosts: readonly NetHost[]
): VscodeMerge {
  let parsed: unknown;
  try {
    parsed = raw.trim().length === 0 ? {} : JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: 'settings.json has comments or trailing commas; edit it by hand',
    };
  }
  if (!isRecord(parsed))
    return { ok: false, reason: 'settings.json is not an object' };
  const timeout = parsed['remote.SSH.connectTimeout'];
  const next = {
    ...parsed,
    'remote.SSH.remotePlatform': platformMap(
      parsed['remote.SSH.remotePlatform'],
      hosts
    ),
    'remote.SSH.connectTimeout': Math.max(
      typeof timeout === 'number' ? timeout : 0,
      VSCODE_CONNECT_TIMEOUT_S
    ),
  };
  const text = `${JSON.stringify(next, null, 4)}\n`;
  return { ok: true, text, changed: text !== raw };
}
