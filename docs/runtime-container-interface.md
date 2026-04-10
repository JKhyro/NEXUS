# NEXUS Runtime Container Interface

## Purpose

This record makes the NEXUS container model explicit for issue `#57`.

NEXUS is the host interface for multiple component programs. It is not a single monolithic program that absorbs every surface, helper, and external runtime into one ownership model.

## Interface contract

The runtime container has three public responsibilities:

- resolve a route into one approved surface program
- reserve approved helper slots for that surface program
- supervise component lifecycle, failures, and diagnostics through the Native C runtime boundary

The public runtime boundary must stay Native C first. Avalonia consumes that boundary as the desktop host. C# is limited to Avalonia hosting and thin glue. C++ is allowed only inside isolated component internals when Native C is not viable, and it must stay hidden behind a Native C facade.

## Expected inputs

Container activation accepts:

- actor identity
- workspace identity
- route scope and surface kind
- selected surface package identity
- declared route capabilities
- optional helper slot requests
- manifest and ABI versions

Inputs may be JSON envelopes or flat C-ABI-safe structs. They must not require callers to understand C++ object identity, allocator rules, exceptions, RTTI, templates, or private runtime memory.

## Expected outputs

The container returns:

- stable runtime, surface, and helper handles
- structured activation results
- helper-slot reservation or degradation state
- lifecycle and recovery event envelopes
- explicit machine-readable error codes

Avalonia may render those outputs, but it does not become the runtime authority.

## Error behavior

The container must reject activation before operator-visible mounting when:

- the surface package is missing
- `surfaceKind` is unsupported
- `entrypoint.runtime` is not `native-c`
- ABI or manifest versions are incompatible
- required capabilities are denied
- requested helper slots are undeclared
- helper packages target the wrong surface or slot
- a component fails its startup or health handshake

Failure isolation rules:

- one helper crash degrades that helper slot
- one surface failure degrades that route-local surface
- runtime supervisor failure is visible through health and recovery diagnostics
- unrelated routes and helpers must not be corrupted by a single component failure

## Compatibility and versioning

- `manifestVersion` governs package-manifest shape.
- `abiVersion` governs the Native C runtime boundary.
- host/runtime compatibility is declared through package metadata such as `nexus-host-avalonia@1` and `nexus-runtime-core@1`.
- package upgrades must not silently widen capabilities or cross ownership boundaries.

The current Electron and Node implementation remains a continuity baseline only. The migration path must keep the HTTP/operator surface usable while moving runtime ownership under this container interface.

## Example usage

```json
{
  "actorId": "identity-jack",
  "workspaceId": "workspace-internal-core",
  "surfaceKind": "timeline",
  "scopeId": "timeline-internal-core",
  "surfacePackageId": "nexus.surface.timeline",
  "routeCapabilities": [
    "conversation.read",
    "coordination.focus",
    "route.selection"
  ],
  "helperSlotRequests": [
    {
      "slotId": "timeline-filter",
      "preferredHelperPackageId": "symbiosis.helper.review"
    }
  ]
}
```

The expected result is a route-local timeline surface handle, a reserved or bound `timeline-filter` helper slot, and runtime events that explain any degraded component without collapsing the whole NEXUS container.
