# NEXUS Discord Cutover Plan

## Direction

Discord should not be mirrored forever.

The first usable NEXUS cutover should rebuild internal communication space in NEXUS directly and let Discord become a temporary adapter during transition.

## First cutover shape

Stand up both of these together:

- private operator and specialist lanes
- shared internal coordination lanes

This avoids building the wrong product around Discord's existing shape.

## Greenfield internal spaces

The first bootstrap should include:

- shared workflow lane
- shared requests lane
- shared report/forum lane
- shared investigation/forum lane
- shared library lane
- shared council/governance lane
- shared general lane
- shared digest-micro lane
- shared digest-agent lane
- shared digest-daily lane
- private Kira lane
- private specialist lanes for Hera, Yura, Aura, Sara, Tyra, and Nora
- private curator lanes for Librarian, Arbitrian, and Custodian

## Adapter rule

Discord may still:

- ingest into NEXUS
- relay outward during transition
- provide continuity while humans move

Discord must not:

- define the canonical channel model
- define policy semantics
- define identity roles
- define workflow semantics

## First migration utility

The first bounded migration path now exists.

- `npm run import:chatbase` reads retained Discord history from LIBRARY's existing `chatbase` schema
- it imports only adapter-mapped Discord lanes into NEXUS-native records
- it imports retained Discord forum-thread channels as native NEXUS posts instead of flattening them into ordinary channel messages
- it uses explicit bootstrap forum-routing rules when the retained Discord source does not preserve parent forum ids
- it preserves NEXUS access policy by mapping imported messages into the already-defined NEXUS channels instead of inheriting Discord permissions directly
- it prefers existing NEXUS identities for known Discord authors and only falls back to synthetic Discord identities when no internal match exists

This importer is intentionally narrow. It is designed to move real retained history into NEXUS without pretending that every Discord surface has already been re-modeled perfectly.

## Migration intent

The first internal use of NEXUS should feel like entering the new product, not living inside a long-term Discord mirror.
