# NEXUS MVP Service Contract

## Purpose

The NEXUS MVP service is the local authority for communication state, access evaluation, adapter normalization, and external references.

It is intentionally small and internal-first. The contract is designed to power both the desktop shell and a future web client without changing the underlying model.

## Service shape

- Protocol: HTTP + JSON
- Authority: local workstation service in the MVP, with a hosted-capable mode that preserves the same contract
- Persistence: shared CHATBASE and METABASE model backed by either JSON bootstrap storage or LIBRARY-backed Postgres storage
- Audience: internal humans and system identities only

## Core entities

- workspace
- channel
- directConversation
- post
- thread
- message
- attachment
- identity
- role
- membership
- relay
- handoff
- externalReference
- adapterEndpoint

## Required endpoints

### Read

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/identities`
- `GET /api/workspaces?actorId=...`
- `GET /api/channels?actorId=...&workspaceId=...`
- `GET /api/direct-conversations?actorId=...`
- `GET /api/posts?actorId=...&channelId=...`
- `GET /api/threads?actorId=...&channelId=...&postId=...`
- `GET /api/messages?actorId=...&scopeType=...&scopeId=...`
- `GET /api/search?actorId=...&q=...`
- `GET /api/external-references?actorId=...&ownerType=...&ownerId=...`

### Write

- `POST /api/messages`
- `POST /api/posts`
- `POST /api/threads`
- `POST /api/direct-conversations`
- `POST /api/external-references`

### Adapter ingress

- `POST /api/adapters/discord/events`

## Access control

- Every read and write endpoint requires an `actorId`.
- The service evaluates visibility at request time against METABASE policy.
- Direct conversations are only readable by participants.
- Restricted/private channels are only readable by allowed identities or roles.
- Shared channels still require workspace membership and any channel-level role constraints.

## Contract rules

- `GET /api/health` must expose the active `storageMode` and safe storage labels, so desktop and future web clients can tell whether they are talking to bootstrap JSON or LIBRARY-backed persistence.
- `GET /api/health` must also expose `deploymentMode`, `staticMode`, and any safe origin metadata needed to tell whether the service is running as a desktop-managed local surface or a hosted-capable/API-only surface.
- `POST /api/messages` and `POST /api/posts` may carry inline `attachments` arrays so composition stays on the shared message contract instead of depending on a separate upload/session model in the MVP.
- `GET /api/external-references` and `POST /api/external-references` must work uniformly for scope owners (`channel`, `post`, `thread`, `direct`) and message owners so desktop and future web clients do not fork their reference model.
- Adapter payloads may contain external transport identifiers but must map into internal NEXUS objects before persistence.
- External references never redefine the owning object; they only link outward.
- All persisted messages generate message events in CHATBASE.
- Attachments are first-class metadata records attached to messages.

## Runtime modes

- `local-managed`
  Default desktop-first mode. Binds to localhost, serves the bundled client surface, and is intended to be managed by the desktop shell.
- `hosted`
  Hosted-capable mode. Uses explicit host/bind/public-origin settings, may serve the bundled client surface or run API-only, and must preserve the same endpoint contract as local-managed mode.

## MVP non-goals

- websocket delivery
- live presence
- background notifications
- task ownership
- workflow board ownership
