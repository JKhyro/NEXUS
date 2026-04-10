# NEXUS Architecture Contract

## Purpose

This contract bounds issue `#57` architecture alignment.

NEXUS is a container interface for multiple component programs. It hosts conversation surfaces and approved helper programs without absorbing their runtime identity, package ownership, or registry authority.

This contract also pins the language boundary for the target desktop direction: Native C is the runtime and interop default, Avalonia is the desktop host, C# is minimal host glue, and C++ is permitted only where there is no narrower production-quality option.

## Architectural invariant

NEXUS must stay a host/container, not a monolithic application that rewrites every component into one runtime.

The stable system shape is:

1. a Native C runtime core owns supervision, package activation, failure isolation, lifecycle state, and the C ABI boundary
2. an Avalonia host owns windows, rendering, input, accessibility, and operator-visible recovery
3. minimal C# glue connects Avalonia host events to the Native C interop boundary
4. surface programs implement NEXUS route-local conversation experiences
5. helper programs remain owned by their source runtime and are embedded only through approved package metadata, capability declarations, and slot contracts

## Language and runtime rules

### Native C

Native C is the default implementation language for:

- long-lived runtime supervision
- package and manifest validation
- capability checks
- helper activation, termination, and restart policy
- runtime event envelopes
- the versioned interop ABI consumed by the desktop host

Native C also owns the outward ABI even when an implementation detail behind the ABI is not written in C.

### Avalonia and C#

Avalonia is the target desktop host where a managed desktop shell is still useful.

C# must stay thin and host-facing. It may own:

- Avalonia application bootstrap
- window and route wiring
- accessibility and input dispatch into the host surface
- conversion between host events and the Native C ABI calls
- operator-visible diagnostics and recovery affordances

C# must not become the owner of:

- package registry truth
- helper identity
- long-lived process supervision
- compatibility policy
- NEXUS domain semantics that belong in the runtime/service contract

### C++

C++ is not a default NEXUS architecture language.

C++ may be introduced only when all of these are true:

- the need is bounded to a concrete component, adapter, or platform/vendor integration
- a C implementation or existing C ABI is not viable for the production requirement
- the C++ code is hidden behind the same Native C ABI or a narrower private C facade
- no C++ standard library, exception, RTTI, template, ownership, allocator, or object-lifetime type crosses the runtime interop boundary
- build, packaging, crash, and diagnostic behavior can be isolated from the rest of the runtime

C++ must not be used for:

- conversation-domain modeling
- package manifest semantics
- NEXUS route or surface identity
- Avalonia presentation glue
- helper ownership policy
- public interop contracts

If C++ is required for a component, the component contract must document why Native C is insufficient, the C facade it exposes, its failure isolation boundary, and the removal or replacement path if a C-native option becomes available.

## Container interface contract

NEXUS hosts component programs through explicit contracts.

The concrete runtime container interface is defined in [runtime-container-interface.md](runtime-container-interface.md).

Every component program must have:

- stable package identity
- source runtime identity when imported from another system
- declared capabilities
- compatible ABI or host protocol version
- lifecycle policy
- failure policy
- operator-visible diagnostic envelope

NEXUS may provide:

- route resolution
- surface slots
- helper slots
- capability mediation
- rendering frame and host affordances
- recovery and degraded-state presentation

NEXUS must not provide by implication:

- foreign package ownership
- source-runtime identity rewriting
- silent capability widening
- cross-component shared mutable state
- host-only placement rules as a substitute for manifest compatibility

## Component program families

### Surface programs

Surface programs are NEXUS-owned route-local programs for channels, forums, threads, timelines, and direct conversations.

They bind to the current actor, workspace, route, package manifest, approved host capabilities, and optional helper slots. A surface program failure must not corrupt unrelated route state.

### Helper programs

Helper programs are imported or adjacent programs that NEXUS embeds into approved slots.

They remain attributable to their source runtime, such as `SYMBIOSIS`, and must declare their capabilities, slot targets, hosting mode, and failure behavior before activation. A helper failure must degrade the affected slot, not the whole NEXUS route.

### Runtime components

Runtime components provide supervision, activation, manifest validation, diagnostics, and lifecycle events.

They are not presentation components. They expose stable Native C interop contracts and must keep failure behavior explicit and machine-readable.

## Interop rule

The desktop host talks to the runtime through a versioned Native C boundary.

Interop payloads may use JSON or flat C-ABI-safe structs for route, actor, package, command, and event data. Public interop contracts must return explicit handles, structured payloads, and stable error codes.

No component may require Avalonia or C# callers to understand C++ object identity, ownership, exceptions, allocator rules, templates, or private runtime memory.

## Compatibility and migration

The current Electron shell and Node-managed service remain the continuity baseline until replacement work lands in production code.

Migration must preserve:

- the current operator-visible service contract while the Native C runtime is introduced behind it
- package and capability manifests as the compatibility source for future surface and helper activation
- explicit failure diagnostics across runtime, host, surface, and helper boundaries
- a later Avalonia host swap that consumes the same Native C interop contract instead of inventing a second runtime authority

This contract narrows the long-term target without claiming that the current repository already contains the target runtime or Avalonia host.
