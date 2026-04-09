# NEXUS Runtime Package Manifests

## Purpose

This record turns the `#57` topology split into concrete package-manifest shapes that future runtime work can implement without reopening the topology decision.

These manifests are packaging contracts, not a claim that the native runtime is already landed.

## Interface contract

Two manifest families exist in the first pass:

1. surface-package manifests
2. helper-package manifests

Both families are JSON documents owned by external package producers and validated by the future native runtime core before activation.

## Surface-package manifest

Required fields:

- `packageId`
- `displayName`
- `surfaceKind`
- `manifestVersion`
- `abiVersion`
- `entrypoint`
- `hostCapabilities`
- `routing`
- `failurePolicy`

Optional fields:

- `helperSlots`
- `presentation`
- `dependencies`
- `compatibility`

### Expected inputs

- package identifier
- selected surface kind such as `channel`, `forum`, `thread`, `timeline`, or `direct`
- runtime ABI version
- host capability requirements
- routing hints for how the package should bind to a NEXUS route

### Expected outputs

- a loadable package definition the runtime core can accept or reject before activation
- enough metadata for the Avalonia host to render the surface and reserve helper slots

### Error behavior

The runtime should reject a surface manifest when:

- `manifestVersion` is unsupported
- `abiVersion` is incompatible
- `surfaceKind` is unknown
- `entrypoint` is missing
- a required host capability is undeclared or unsupported

### Compatibility and versioning

- `manifestVersion` governs manifest-shape evolution
- `abiVersion` governs runtime boundary compatibility
- package upgrades must not silently widen required capabilities

Example file: [surface-thread.example.json](/C:/Users/Allan/OneDrive/Documents/NEXUS/config/runtime-packages/surface-thread.example.json)

## Helper-package manifest

Required fields:

- `packageId`
- `displayName`
- `manifestVersion`
- `sourceRuntime`
- `version`
- `hostingMode`
- `capabilities`
- `failurePolicy`
- `presentationHooks`

Optional fields:

- `slotTargets`
- `handoffContracts`
- `compatibility`

### Expected inputs

- source runtime identity such as `SYMBIOSIS`
- package version and hosting mode
- declared helper capabilities
- approved presentation hooks and allowed slot targets

### Expected outputs

- a helper definition the native runtime can supervise
- enough metadata for NEXUS to keep helper ownership explicit while still rendering the approved host affordance

### Error behavior

The runtime should reject a helper manifest when:

- the source runtime is unknown
- required capabilities are missing
- hosting mode is unsupported
- slot targets are incompatible with the selected surface package
- presentation hooks exceed approved host affordances

### Compatibility and versioning

- helper `version` governs package evolution
- `manifestVersion` governs manifest shape
- helpers must declare slot compatibility explicitly rather than relying on implicit UI placement

Example file: [helper-review.example.json](/C:/Users/Allan/OneDrive/Documents/NEXUS/config/runtime-packages/helper-review.example.json)

## Example usage

The future native runtime should:

1. load a surface-package manifest for the selected route
2. validate ABI and required host capabilities
3. reserve any declared helper slots
4. load only helper-package manifests whose slot targets and capabilities are compatible
5. hand the approved package metadata to the Avalonia host for rendering

## Initial manifest files

- [surface-thread.example.json](/C:/Users/Allan/OneDrive/Documents/NEXUS/config/runtime-packages/surface-thread.example.json)
- [helper-review.example.json](/C:/Users/Allan/OneDrive/Documents/NEXUS/config/runtime-packages/helper-review.example.json)

## Next concrete slice

The next implementation-facing record is [runtime-first-migration-seam.md](runtime-first-migration-seam.md), which uses these manifest contracts to choose the first runtime boundary that can move out from behind the current Electron and Node continuity baseline without breaking the shipped operator surface.
