export const CONTRACT_VERSION = '0.1.0';

export const identityKinds = ['human', 'symbiote', 'curator', 'collector', 'system-service'];
export const channelKinds = ['shared', 'private', 'forum'];
export const scopeTypes = ['channel', 'post', 'thread', 'direct'];
export const externalSystems = ['anvil', 'github', 'discord'];
export const externalRelationTypes = ['tracks', 'blocks', 'implements', 'reportedBy', 'relatesTo', 'mirrors'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertString(payload, field) {
  assert(typeof payload?.[field] === 'string' && payload[field].trim().length > 0, `Expected ${field} to be a non-empty string.`);
}

function assertOptionalString(payload, field) {
  if (payload?.[field] === undefined) {
    return;
  }

  assertString(payload, field);
}

function assertOptionalArray(payload, field) {
  if (payload?.[field] === undefined) {
    return;
  }

  assert(Array.isArray(payload[field]), `Expected ${field} to be an array when provided.`);
}

function assertOptionalScope(payload, prefix) {
  const typeField = `${prefix}ScopeType`;
  const idField = `${prefix}ScopeId`;
  if (payload?.[typeField] === undefined && payload?.[idField] === undefined) {
    return;
  }

  assertString(payload, typeField);
  assert(scopeTypes.includes(payload[typeField]), `Unsupported ${typeField}: ${payload[typeField]}`);
  assertString(payload, idField);
}

export function validateMessageCreateInput(payload) {
  assertString(payload, 'actorId');
  assertString(payload, 'scopeType');
  assert(scopeTypes.includes(payload.scopeType), `Unsupported scopeType: ${payload.scopeType}`);
  assertString(payload, 'scopeId');
  assertString(payload, 'body');
  assertOptionalArray(payload, 'attachments');
  return payload;
}

export function validatePostCreateInput(payload) {
  assertString(payload, 'actorId');
  assertString(payload, 'channelId');
  assertString(payload, 'title');
  assertString(payload, 'body');
  assertOptionalArray(payload, 'attachments');
  return payload;
}

export function validateThreadCreateInput(payload) {
  assertString(payload, 'actorId');
  assert(typeof payload?.channelId === 'string' || typeof payload?.postId === 'string', 'Expected channelId or postId for thread creation.');
  if (payload?.channelId !== undefined) {
    assertString(payload, 'channelId');
  }
  if (payload?.postId !== undefined) {
    assertString(payload, 'postId');
  }
  if (payload?.title !== undefined) {
    assertString(payload, 'title');
  }
  return payload;
}

export function validateDirectConversationCreateInput(payload) {
  assertString(payload, 'actorId');
  assert(Array.isArray(payload?.memberIdentityIds) && payload.memberIdentityIds.length >= 2, 'Expected at least two identities in memberIdentityIds.');
  return payload;
}

export function validateExternalReferenceCreateInput(payload) {
  assertString(payload, 'actorId');
  assertString(payload, 'ownerType');
  assertString(payload, 'ownerId');
  assertString(payload, 'system');
  assert(externalSystems.includes(payload.system), `Unsupported external system: ${payload.system}`);
  assertString(payload, 'relationType');
  assert(externalRelationTypes.includes(payload.relationType), `Unsupported relationType: ${payload.relationType}`);
  assertString(payload, 'externalId');
  assertString(payload, 'url');
  assertString(payload, 'title');
  return payload;
}

export function validateRelayCreateInput(payload) {
  assertString(payload, 'actorId');
  assertString(payload, 'scopeType');
  assert(scopeTypes.includes(payload.scopeType), `Unsupported scopeType: ${payload.scopeType}`);
  assertString(payload, 'scopeId');
  assertString(payload, 'reason');
  assertOptionalScope(payload, 'from');
  assertOptionalScope(payload, 'to');
  assertOptionalString(payload, 'messageId');
  return payload;
}

export function validateHandoffCreateInput(payload) {
  assertString(payload, 'actorId');
  assertString(payload, 'scopeType');
  assert(scopeTypes.includes(payload.scopeType), `Unsupported scopeType: ${payload.scopeType}`);
  assertString(payload, 'scopeId');
  assertString(payload, 'toIdentityId');
  assertString(payload, 'rationale');
  assertOptionalString(payload, 'fromIdentityId');
  assertOptionalString(payload, 'messageId');
  return payload;
}

export function validateDiscordEventInput(payload) {
  assertString(payload, 'type');
  assert(payload.type === 'message.created', 'Only Discord message.created events are supported in the MVP.');
  assertString(payload, 'externalChannelId');
  assertString(payload, 'externalMessageId');
  assertString(payload, 'actorId');
  assertString(payload, 'content');
  assertOptionalArray(payload, 'attachments');
  assertOptionalString(payload, 'relayReason');
  if (payload?.handoff !== undefined) {
    assert(typeof payload.handoff === 'object' && payload.handoff !== null && !Array.isArray(payload.handoff), 'Expected handoff to be an object when provided.');
    assertString(payload.handoff, 'toIdentityId');
    assertString(payload.handoff, 'rationale');
    assertOptionalString(payload.handoff, 'fromIdentityId');
  }
  return payload;
}
