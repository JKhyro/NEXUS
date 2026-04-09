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
  Electron desktop shell that manages the local service, logs managed-runtime failures, and loads the local web surface.
- `apps/web`
  Browser-facing NEXUS client that uses the same service contract for channel browsing, direct conversations, forum posts, native threads, search, and composition.
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

## Current desktop implementation

The current desktop implementation in this repo is the Electron-managed shell in `apps/desktop` backed by the Node service in `apps/service`.

This repo does not currently contain an Avalonia desktop client. Any future native-desktop or Avalonia transition would be a new implementation decision rather than the current repo baseline.

## Approved target desktop direction

The April 1, 2026 direction for future NEXUS desktop work is:

- native-C-first runtime and interop surfaces
- Avalonia as the desktop UI host where a managed shell is still useful
- native C interop as the preferred boundary between the UI host and native runtime components
- C# only where necessary for Avalonia hosting, glue code, or thin orchestration layers

That means Electron and the current Node-managed desktop shell should be treated as the continuity baseline already present in repo, not the intended long-term desktop stack.

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

## Service runtime modes

The same service can now run in two runtime shapes without forking the API model:

- `local-managed`
  The desktop-first default. The service binds to localhost, serves the bundled client surface, and is managed by the desktop shell.
- `hosted`
  A hosted-capable mode for non-local deployment. Host/bind/public-origin settings are explicit, CORS can be enabled for a separate web surface, and static serving can be disabled for API-only operation.

Relevant config keys:

```json
{
  "deploymentMode": "hosted",
  "host": "0.0.0.0",
  "port": 43100,
  "staticMode": "disabled",
  "publicOrigin": "https://nexus.example.invalid",
  "allowedOrigins": ["https://nexus.example.invalid"]
}
```

## Desktop runtime behavior

The desktop shell now treats the managed local NEXUS service as an explicit runtime with operator-visible diagnostics rather than a silent child process:

- it verifies a usable Node.js binary before launch
- it reuses an already-healthy local NEXUS service on the configured localhost port instead of blindly double-starting
- it writes managed-service stdout and stderr to a runtime log under the desktop user-data path
- it surfaces launch and readiness failures through the desktop shell with a stable error code and log-path context
- it stops owned managed-service children cleanly on app quit

## Current client surface

The current desktop/web client can:

- browse visible workspaces and channels
- open and create direct conversations between internal identities
- open forum-style channels as native post lists
- open and create native threads under channels and posts
- read imported Discord history from NEXUS-native channels and posts
- browse imported and newly created attachment metadata inline with messages
- create forum posts and ordinary messages with inline attachment metadata through the same service contract
- browse and create external references on scopes and selected messages for ANVIL, GitHub, or Discord-linked context
- run a read-only reverse lookup for an ANVIL, GitHub, or Discord external item, search the already-loaded readable results, group and filter them by owner type, see scope/message coordination summaries for each readable result, and jump directly into each linked NEXUS channel, post, thread, direct conversation, or message
- inspect and create relay and handoff records for the current scope, switch the coordination rail into a selected-message focus when needed, jump back to related messages when coordination records carry `messageId`, and see message-level coordination badges directly in the conversation view
- keep the URL in sync with the current actor, workspace, scope, and selected-message context so operators can deep-link directly back into readable NEXUS state
- copy a readable link to the current scope or the currently selected message directly from the client surface
- render clickable breadcrumbs for the current workspace, scope, and selected-message route so operators can step back through readable context without relying only on the sidebar
- keep a recent readable route-history stack in the client, with in-surface back and forward controls for stepping through recent NEXUS context without leaving the current surface
- surface recent readable activity across channels and direct conversations so operators can see what changed recently and jump back into the relevant NEXUS route state
- search visible history and jump into matching channel, post, thread, or direct scopes

For normal local use, copy [config/nexus.local.example.json](config/nexus.local.example.json) to `config/nexus.local.json` and fill in the real LIBRARY connection details. The service and desktop shell will pick that file up automatically.

If local `library-postgres` credentials are not valid yet, switch to JSON bootstrap mode for isolated local runs instead of treating a failed desktop launch as an application-surface bug:

```json
{
  "storageMode": "json"
}
```

## CHATBASE import

`npm run import:chatbase` imports retained Discord history from the existing LIBRARY `chatbase` schema into NEXUS-native records using the active Discord adapter channel mappings. The first importer pass is intentionally bounded to adapter-mapped channels, so it brings over known lanes without redefining NEXUS access policy.

The importer now also carries retained Discord forum posts into native NEXUS posts when the retained source only preserves thread-channel rows. Those forum posts are routed through explicit bootstrap rules so investigation-style posts land in `investigation`, issue-style posts land in `report`, and unmatched retained forum posts fall back to `library` instead of being dropped.

When retained Discord event payloads preserve a thread `parentId`, the importer now uses that recovered parent mapping as the authoritative source for the target NEXUS forum lane and only falls back to forum-routing rules when the retained source genuinely lacks parent metadata.

The importer also derives durable relay records for imported Discord messages. That backfills cutover diagnostics into already-imported NEXUS history instead of limiting relay visibility to fresh adapter traffic only.

Live `POST /api/adapters/discord/events` ingress now persists a relay record for every accepted Discord message and may persist an accompanying handoff record when the adapter payload includes a `handoff` object. The cutover diagnostics surface is therefore backed by durable CHATBASE records, not sidecar logs.

## Architecture records

- [First-pass architecture brief](docs/first-pass-architecture.md)
- [MVP service contract](docs/mvp-service-contract.md)
- [CHATBASE and METABASE storage contract](docs/mvp-storage-contract.md)
- [ANVIL integration contract](docs/anvil-integration-contract.md)
- [Discord cutover plan](docs/discord-cutover-plan.md)
- [Hosted service mode](docs/hosted-service-mode.md)
- [Runtime topology](docs/runtime-topology.md)
