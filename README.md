# NEXUS

NEXUS is the in-house communications and coordination product that replaces Discord for internal humans, Symbiotes, Curators, and supporting systems.

## MVP direction

- Desktop-first and local-first
- Managed local NEXUS service on the workstation
- Shared service contract for desktop now and web later
- Communications core only in the first executable MVP
- Tight early coupling with `ANVIL`
- Discord treated as a temporary adapter, not the product model

## Product stack

- Product: `NEXUS`
- Database estate: `LIBRARY`
- Communications/event record layer: `CHATBASE`
- Metadata, registry, and policy layer: `METABASE`

## Repo layout

- `apps/service`
  Local NEXUS service with REST endpoints, bootstrap loading, CHATBASE/METABASE scaffolding, and adapter ingress.
- `apps/desktop`
  Desktop shell that manages the local service and loads the local web surface.
- `apps/web`
  Browser-facing NEXUS client that uses the same service contract for channel browsing, forum posts, search, and composition.
- `packages/contracts`
  Shared entity kinds and input validators for the MVP contract.
- `config/internal-bootstrap.json`
  Greenfield internal channel and workspace bootstrap for private and shared spaces.

## Commands

```powershell
npm install
npm run service:start
npm run service:library
npm run import:chatbase
npm run desktop:start
npm test
```

## Storage modes

The service now supports two persistence modes behind the same contract:

- `json`
  Bootstrap/runtime convenience mode using `runtime/metabase.json` and `runtime/chatbase.json`
- `library-postgres`
  LIBRARY-backed persistence mode that writes NEXUS-native records into separate `CHATBASE` and `METABASE` schemas in Postgres

Environment keys for `library-postgres` mode:

```powershell
$env:NEXUS_STORAGE_MODE = 'library-postgres'
$env:NEXUS_LIBRARY_CONNECTION_STRING = 'postgres://...'
$env:NEXUS_LIBRARY_CHATBASE_SCHEMA = 'nexus_chatbase'
$env:NEXUS_LIBRARY_METABASE_SCHEMA = 'nexus_metabase'
```

The product contract stays the same across both modes. JSON is only the bootstrap backend; LIBRARY-backed persistence is the intended long-term path.

## Current client surface

The current desktop/web client can:

- browse visible workspaces and channels
- open forum-style channels as native post lists
- read imported Discord history from NEXUS-native channels and posts
- create forum posts and ordinary messages through the same service contract
- search visible history and jump into matching channel or post scopes

For normal local use, copy [config/nexus.local.example.json](config/nexus.local.example.json) to `config/nexus.local.json` and fill in the real LIBRARY connection details. The service and desktop shell will pick that file up automatically.

## CHATBASE import

`npm run import:chatbase` imports retained Discord history from the existing LIBRARY `chatbase` schema into NEXUS-native records using the active Discord adapter channel mappings. The first importer pass is intentionally bounded to adapter-mapped channels, so it brings over known lanes without redefining NEXUS access policy.

The importer now also carries retained Discord forum posts into native NEXUS posts when the retained source only preserves thread-channel rows. Those forum posts are routed through explicit bootstrap rules so investigation-style posts land in `investigation`, issue-style posts land in `report`, and unmatched retained forum posts fall back to `library` instead of being dropped.

## Architecture records

- [First-pass architecture brief](docs/first-pass-architecture.md)
- [MVP service contract](docs/mvp-service-contract.md)
- [CHATBASE and METABASE storage contract](docs/mvp-storage-contract.md)
- [ANVIL integration contract](docs/anvil-integration-contract.md)
- [Discord cutover plan](docs/discord-cutover-plan.md)
