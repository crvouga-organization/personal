# Personal

Bun + Turborepo monorepo for [chrisvouga.dev](https://www.chrisvouga.dev), its cloud platform, shared libraries and local workstation tools. Agents start with [AGENTS.md](AGENTS.md).

## Setup

Follow the [shared machine bootstrap](scripts/dev/README.md) (macOS, Windows or Linux). It installs the pinned mise toolchain and frozen dependencies.

```bash
bun install
bun run dev          # start the active applications
bun run check        # everything CI checks (needs OpenTofu 1.13.0 and Playwright Chromium)
bun run gh:ci:watch  # after pushing; a green local check is not green CI
```

## Packages

| Package                                                                                                                | Purpose                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`portfolio`](packages/portfolio)                                                                                      | Astro site, GitHub insights and generated resume      |
| [`infra`](packages/infra/tofu/README.md)                                                                               | OpenTofu infrastructure and read-only health adapters |
| [`vault-service`](packages/vault-service)                                                                              | OpenBao runtime image and Vault CLI                   |
| [`auth-relay`](packages/auth-relay/README.md)                                                                          | Shared Google-to-OIDC broker                          |
| [`9router`](packages/9router)                                                                                          | Railway routing app with SQLite replicated to R2      |
| [`zoomies`](packages/zoomies/README.md)                                                                                | Self-hosted GitHub Actions runner controller          |
| [`personal-cli`](packages/personal-cli/README.md)                                                                      | The `personal` CLI                                    |
| [`workstation`](packages/workstation/README.md)                                                                        | Portable dev-machine configuration                    |
| [`password-manager`](packages/password-manager/README.md)                                                              | Local account discovery and Bitwarden maintenance     |
| [`turborepo-remote-cache`](packages/turborepo-remote-cache)                                                            | Dormant cache server                                  |
| `admin-ui`, `assert`, `logger`, `object-store`, `openrouter`, `secret-store`, `secret-string`, `vault`, `eslint-rules` | Shared libraries                                      |

## Infrastructure

Cloud resources are managed only by **OpenTofu** — see [packages/infra/tofu](packages/infra/tofu/README.md).

```bash
bun run infra plan           # foundation
bun run infra:bootstrap plan # initialization and seal state
bun run infra:vault plan     # policies, auth and KV values
bun run infra:services plan  # services, images and DNS
bun run health               # read-only platform report (--drift, --only, --json)
bun run vault:edit           # interactive secret editor (--dry-run, --demo)
```

[CI](.github/workflows/ci.yml) gates every PR and calls [Deploy](.github/workflows/deploy.yml) on `main`. [Maintenance](.github/workflows/maintenance.yml) runs daily health and update PRs.

## Fleet

Developer machines are managed by [dev-fleet](https://github.com/crvouga/dev-fleet); this repo holds only `fleet.json` and the pinned `fleet.revision`. Use `bun run fleet:preview`, `fleet:sync` and `fleet:health`.

## Agent guides

[llms-local.txt](llms-local.txt) (machines and toolchain) and [llms-cloud.txt](llms-cloud.txt) (cloud apps) are generated from templates; [llms.txt](llms.txt) routes between them. Regenerate with `bun run llms:sync`.
