# NEXUS MVP CHATBASE and METABASE Storage Contract

## Purpose

The MVP uses simple local persistence to make the service executable now, while preserving the long-term separation between communication records and policy/registry data.

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

## MVP persistence choice

The first implementation pass may use local JSON-backed scaffolds for:

- `runtime/metabase.json`
- `runtime/chatbase.json`

That is an implementation convenience, not a product-level naming decision. The product model remains CHATBASE/METABASE even when the persistence backend changes later.

## Migration direction

The long-term backend can replace local JSON scaffolds with richer LIBRARY-backed persistence without changing:

- service contracts
- identity model
- access model
- adapter shape
- external-reference model
