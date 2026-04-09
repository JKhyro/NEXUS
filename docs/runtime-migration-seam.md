# NEXUS First Runtime Migration Seam

## Purpose

This record chooses the first replacement seam after the merged `#57` topology and manifest-contract slices.

The goal is to move one real Electron-owned responsibility toward the future native runtime core without breaking the verified continuity baseline that already ships today.

## Decision

The first replacement seam is the managed service lifecycle currently owned by `apps/desktop/src/service-runtime.mjs`.

That seam is the narrowest place where NEXUS can start moving toward a native-C-first runtime while keeping the current desktop shell and the current localhost service/API contract stable.

## Why this seam goes first

- the continuity baseline already isolates service launch, readiness probing, reuse, log capture, and shutdown behind one desktop module
- moving runtime supervision before renderer replacement matches the approved direction better than replacing the UI host first
- the current `/api/health` contract, runtime logs, and startup-failure affordances are already verified and operator-visible
- the same seam can later serve an Avalonia host instead of the current Electron shell without redefining package ownership again

## Current continuity responsibilities

The current desktop shell owns:

- Node binary resolution
- local service spawn and reuse
- readiness polling through `/api/health`
- runtime stdout/stderr capture into a desktop-owned log file
- user-facing startup failure formatting
- owned-child shutdown on app quit

The current continuity source lives in:

- `apps/desktop/src/service-runtime.mjs`
- `apps/desktop/src/main.mjs`

## Target split

### Native runtime core owns

- service process supervision
- restart and backoff policy
- readiness and health-state tracking
- runtime log file ownership
- startup envelope validation
- stable machine-readable runtime failure codes

### Continuity desktop host owns

- window creation and lifecycle
- rendering the current web surface URL
- user-facing diagnostics and recovery actions
- deciding whether to attach to an already-healthy local runtime

The host stays presentation-focused while the runtime core becomes the long-lived supervisor.

## Interface contract

The first supervisor boundary should expose a versioned C-first contract shaped roughly like:

- `nexus_supervisor_start(startup_json)` -> supervisor handle or error
- `nexus_supervisor_status(handle)` -> readiness and health payload
- `nexus_supervisor_attach_or_launch(handle, route_json)` -> attach result or launch result
- `nexus_supervisor_stop(handle)` -> orderly shutdown result

### Expected inputs

- startup configuration for host, port, storage mode, and log destination
- continuity-era launch metadata for the current Node service entrypoint
- route/bootstrap metadata for the desktop host to attach to the local runtime

### Expected outputs

- stable supervisor handle or machine-readable error
- readiness state compatible with the current `/api/health` behavior
- explicit launch metadata the host can use for diagnostics
- shutdown result that distinguishes already-stopped, stopped-cleanly, and timed-out cases

### Error behavior

The supervisor boundary must return stable codes for:

- missing runtime binary
- startup timeout
- early child exit
- health probe failure
- port collision without healthy reuse
- log-path creation failure

One launch failure must not force a renderer-contract rewrite; the host should still be able to present the same failure surface operators already use today.

### Compatibility and versioning

- the first migration seam must preserve the current localhost HTTP contract and the current readiness semantics
- the seam may launch the existing Node service first; it does not require the native runtime to replace the service implementation immediately
- the same supervisor contract should be reusable by a later Avalonia host without reintroducing Electron-specific process assumptions

## Migration order

1. preserve the current Electron plus Node baseline as the continuity source
2. extract a stable supervisor startup/status contract from the current desktop service-runtime behavior
3. implement a native supervisor that can launch the current Node service entrypoint first
4. switch the desktop host to that supervisor boundary while keeping the same operator-visible health and failure affordances
5. replace the UI host only after the supervisor seam is stable

## Immediate follow-on

The next record against this seam is [conversation-surface-program-model.md](conversation-surface-program-model.md), which defines how route-local surface programs and imported helper slots should sit on top of the merged manifest contracts.
