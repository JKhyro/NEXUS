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
  Browser-facing smoke surface that uses the same service contract.
- `packages/contracts`
  Shared entity kinds and input validators for the MVP contract.
- `config/internal-bootstrap.json`
  Greenfield internal channel and workspace bootstrap for private and shared spaces.

## Commands

```powershell
npm install
npm run service:start
npm run desktop:start
npm test
```

## Architecture records

- [First-pass architecture brief](docs/first-pass-architecture.md)
- [MVP service contract](docs/mvp-service-contract.md)
- [CHATBASE and METABASE storage contract](docs/mvp-storage-contract.md)
- [ANVIL integration contract](docs/anvil-integration-contract.md)
- [Discord cutover plan](docs/discord-cutover-plan.md)
