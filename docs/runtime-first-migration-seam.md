# NEXUS First Runtime Migration Seam

## Purpose

This record chooses the first concrete migration seam for issue `#57` after the topology and manifest contracts are both merged.

The goal is to move one high-value runtime boundary out of the current Electron and Node baseline without breaking the verified operator continuity surface already shipped on `main`.

## Seam decision

The first seam should replace runtime supervision and package activation before it replaces the desktop host.

That means the first migration pass keeps:

- the Electron desktop shell in `apps/desktop`
- the current web client in `apps/web/public`
- the current HTTP operator contract exposed by `apps/service/src/server.mjs`

And it introduces a native-runtime boundary behind that existing service/API surface for:

- manifest validation
- surface-package activation
- helper-package activation and restart policy
- long-lived runtime state that should outlive any one desktop window
- runtime lifecycle and failure events that the current health/pulse surfaces can expose

## Why this seam is first

This seam is the lowest-risk way to validate the native-runtime direction because it preserves the already verified operator-facing desktop path while moving the most architecture-critical ownership out of the temporary Node baseline.

It is first because it:

- keeps the shipped Electron window and current routeable client readable while the runtime changes under it
- lets the future native runtime own the package/manifest contract immediately, which is where the new topology work is concentrated
- avoids mixing two disruptive changes at once by postponing the Avalonia host swap until the runtime core is proven against the current UI
- preserves most of the existing automated checks because the HTTP contract and static client surface stay intact for the transition

## Ownership split during the seam

### What stays where it is

`apps/desktop/src/main.mjs` continues to:

- launch the operator-visible desktop window
- surface startup failure UI
- manage the top-level app lifecycle for the continuity baseline

`apps/service/src/server.mjs` continues to:

- serve the current static web client
- preserve the current HTTP API contract during the transition
- translate existing operator requests into runtime-core calls

### What moves first

The new native runtime core becomes the owner of:

- manifest loading and compatibility validation
- package activation handles for surface and helper packages
- crash isolation and restart policy for helper packages
- runtime capability checks
- durable runtime supervision state

## Transitional interface contract

During this seam, the Node service acts as a transition adapter rather than the long-term owner of package/runtime semantics.

Required transition behavior:

1. current browser and Electron clients still talk to the same HTTP API shape
2. the Node service delegates surface/helper activation work to the native runtime core
3. runtime failures are translated into the existing readable health and startup-failure surfaces
4. the service keeps enough compatibility shims to avoid breaking the verified continuity baseline while the runtime core grows underneath it

### Expected inputs

- the selected route and surface-package identifier
- actor/workspace/scope context already carried by the current service contract
- manifest and capability metadata for the selected surface and helper packages
- runtime lifecycle requests such as start, open surface, dispatch command, and stop

### Expected outputs

- the same operator-visible HTTP responses the current desktop and web surfaces already expect
- runtime-health summaries that can appear in `/api/health` and `Project Pulse`
- machine-readable failure codes from the runtime core that the transition adapter can turn into stable operator diagnostics

### Error behavior

The seam must fail safely when:

- a selected surface package fails manifest validation
- a helper package is incompatible with the chosen surface package
- the runtime core cannot start within the current managed-service startup window
- the runtime core crashes after activation

In those cases:

- Electron must still be able to show the current startup failure dialog
- the HTTP health surface must still explain the degraded state
- one failed helper must not take down unrelated surfaces

## Compatibility and versioning

- the HTTP contract remains the compatibility anchor for the current UI during this seam
- runtime-core calls must stay versioned independently from the operator HTTP contract
- manifest `manifestVersion` and `abiVersion` stay authoritative for package compatibility; the transition adapter must not weaken them

## Exit criteria for the seam

This seam is complete when:

- the native runtime core owns manifest validation and package activation in production code
- the current Electron/web operator surface can run against that runtime without contract regressions
- health and failure signals from the runtime core are visible through the existing operator diagnostics
- the next host-side migration, including the Avalonia transition and issue `#56` program-model work, can build against a real runtime owner instead of the temporary Node baseline
