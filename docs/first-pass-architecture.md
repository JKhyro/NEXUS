# NEXUS First-Pass Architecture

## Product decision

`NEXUS` is the in-house communications and coordination product for internal humans, Symbiotes, Curators, collectors, and system services.

`Discord` is a temporary adapter during migration, not the long-term operating surface.

## Naming stack

- Product: `NEXUS`
- Database estate: `LIBRARY`
- Communications/event record layer: `CHATBASE`
- Metadata, registry, and policy layer: `METABASE`

## MVP boundary

The first executable MVP is:

- desktop-first
- local-first
- internal-only
- communications-core only
- designed for tight early coupling with `ANVIL`

The MVP must support:

- workspaces
- channels
- direct conversations
- forum-style posts
- threads
- attachments
- searchable history
- relays and handoffs
- external references

The MVP explicitly defers:

- live presence
- typing indicators
- notification systems
- unread state
- native workflow/task ownership

## Client and service model

The MVP runs as a desktop app that manages a local NEXUS service on the workstation.

That local service is the MVP authority for conversation state and policy evaluation. Future hosted and web deployments must reuse the same domain model and service contract rather than fork a separate backend model.

This creates three aligned surfaces:

- desktop shell
- shared NEXUS service contract
- web smoke surface that proves the same contract can back a future web client

The same shared service must also be able to run in a hosted-capable mode later, with explicit host/origin/runtime configuration, without forking the local-first model into a different backend.

## Product ownership boundary

NEXUS owns:

- conversation semantics
- channel and workspace definitions
- policy and access control
- message composition and retention flow
- cross-channel relays and handoffs
- direct conversations and specialist/private lanes
- shared internal coordination spaces
- durable external references to workflow systems

NEXUS does not own, in the MVP:

- task and project execution objects
- issue lifecycle
- workflow board semantics

Those stay outside the MVP product core even though NEXUS must integrate with them.

## Identity and permissions

NEXUS treats identities as first-class internal actors.

Initial identity classes:

- human
- symbiote
- curator
- collector
- system-service

Permissions must be evaluated above retained storage. A message existing in storage is not itself permission to read it.

## LIBRARY data substrates

NEXUS is built over `LIBRARY`, not beside it.

### CHATBASE

`CHATBASE` is the retained communications and event record.

It holds:

- posts
- threads
- messages
- attachments
- relays
- handoffs
- message events
- adapter ingest events

### METABASE

`METABASE` is the policy and registry layer.

It holds:

- workspaces
- channels
- roles
- identities
- memberships
- visibility rules
- access rules
- adapter mappings
- external references
- retention metadata

## ANVIL boundary

`ANVIL` is the intended workflow and project peer for NEXUS.

The first NEXUS MVP must include durable external-reference slots so messages, posts, channels, and conversations can point into ANVIL immediately when the integration is ready.

This means NEXUS must not hardcode GitHub semantics into its product model. GitHub can remain development tracking infrastructure during implementation, but `ANVIL` is the long-term workflow peer.

## Discord migration direction

The first usable cutover should not be a 1:1 Discord mirror.

Instead:

- rebuild the internal channel model from scratch in NEXUS
- stand up both private and shared internal spaces together
- let Discord degrade into an adapter surface during transition

The rebuilt internal spaces should include:

- private operator and specialist lanes
- shared workflow and request lanes
- report and forum lanes
- library and curator lanes
- governance and council spaces
- general low-sensitivity discussion spaces

## Initial implementation goal

The first implementation pass should produce:

- a concrete local service skeleton
- a desktop shell that manages that service
- a web smoke surface on the same contract
- bootstrap configuration for internal spaces
- explicit contracts for CHATBASE, METABASE, Discord adapter ingress, and ANVIL references
