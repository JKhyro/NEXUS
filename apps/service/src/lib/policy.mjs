function getWorkspaceMemberships(metabase, actorId, workspaceId) {
  return metabase.memberships.filter((membership) => {
    return membership.scopeType === 'workspace' &&
      membership.scopeId === workspaceId &&
      membership.identityId === actorId;
  });
}

function getRoleSet(metabase, memberships) {
  const roleIds = new Set();
  for (const membership of memberships) {
    for (const roleId of membership.roleIds) {
      roleIds.add(roleId);
    }
  }

  return roleIds;
}

function resolveChannelPolicy(channel, mode) {
  const defaultPolicy = { mode: 'workspace', allowedRoleIds: [], allowedIdentityIds: [] };
  if (mode === 'write') {
    return channel.writeAccess ?? channel.access ?? defaultPolicy;
  }
  return channel.access ?? defaultPolicy;
}

function canAccessChannel(metabase, actorId, channel, mode) {
  const memberships = getWorkspaceMemberships(metabase, actorId, channel.workspaceId);
  if (memberships.length === 0) {
    return false;
  }

  const roleIds = getRoleSet(metabase, memberships);
  const access = resolveChannelPolicy(channel, mode);
  if (access.mode === 'workspace') {
    if (!access.allowedRoleIds || access.allowedRoleIds.length === 0) {
      return true;
    }
    return access.allowedRoleIds.some((roleId) => roleIds.has(roleId));
  }

  if (access.allowedIdentityIds?.includes(actorId)) {
    return true;
  }

  if (access.allowedRoleIds?.some((roleId) => roleIds.has(roleId))) {
    return true;
  }

  return false;
}

export function canReadChannel(metabase, actorId, channel) {
  return canAccessChannel(metabase, actorId, channel, 'read');
}

export function canWriteChannel(metabase, actorId, channel) {
  return canAccessChannel(metabase, actorId, channel, 'write');
}

export function canReadDirectConversation(metabase, actorId, directConversation) {
  return directConversation.memberIdentityIds.includes(actorId);
}

export function resolveScopeChannel(store, scopeType, scopeId) {
  if (scopeType === 'channel') {
    return store.metabase.channels.find((channel) => channel.id === scopeId) ?? null;
  }

  if (scopeType === 'post') {
    const post = store.chatbase.posts.find((entry) => entry.id === scopeId);
    return post ? store.metabase.channels.find((channel) => channel.id === post.channelId) ?? null : null;
  }

  if (scopeType === 'thread') {
    const thread = store.chatbase.threads.find((entry) => entry.id === scopeId);
    if (!thread) {
      return null;
    }
    if (thread.channelId) {
      return store.metabase.channels.find((channel) => channel.id === thread.channelId) ?? null;
    }
    if (thread.postId) {
      const post = store.chatbase.posts.find((entry) => entry.id === thread.postId);
      return post ? store.metabase.channels.find((channel) => channel.id === post.channelId) ?? null : null;
    }
  }

  return null;
}

export function assertReadableScope(store, actorId, scopeType, scopeId) {
  if (scopeType === 'direct') {
    const directConversation = store.metabase.directConversations.find((entry) => entry.id === scopeId);
    if (!directConversation || !canReadDirectConversation(store.metabase, actorId, directConversation)) {
      throw new Error('Actor is not allowed to read this direct conversation.');
    }
    return;
  }

  const channel = resolveScopeChannel(store, scopeType, scopeId);
  if (!channel || !canReadChannel(store.metabase, actorId, channel)) {
    throw new Error('Actor is not allowed to read this scope.');
  }
}

export function assertWritableScope(store, actorId, scopeType, scopeId) {
  if (scopeType === 'direct') {
    const directConversation = store.metabase.directConversations.find((entry) => entry.id === scopeId);
    if (!directConversation || !canReadDirectConversation(store.metabase, actorId, directConversation)) {
      throw new Error('Actor is not allowed to write this direct conversation.');
    }
    return;
  }

  const channel = resolveScopeChannel(store, scopeType, scopeId);
  if (!channel || !canWriteChannel(store.metabase, actorId, channel)) {
    throw new Error('Actor is not allowed to write this scope.');
  }
}
