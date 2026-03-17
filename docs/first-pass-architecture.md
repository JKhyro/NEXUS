# NEXUS First-Pass Architecture

## Product decision

`NEXUS` is the future in-house communications and coordination product for humans, Symbiotes, Curators, and supporting systems.

`Discord` is now treated as a temporary external transport, not the long-term operating surface.

## Naming stack

- Product: `NEXUS`
- Database estate: `LIBRARY`
- Communications/event record layer: `CHATBASE`
- Metadata, registry, and policy layer: `METABASE`

## Client model

`NEXUS` should support two first-class clients from the beginning:

- Web UI
  - browser-accessible interface for hosted use, remote access, and lightweight operator/admin workflows
- Desktop UI
  - richer local client for operators and systems work
  - should be able to connect to either:
    - a remote hosted `NEXUS` service
    - a local `NEXUS` service on the workstation

The web UI and desktop UI should use the same domain model, permissions model, and API contract. The desktop client may add local cache, background service, offline queueing, or deeper system integration, but it should not fork the underlying product model.

## Core architecture

### 1. NEXUS clients

- Web client
- Desktop client
- Future system/agent clients through the same service boundary

### 2. NEXUS application layer

This is the product control plane and conversation/work coordination layer. It should own:

- workspaces
- channels
- posts / threads / forum-style reports
- direct conversations
- identity presence
- message composition and delivery
- cross-channel relays
- handoffs
- notification rules
- project/task linkage

### 3. Identity and permissions layer

`NEXUS` must treat humans and systems as first-class identities.

Identity classes should include at minimum:

- human
- symbiote
- curator
- collector / connector
- system service

Permissions must be policy-driven and must not be bypassed just because a message exists in storage.

### 4. LIBRARY data substrates

`NEXUS` should be built on `LIBRARY`, not beside it.

#### CHATBASE

`CHATBASE` should remain the retained communications and event record.

It should store:

- messages
- edits
- deletions
- posts
- threads
- attachments
- relays
- handoffs
- delivery events
- adapter ingest events

But `CHATBASE` should not itself become the authority for who may read everything. It is a record layer, not the full permissions engine.

#### METABASE

`METABASE` should hold the policy and registry layer for `NEXUS`, including:

- workspace definitions
- channel definitions
- channel kinds
- identity registry
- role registry
- visibility rules
- access rules
- adapter mappings
- product instruction references
- retention and archival policy

`METABASE` should be the canonical place for defining what a channel is for, who can see it, and how adapters map into it.

## Required domain objects

The first-pass product model should include:

- workspace
- channel
- thread / post
- direct conversation
- identity
- role
- membership
- message
- message event
- attachment
- relay
- handoff
- task / request reference
- external reference
- adapter endpoint

## Transport/adapters strategy

`Discord`, `GitHub`, email, and future services should be treated as adapters at the edge.

The correct direction is:

- external system emits or receives
- adapter translates
- `NEXUS` owns conversation/workflow semantics
- `CHATBASE` retains the event record

This keeps the product stable even when external services change rules, restrict APIs, or become undesirable.

### Immediate adapter principle

Do not let adapter behavior define the product model.

The product model should define:

- allowed channel kinds
- relay policy
- identity roles
- permissions
- project/work linkage

Then adapters should conform to that model as much as possible.

## Access-control rule

`CHATBASE` must not become a backdoor around private discussions.

Long-term rule:

- storage may retain more than a given identity may read
- access policy must be enforced above the raw retained record
- curators may have broader or full access only if policy explicitly grants it

This preserves governance while still allowing ingestion and auditability.

## Why NEXUS replaces Discord

Discord is useful as a bootstrap transport, but it is not the correct permanent surface because:

- permissions and data control are external
- product semantics are constrained by Discord's channel model
- integrations are partial and adapter-shaped
- local-system workflows are awkward
- human/system/project coordination cannot be modeled cleanly enough

`NEXUS` should become the native place where:

- humans coordinate
- Symbiotes and Curators operate
- systems report and route work
- projects and discussions stay linked
- messages and records remain governed under `LIBRARY`

## First rollout phases

### Phase 0: Architecture and naming

- lock `NEXUS` as the product name
- document the product boundary
- seed `ROADMAP`, `NEXUS`, and `LIBRARY`

### Phase 1: Service skeleton

- define backend service boundaries
- define the first `NEXUS` API contract
- define workspace/channel/identity/message schemas
- define `CHATBASE` and `METABASE` responsibilities precisely

### Phase 2: Internal MVP

- create a minimal web UI
- create a minimal desktop UI
- support channels, direct conversations, posts, and basic presence
- write all product traffic into `CHATBASE`

### Phase 3: Hybrid operation

- keep Discord as an adapter
- mirror selected Discord lanes into `NEXUS`
- begin routing real work through `NEXUS` first where possible

### Phase 4: Migration

- move primary human/system coordination into `NEXUS`
- reduce Discord to adapter-only or remove it entirely where no longer needed

## Immediate planning implications

Future threads should assume:

- `NEXUS` is the long-term communications product
- `LIBRARY` remains the data estate beneath it
- `CHATBASE` is the retained communications substrate
- `METABASE` is the policy and registry substrate
- both desktop and web clients are required
- Discord replacement is a deliberate roadmap item, not an abstract someday idea
