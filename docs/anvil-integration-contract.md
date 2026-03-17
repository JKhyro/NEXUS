# NEXUS and ANVIL Integration Contract

## Purpose

NEXUS is replacing Discord, not ANVIL.

ANVIL is the intended workflow and project peer. The first executable NEXUS MVP must therefore expose stable integration hooks even though NEXUS does not yet own workflow objects.

## Integration principle

NEXUS owns communication and coordination context.

ANVIL owns workflow, project, and execution objects.

The bridge between them in the MVP is the `externalReference` model.

## External reference object

An external reference includes:

- `id`
- `ownerType`
- `ownerId`
- `system`
- `relationType`
- `externalId`
- `url`
- `title`
- `createdByIdentityId`
- `createdAt`

## Allowed owner types

- workspace
- channel
- directConversation
- post
- thread
- message

## MVP system values

- `anvil`
- `github`
- `discord`

`anvil` is the preferred long-term peer. `github` remains a development-era external system only.

## Initial relation types

- `tracks`
- `blocks`
- `implements`
- `reportedBy`
- `relatesTo`
- `mirrors`

## MVP service behavior

- NEXUS may attach an external reference to conversation objects now.
- NEXUS does not create or own ANVIL tasks in this MVP.
- NEXUS must be able to list and retrieve external references for any readable object.
- Future ANVIL integration should reuse the same reference model rather than replace it.
