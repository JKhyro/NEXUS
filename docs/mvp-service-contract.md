# NEXUS MVP Service Contract

## Purpose

The NEXUS MVP service is the local authority for communication state, access evaluation, adapter normalization, and external references.

It is intentionally small and internal-first. The contract is designed to power both the desktop shell and a future web client without changing the underlying model.

## Service shape

- Protocol: HTTP + JSON
- Authority: local workstation service in the MVP
- Persistence: local CHATBASE and METABASE scaffolds
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

- Adapter payloads may contain external transport identifiers but must map into internal NEXUS objects before persistence.
- External references never redefine the owning object; they only link outward.
- All persisted messages generate message events in CHATBASE.
- Attachments are first-class metadata records attached to messages.

## MVP non-goals

- websocket delivery
- live presence
- background notifications
- task ownership
- workflow board ownership
