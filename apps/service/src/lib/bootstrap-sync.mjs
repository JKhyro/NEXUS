function mergeBootstrapCollection(bootstrapItems = [], existingItems = [], key = 'id') {
  const merged = [];
  const seen = new Set();
  const existingByKey = new Map(existingItems.map((item) => [item[key], item]));

  for (const bootstrapItem of bootstrapItems) {
    merged.push(bootstrapItem);
    seen.add(bootstrapItem[key]);
  }

  for (const existingItem of existingItems) {
    const value = existingItem[key];
    if (seen.has(value)) {
      continue;
    }
    merged.push(existingItem);
  }

  return merged;
}

export function syncBootstrapMetabase(existingMetabase, bootstrap, now = new Date().toISOString()) {
  const nextMetabase = {
    version: existingMetabase?.version ?? '0.1.0',
    createdAt: existingMetabase?.createdAt ?? now,
    updatedAt: now,
    roles: mergeBootstrapCollection(bootstrap.roles, existingMetabase?.roles, 'id'),
    identities: mergeBootstrapCollection(bootstrap.identities, existingMetabase?.identities, 'id'),
    workspaces: mergeBootstrapCollection(bootstrap.workspaces, existingMetabase?.workspaces, 'id'),
    channels: mergeBootstrapCollection(bootstrap.channels, existingMetabase?.channels, 'id'),
    memberships: mergeBootstrapCollection(bootstrap.memberships, existingMetabase?.memberships, 'id'),
    directConversations: mergeBootstrapCollection(bootstrap.directConversations ?? [], existingMetabase?.directConversations, 'id'),
    adapterEndpoints: mergeBootstrapCollection(bootstrap.adapterEndpoints ?? [], existingMetabase?.adapterEndpoints, 'id'),
    externalReferences: existingMetabase?.externalReferences ?? []
  };

  const changed = JSON.stringify({
    roles: existingMetabase?.roles ?? [],
    identities: existingMetabase?.identities ?? [],
    workspaces: existingMetabase?.workspaces ?? [],
    channels: existingMetabase?.channels ?? [],
    memberships: existingMetabase?.memberships ?? [],
    directConversations: existingMetabase?.directConversations ?? [],
    adapterEndpoints: existingMetabase?.adapterEndpoints ?? []
  }) !== JSON.stringify({
    roles: nextMetabase.roles,
    identities: nextMetabase.identities,
    workspaces: nextMetabase.workspaces,
    channels: nextMetabase.channels,
    memberships: nextMetabase.memberships,
    directConversations: nextMetabase.directConversations,
    adapterEndpoints: nextMetabase.adapterEndpoints
  });

  return {
    changed,
    metabase: nextMetabase
  };
}
