export function parseSelectionRouteHash(hash) {
  const raw = typeof hash === 'string' ? hash.trim() : '';
  const query = raw.startsWith('#') ? raw.slice(1) : raw;
  const params = new URLSearchParams(query);

  return {
    actorId: params.get('actor') || null,
    workspaceId: params.get('workspace') || null,
    directConversationId: params.get('direct') || null,
    channelId: params.get('channel') || null,
    postId: params.get('post') || null,
    threadId: params.get('thread') || null,
    messageId: params.get('message') || null,
    coordinationFocusMode: params.get('coordination') === 'message' ? 'message' : 'scope'
  };
}

export function buildSelectionRouteHash(selection) {
  const params = new URLSearchParams();

  if (selection.actorId) {
    params.set('actor', selection.actorId);
  }
  if (selection.workspaceId) {
    params.set('workspace', selection.workspaceId);
  }

  if (selection.directConversationId) {
    params.set('direct', selection.directConversationId);
  }
  else if (selection.channelId) {
    params.set('channel', selection.channelId);
    if (selection.postId) {
      params.set('post', selection.postId);
    }
    if (selection.threadId) {
      params.set('thread', selection.threadId);
    }
  }

  if (selection.messageId) {
    params.set('message', selection.messageId);
  }

  if (selection.coordinationFocusMode === 'message' && selection.messageId) {
    params.set('coordination', 'message');
  }

  const query = params.toString();
  return query ? `#${query}` : '';
}
