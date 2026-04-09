# NEXUS Conversation-Surface Program Model

## Purpose

This record activates issue `#56` against the merged topology and manifest-contract work from issue `#57`.

The goal is to define how channel, forum, thread, timeline, and direct surfaces behave as route-local child programs while still preserving explicit ownership for imported helpers.

## Program model

Every readable NEXUS route resolves to one surface-program instance.

Each surface program:

- owns route-local presentation and interaction state
- binds to one selected surface package
- requests explicit helper slots from the runtime
- renders imported helpers without absorbing their runtime identity

Imported helpers are hosted inside surface programs, but their ownership remains attributable to the source runtime and registry package.

## Surface families

### Channel surface

- route scope: workspace channel
- primary records: channel messages, relay badges, handoff context
- default helper slots: right-rail inspector, composer assist

### Forum surface

- route scope: forum lane with post list plus selected post context
- primary records: posts, post-level coordination, forum routing metadata
- default helper slots: lane insights, post-triage assist

### Thread surface

- route scope: focused thread under a channel or forum post
- primary records: thread messages, coordination focus, external references
- default helper slots: thread sidebar, inline advisory

### Timeline surface

- route scope: cross-scope readable feed
- primary records: recent activity, cross-scope references, unread summaries
- default helper slots: filter assistant, review queue

### Direct surface

- route scope: direct conversation between internal identities
- primary records: direct messages, participant metadata, handoff context
- default helper slots: participant card, context suggestion rail

## Activation envelope

Every surface program should be activatable from a route envelope with:

- `actorId`
- `workspaceId`
- `surfaceKind`
- `scopeId`
- `selectedMessageId` when present
- `surfacePackageId`
- `routeCapabilities`
- `helperSlotRequests`

### Expected inputs

- the resolved route
- approved surface package metadata
- approved helper-package metadata for any requested slots
- host/runtime capability set for the current desktop session

### Expected outputs

- a surface handle bound to the selected route
- reserved helper slots with explicit allowed capabilities
- route-local diagnostics that can stay visible even when one helper fails

### Error behavior

The runtime or host should reject activation when:

- the selected surface package does not match the route kind
- the route requests capabilities the host did not approve
- a helper slot is requested with incompatible helper-package metadata
- the route is readable but no compatible surface package exists

Helper-slot failure must degrade the slot, not the whole route.

## Ownership and visibility rules

- helper presentation must show source runtime identity and package identity explicitly
- helper failures must remain visible as slot-local state instead of being hidden behind generic route errors
- NEXUS may provide the outward host frame, but it does not rewrite helper ownership
- PRISM remains the authority for helper-facing presentation tone; NEXUS renders the approved presentation hooks only

## Compatibility and versioning

- surface-program activation should stay compatible with the merged manifest contracts in [runtime-package-manifests.md](runtime-package-manifests.md)
- route envelopes should be additive so the continuity baseline can evolve without invalidating earlier package metadata
- helper slot declarations must stay capability-based rather than depending on UI-only placement rules

## Example route envelope

```json
{
  "actorId": "identity-jack",
  "workspaceId": "workspace-internal",
  "surfaceKind": "thread",
  "scopeId": "thread-roadmap-71",
  "selectedMessageId": "msg-001",
  "surfacePackageId": "nexus.surface.thread",
  "routeCapabilities": [
    "conversation.read",
    "message.compose",
    "coordination.focus"
  ],
  "helperSlotRequests": [
    {
      "slotId": "thread-sidebar",
      "preferredHelperPackageId": "symbiosis.helper.review"
    }
  ]
}
```

## Immediate follow-on

The next implementation-facing step is to bind this route envelope and slot model back into the first supervisor seam in [runtime-first-migration-seam.md](runtime-first-migration-seam.md) so the future runtime can activate surface programs without inheriting Electron-specific lifecycle ownership.
