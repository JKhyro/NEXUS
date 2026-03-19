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

const linkedContextOwnerTypeOrder = ['channel', 'post', 'thread', 'direct', 'message'];

export function linkedContextOwnerType(result) {
  return String(result?.owner?.ownerType ?? result?.reference?.ownerType ?? 'unknown').trim() || 'unknown';
}

function normalizeLinkedContextSearchQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

function linkedContextSearchableText(result) {
  const route = result?.route ?? null;
  const searchableParts = [
    result?.owner?.label,
    result?.owner?.ownerType,
    result?.reference?.system,
    result?.reference?.relationType,
    result?.reference?.externalId,
    result?.reference?.ownerType,
    result?.reference?.ownerId,
    result?.reference?.title,
    result?.reference?.name,
    result?.reference?.summary,
    result?.reference?.description,
    result?.reference?.body,
    result?.reference?.url,
    summarizeLinkedContextPath(result),
    summarizeLinkedContextCoordination(result)
  ];

  if (route) {
    searchableParts.push(
      route.workspaceId,
      route.channelId,
      route.postId,
      route.threadId,
      route.directConversationId,
      route.messageId
    );
  }

  return searchableParts
    .filter((part) => part !== null && part !== undefined)
    .map((part) => String(part).trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export function linkedContextSearchResults(results, query = '') {
  const normalizedQuery = normalizeLinkedContextSearchQuery(query);
  if (!normalizedQuery) {
    return [...(results ?? [])];
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return [...(results ?? [])].filter((result) => {
    const searchableText = linkedContextSearchableText(result);
    return terms.every((term) => searchableText.includes(term));
  });
}

export function linkedContextOwnerTypeLabel(ownerType) {
  switch (ownerType) {
    case 'channel':
      return 'Channels';
    case 'post':
      return 'Posts';
    case 'thread':
      return 'Threads';
    case 'direct':
      return 'Direct conversations';
    case 'message':
      return 'Messages';
    default:
      return 'Other owners';
  }
}

function ownerTypeSortKey(ownerType) {
  const orderIndex = linkedContextOwnerTypeOrder.indexOf(ownerType);
  return orderIndex === -1 ? linkedContextOwnerTypeOrder.length : orderIndex;
}

function ownerTypeCountMap(results) {
  const counts = new Map();
  for (const result of results ?? []) {
    const ownerType = linkedContextOwnerType(result);
    counts.set(ownerType, (counts.get(ownerType) ?? 0) + 1);
  }
  return counts;
}

export function linkedContextOwnerTypeFilters(results, query = '') {
  const searchedResults = linkedContextSearchResults(results, query);
  const counts = ownerTypeCountMap(searchedResults);
  const options = [...counts.entries()]
    .sort(([leftType], [rightType]) => {
      const byOrder = ownerTypeSortKey(leftType) - ownerTypeSortKey(rightType);
      if (byOrder !== 0) {
        return byOrder;
      }
      return leftType.localeCompare(rightType);
    })
    .map(([ownerType, count]) => ({
      value: ownerType,
      count,
      label: linkedContextOwnerTypeLabel(ownerType)
    }));

  return [
    {
      value: 'all',
      count: searchedResults.length,
      label: 'All readable'
    },
    ...options
  ];
}

export function normalizeLinkedContextOwnerTypeFilter(filterValue, results, query = '') {
  const normalized = String(filterValue ?? 'all').trim() || 'all';
  if (normalized === 'all') {
    return 'all';
  }

  return linkedContextOwnerTypeFilters(results, query).some((option) => option.value === normalized)
    ? normalized
    : 'all';
}

export function groupLinkedContextResults(results, filterValue = 'all', query = '') {
  const searchedResults = linkedContextSearchResults(results, query);
  const normalizedFilter = normalizeLinkedContextOwnerTypeFilter(filterValue, results, query);
  const buckets = new Map();

  for (const result of searchedResults) {
    const ownerType = linkedContextOwnerType(result);
    if (normalizedFilter !== 'all' && ownerType !== normalizedFilter) {
      continue;
    }

    const group = buckets.get(ownerType) ?? {
      ownerType,
      label: linkedContextOwnerTypeLabel(ownerType),
      results: []
    };
    group.results.push(result);
    buckets.set(ownerType, group);
  }

  return [...buckets.values()].sort((left, right) => {
    const byOrder = ownerTypeSortKey(left.ownerType) - ownerTypeSortKey(right.ownerType);
    if (byOrder !== 0) {
      return byOrder;
    }
    return left.label.localeCompare(right.label);
  });
}

export function summarizeLinkedContextFilter(results, filterValue = 'all', query = '') {
  const searchedResults = linkedContextSearchResults(results, query);
  const normalizedFilter = normalizeLinkedContextOwnerTypeFilter(filterValue, results, query);
  const filters = linkedContextOwnerTypeFilters(results, query);
  const activeFilter = filters.find((option) => option.value === normalizedFilter) ?? filters[0];

  if ((searchedResults?.length ?? 0) === 0) {
    return 'No owner-type groups are available for this lookup yet.';
  }

  if (normalizedFilter === 'all') {
    const ownerTypeCount = Math.max(filters.length - 1, 0);
    return `Showing all ${activeFilter.count} readable linked result${activeFilter.count === 1 ? '' : 's'} across ${ownerTypeCount} owner type${ownerTypeCount === 1 ? '' : 's'}.`;
  }

  return `Showing ${activeFilter.count} readable linked result${activeFilter.count === 1 ? '' : 's'} for ${activeFilter.label.toLowerCase()}. Switch back to All readable to compare other owner types.`;
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
