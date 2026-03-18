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

export function deriveBreadcrumbRoute(route) {
  const trail = [];

  if (route.workspaceId) {
    trail.push({ level: 'workspace', id: route.workspaceId });
  }

  if (route.directConversationId) {
    trail.push({ level: 'direct', id: route.directConversationId });
  }
  else if (route.channelId) {
    trail.push({ level: 'channel', id: route.channelId });

    if (route.postId) {
      trail.push({ level: 'post', id: route.postId });
    }

    if (route.threadId) {
      trail.push({ level: 'thread', id: route.threadId });
    }
  }

  if (route.messageId) {
    trail.push({ level: 'message', id: route.messageId });
  }

  return trail;
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

export function buildSelectionRouteUrl(baseHref, selection) {
  const url = new URL(baseHref);
  url.hash = buildSelectionRouteHash(selection);
  return url.toString();
}
