# NEXUS Runtime Topology

## Purpose

This record defines the first concrete packaging and runtime split for NEXUS issue `#57`.

The goal is to make the native-C-first target explicit without pretending the current Electron and Node baseline has already been replaced.

This topology is governed by the bounded [architecture contract](architecture-contract.md) and the [runtime container interface](runtime-container-interface.md), including the rule that NEXUS is a container interface for multiple component programs and that C++ is allowed only for narrowly justified component internals hidden behind a Native C facade.

## Topology decision

The target desktop stack is a four-part system:

1. `nexus-runtime-core`
   Native C runtime that owns long-lived process supervision, activation, failure isolation, and interop-safe runtime state.
2. `nexus-host-avalonia`
   Avalonia desktop shell that owns windows, rendering, input, accessibility, and operator-visible diagnostics.
3. `nexus-surface-packages`
   Versioned packages for channel, forum, thread, timeline, and direct-surface variants that the host can load and route.
4. `nexus-helper-packages`
   Imported helper programs attached to surface hosts through explicit capability metadata and registry ownership, not by implicit process co-ownership.

The current Electron shell and Node-managed service remain the continuity baseline and migration source.

The target stack is not a C++ desktop rewrite. Native C owns runtime and interop responsibilities, Avalonia owns the desktop host, C# remains thin host glue, and surface/helper programs are loaded as explicit components through package metadata.

## Ownership split

### Native runtime core

Native C owns:

- process lifetime for the primary runtime
- helper activation and termination
- crash isolation boundaries
- interop-safe command routing
- package loading and version compatibility checks
- persistent runtime state that must outlive any one UI window

Native C does not own:

- desktop window chrome
- Avalonia view composition
- presentation-only helper styling
- operator copy that belongs to PRISM or other external style authorities
- C++ object models or private allocator lifetimes at the public host boundary

### Avalonia host

Avalonia owns:

- desktop windows and navigation chrome
- rendering of NEXUS conversation surfaces
- input dispatch and accessibility hooks
- operator diagnostics, health, and recovery affordances
- layout composition for embedded helper surfaces

Avalonia does not own:

- helper runtime identity
- long-lived native process supervision
- registry truth for imported helper packages
- runtime policy hidden in C# glue

### Registry and external authorities

`SYMBIOSIS` and `SYNAPSE` remain the ownership surfaces for helper identity, package metadata, capability declarations, and approval state.

NEXUS renders and hosts imported helper surfaces, but it must not absorb their runtime authority or rewrite their registry identity.

## Packaging units

NEXUS package loading treats the product as a container for component programs. Surface packages are NEXUS-owned route-local programs. Helper packages are imported or adjacent programs with source-runtime identity and explicit slot permissions. Runtime components provide supervision and activation services but do not become presentation owners.

### Surface package

Every conversation surface package should declare:

- `packageId`
- `surfaceKind` as one of `channel`, `forum`, `thread`, `timeline`, or `direct`
- `abiVersion`
- required host capabilities
- optional helper embedding slots
- native entrypoint symbol

Example:

```json
{
  "packageId": "nexus.surface.thread",
  "surfaceKind": "thread",
  "abiVersion": "1",
  "hostCapabilities": [
    "conversation.read",
    "message.compose",
    "coordination.focus"
  ],
  "helperSlots": [
    {
      "slotId": "thread-sidebar",
      "allowedKinds": ["inspector", "review-helper"]
    }
  ],
  "entrypoint": {
    "runtime": "native-c",
    "symbol": "nexus_surface_thread_bootstrap"
  }
}
```

### Helper package

Every imported helper package should declare:

- source runtime identity
- package version
- declared capabilities
- preferred hosting mode
- failure policy
- UI presentation hooks approved for NEXUS rendering

Example:

```json
{
  "packageId": "symbiosis.helper.review",
  "version": "1.0.0",
  "sourceRuntime": "SYMBIOSIS",
  "hostingMode": "child-process",
  "failurePolicy": "restartable",
  "capabilities": [
    "message.inspect",
    "coordination.suggest"
  ]
}
```

## Interop contract

The interop boundary between Avalonia and the native runtime should stay C-first and versioned.

Required calls:

- `nexus_runtime_start(config_json)` -> runtime handle or error
- `nexus_runtime_open_surface(runtime, surface_request_json)` -> surface handle or error
- `nexus_runtime_dispatch(runtime, surface, command_json)` -> result payload or error
- `nexus_runtime_subscribe(runtime, callback)` -> event stream registration
- `nexus_runtime_stop(runtime)` -> orderly shutdown result

### Expected inputs and outputs

Inputs:

- JSON or flat C-ABI-safe structs carrying package identifiers, actor identity, workspace/scope route, and capability requests

Outputs:

- stable handles
- structured result payloads
- explicit error codes
- event envelopes for lifecycle and recovery signals

### Error behavior

The boundary must return stable machine-readable codes for:

- incompatible ABI version
- missing package
- denied capability
- helper activation failure
- helper crash
- host/runtime handshake timeout

Helper failure must degrade the affected slot or surface without taking down the whole runtime.

## Failure isolation

Failure rules:

- one helper process crash must not kill the native runtime core
- one surface-package failure must not corrupt unrelated surface state
- the Avalonia host must be able to show recovery UI even when a helper slot fails
- the runtime core must be able to reject an incompatible package before it becomes operator-visible

## Migration from the current baseline

Migration order:

1. preserve the current Electron and Node baseline as the verified continuity source
2. extract package and capability metadata that can be shared with the future target stack
3. stand up the native runtime core as the new long-lived supervisor
4. introduce the Avalonia host against the same package and capability model
5. retire Electron only after the native runtime plus Avalonia host can cover the verified continuity responsibilities

The target stack is therefore explicit, but the current mainline baseline remains the source of truth for operator continuity until those migration steps land.

## Current concrete follow-ons

- [runtime-package-manifests.md](runtime-package-manifests.md) pins the first concrete surface-package and helper-package manifest shapes against this topology.
- [runtime-container-interface.md](runtime-container-interface.md) names the runtime container contract for route-local surface programs and helper slots.
- [runtime-first-migration-seam.md](runtime-first-migration-seam.md) chooses the first replacement seam away from Electron without breaking the verified continuity baseline.
- [conversation-surface-program-model.md](conversation-surface-program-model.md) activates the first child-program model for channel, forum, thread, timeline, and direct surfaces against those manifest contracts.
