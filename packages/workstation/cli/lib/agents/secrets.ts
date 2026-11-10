import { AgentConfigurationError } from './errors';
import { VaultSecretStore } from '@pkgs/secret-store';
import { VaultCli } from '@pkgs/vault';
import { registry } from './registry';
import { resolveVaultConfig } from '../vault-config';

export function proxyKey(): Promise<string> {
  return sharedSecret(registry.proxy.secret.key);
}

/** The one shared Cursor account. Cursor's backend cannot be reached through
 * the CLI proxy, so every node uses this Vault key instead of a login.
 */
export const CURSOR_KEY = 'CURSOR_API_KEY';
export function cursorKey(): Promise<string> {
  return sharedSecret(CURSOR_KEY);
}

/** Reads one field of the shared Vault document with this node's own session. */
export async function sharedSecret(key: string): Promise<string> {
  const reference = registry.proxy.secret;
  try {
    const { addr } = resolveVaultConfig();
    const token = new VaultCli({ addr }).resolveToken().token;
    const store = new VaultSecretStore({
      addr,
      token,
      mount: reference.mount,
      project: reference.project,
      config: reference.config,
    });
    const row = await store.getOptionalMany([key]);
    const value = row[key]?.readSecretValue().trim();
    if (value) return value;
  } catch {
    /* Never forward Vault/network exceptions or response bodies. */
  }
  throw new AgentConfigurationError(
    `Required Vault secret unavailable: secret/data/personal/prd ${key}. Authenticate this node with vault login and verify read permission; secret changes belong to OpenTofu.`
  );
}
