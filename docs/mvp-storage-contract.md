# NEXUS MVP CHATBASE and METABASE Storage Contract

## Purpose

The MVP preserves the long-term separation between communication records and policy/registry data regardless of the backing store.

The important rule is structural, not just technical:

- `CHATBASE` stores retained communication history
- `METABASE` stores policy, registry, and mapping definitions
- access is enforced above both, not implied by either

## CHATBASE responsibilities

CHATBASE is the retained event record for communication activity.

It stores:

- posts
- threads
- messages
- attachments
- relays
- handoffs
- message events

Every write into conversation space should result in:

- a retained object
- a corresponding event entry

CHATBASE may contain records that a given actor is not allowed to read directly. Readability is determined by policy evaluation, not by raw storage presence.

## METABASE responsibilities

METABASE is the registry and policy substrate for NEXUS.

It stores:

- roles
- identities
- workspaces
- channels
- memberships
- direct-conversation membership state
- adapter endpoints and mappings
- external references

METABASE defines:

- what a channel is
- who may read or write it
- how external systems map into it
- how internal identities are classified

## Access evaluation rule

Reads must be evaluated like this:

1. resolve the scope being requested
2. determine the underlying channel, post, thread, or direct conversation
3. evaluate actor access using METABASE rules
4. only then return CHATBASE records

This prevents retained history from becoming a backdoor around private spaces.

## MVP persistence modes

The executable scaffold now supports two storage modes behind the same service contract:

- `json`
  Local bootstrap/runtime persistence in:
  - `runtime/metabase.json`
  - `runtime/chatbase.json`
- `library-postgres`
  LIBRARY-backed persistence using dedicated NEXUS schemas:
  - `nexus_metabase`
  - `nexus_chatbase`

JSON is an implementation convenience for bootstrap and local smoke work. It is not the product-level storage decision.

The `library-postgres` mode stores NEXUS-native records in LIBRARY without changing:

- entity names
- access policy
- adapter mapping shape
- ANVIL external-reference behavior

## Current migration direction

The active migration path is to move from JSON bootstrap scaffolds to LIBRARY-backed persistence without changing:

- service contracts
- identity model
- access model
- adapter shape
- external-reference model

The remaining work is verification and hardening against the live LIBRARY Postgres environment, not redesign of the contract.
