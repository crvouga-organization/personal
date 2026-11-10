import { join } from 'node:path';
import { registry, type Selection } from './registry';
import { proxyKey } from './secrets';

export async function launchProfile(
  root: string,
  selection: Selection,
  args: string[]
): Promise<number> {
  const directory = join(
    root,
    selection.node,
    selection.tool,
    selection.profile
  );
  const env = { ...process.env };
  // Do not allow an ambient gateway to silently change the selected route.
  for (const name of [
    'OPENAI_BASE_URL',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'CLIPROXY_API_KEY',
    'GOOGLE_GEMINI_BASE_URL',
    'GROK_MODELS_BASE_URL',
    'GROK_CODE_XAI_API_KEY',
    'XAI_API_KEY',
  ])
    delete env[name];
  if (selection.profile === 'proxy') {
    env['CLIPROXY_API_KEY'] = await proxyKey();
    configureGatewayEnvironment(env, selection);
  }
  if (selection.tool === 'claude') env['DISABLE_AUTOUPDATER'] = '1';
  if (selection.tool === 'codex') env['CODEX_HOME'] = directory;
  if (selection.tool === 'opencode')
    env['OPENCODE_CONFIG'] = join(directory, 'opencode.json');
  if (selection.tool === 'gemini') env['GEMINI_CLI_HOME'] = directory;
  if (selection.tool === 'grok') {
    env['GROK_HOME'] = directory;
    env['GROK_DISABLE_AUTOUPDATER'] = '1';
  }
  if (selection.tool === 'antigravity')
    // Only "true" disables Antigravity's in-place self-updater ("1" is ignored).
    env['AGY_CLI_DISABLE_AUTO_UPDATE'] = 'true';
  const child = Bun.spawn(
    [selection.tool, ...launchArgs(selection, directory, args, env)],
    {
      env,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }
  );
  return child.exited;
}

/** Tool-specific arguments that select the rendered profile. */
export function launchArgs(
  selection: Selection,
  directory: string,
  args: string[],
  env: NodeJS.ProcessEnv
): string[] {
  if (selection.tool === 'claude')
    return ['--settings', join(directory, 'settings.json'), ...args];
  if (selection.tool === 'antigravity') {
    // Over ACP (how T3 runs it) T3 owns a private GEMINI_HOME and selects the
    // Gemini API key method; the proxy key and endpoint come from this wrapper.
    // Run directly, the fleet profile is the home; one-shot print mode only
    // reads ~/.gemini, so it also runs with HOME set to the profile.
    if (args[0] === 'acp') {
      env['GEMINI_HOME'] ??= join(directory, '.gemini');
      return ['acp', '--disable-telemetry', ...args.slice(1)];
    }
    env['HOME'] = directory;
  }
  return args;
}

function configureGatewayEnvironment(
  env: NodeJS.ProcessEnv,
  selection: Selection
): void {
  if (selection.tool === 'gemini' || selection.tool === 'antigravity') {
    delete env['GOOGLE_GENAI_USE_VERTEXAI'];
    delete env['GOOGLE_GENAI_USE_GCA'];
    env['GOOGLE_GEMINI_BASE_URL'] = registry.proxy.endpoint;
    env['GEMINI_API_KEY'] = env['CLIPROXY_API_KEY'];
  }
  if (selection.tool === 'claude') {
    delete env['ANTHROPIC_API_KEY'];
    env['ANTHROPIC_BASE_URL'] = registry.proxy.endpoint;
    env['ANTHROPIC_AUTH_TOKEN'] = env['CLIPROXY_API_KEY'];
    for (const family of ['OPUS', 'SONNET', 'HAIKU'])
      env[`ANTHROPIC_DEFAULT_${family}_MODEL`] = selection.model;
  }
}
