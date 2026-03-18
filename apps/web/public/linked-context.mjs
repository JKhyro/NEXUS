export function buildLinkedContextSelection(result, actorId) {
  const route = result?.route ?? null;
  if (!route) {
    return null;
  }

  if (route.directConversationId) {
    return {
      actorId: actorId ?? null,
      workspaceId: route.workspaceId ?? null,
      directConversationId: route.directConversationId,
      channelId: null,
      postId: null,
      threadId: null,
      messageId: route.messageId ?? null,
      coordinationFocusMode: route.messageId ? 'message' : 'scope'
    };
  }

  if (!route.channelId) {
    return null;
  }

  return {
    actorId: actorId ?? null,
    workspaceId: route.workspaceId ?? null,
    directConversationId: null,
    channelId: route.channelId,
    postId: route.postId ?? null,
    threadId: route.threadId ?? null,
    messageId: route.messageId ?? null,
    coordinationFocusMode: route.messageId ? 'message' : 'scope'
  };
}

export function summarizeLinkedContextPath(result) {
  const route = result?.route ?? null;
  if (!route) {
    return 'No navigable route metadata';
  }

  if (route.directConversationId) {
    return route.messageId
      ? `Direct conversation | message ${route.messageId}`
      : 'Direct conversation';
  }

  const parts = [];
  if (route.channelId) {
    parts.push(`Channel ${route.channelId}`);
  }
  if (route.postId) {
    parts.push(`Post ${route.postId}`);
  }
  if (route.threadId) {
    parts.push(`Thread ${route.threadId}`);
  }
  if (route.messageId) {
    parts.push(`Message ${route.messageId}`);
  }

  return parts.join(' | ') || 'No navigable route metadata';
}

function countLabel(type, count) {
  return `${count} ${type}${count === 1 ? '' : 's'}`;
}

export function summarizeLinkedContextCoordination(result) {
  const coordination = result?.coordination ?? null;
  if (!coordination) {
    return 'No recorded coordination yet.';
  }

  const parts = [];
  const scopeRelayCount = Number(coordination.scope?.relayCount ?? 0);
  const scopeHandoffCount = Number(coordination.scope?.handoffCount ?? 0);
  parts.push(`Scope ${countLabel('relay', scopeRelayCount)} | ${countLabel('handoff', scopeHandoffCount)}`);

  if (coordination.message) {
    const messageRelayCount = Number(coordination.message.relayCount ?? 0);
    const messageHandoffCount = Number(coordination.message.handoffCount ?? 0);
    parts.push(`Message ${countLabel('relay', messageRelayCount)} | ${countLabel('handoff', messageHandoffCount)}`);
  }

  return parts.join(' || ');
}
