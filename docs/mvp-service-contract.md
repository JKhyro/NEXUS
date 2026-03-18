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
- `GET /api/activity?actorId=...&workspaceId=...`
- `GET /api/posts?actorId=...&channelId=...`
- `GET /api/threads?actorId=...&channelId=...&postId=...`
- `GET /api/messages?actorId=...&scopeType=...&scopeId=...`
- `GET /api/message?actorId=...&messageId=...`
- `GET /api/relays?actorId=...&scopeType=...&scopeId=...`
- `GET /api/handoffs?actorId=...&scopeType=...&scopeId=...`
- `GET /api/search?actorId=...&q=...`
- `GET /api/external-references?actorId=...&ownerType=...&ownerId=...`
- `GET /api/external-reference-links?actorId=...&system=...&externalId=...`

### Write

- `POST /api/messages`
- `POST /api/posts`
- `POST /api/threads`
- `POST /api/direct-conversations`
- `POST /api/external-references`
- `POST /api/relays`
- `POST /api/handoffs`

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
- `GET /api/external-reference-links` must return every readable NEXUS owner or message currently linked to the requested external item, filtered by the requesting actor's normal visibility rules.
- Reverse linked-context results must include enough route metadata to reopen the linked NEXUS context without a second model, including any readable workspace, scope, post, thread, direct-conversation, and message identifiers needed by the client.
- Reverse linked-context lookup is read-only. It does not create workflow objects or redefine the external reference owner model.
- Records without read access must be omitted rather than partially disclosed.
- `GET /api/message` must enforce the same scope visibility checks as `GET /api/messages`, so message-linked coordination jumps do not bypass access policy.
- `GET /api/relays` and `GET /api/handoffs` must filter by the selected readable scope so cutover diagnostics stay on the shared contract and do not require direct store inspection.
- `GET /api/activity` must summarize only readable channel and direct-conversation activity for the requested actor and workspace, so recent navigation never becomes an access-policy bypass.
- `POST /api/relays` and `POST /api/handoffs` must enforce the same scope policy as the rest of the service so coordination records do not bypass METABASE-backed visibility or write rules.
- Relay and handoff records may carry `messageId` links so the client can jump back into the related conversation context without inventing a second activity model.
- `POST /api/adapters/discord/events` must persist a relay record for every accepted Discord ingress event so cutover diagnostics survive service restarts and importer reruns.
- `POST /api/adapters/discord/events` may also carry an optional `handoff` object with `toIdentityId`, `rationale`, and optional `fromIdentityId`; when present, the service must persist a handoff record in the mapped NEXUS scope alongside the ingested message.
- Adapter payloads may contain external transport identifiers but must map into internal NEXUS objects before persistence.
- External references never redefine the owning object; they link outward and may also be used for reverse lookup into readable linked NEXUS context.
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
