import pg from 'pg';

import { LibraryPostgresStore } from './library-postgres-store.mjs';
import { resolveServiceConfig } from './config.mjs';

const { Client } = pg;
const discordThreadChannelTypes = new Set(['11', '12', '15']);

function normalizeIdentityValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function slugify(value) {
  return normalizeIdentityValue(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'discord-identity';
}

function normalizePatternList(list) {
  return (list ?? [])
    .map((entry) => normalizeIdentityValue(entry))
    .filter(Boolean);
}

function textMatchesPatterns(value, patterns) {
  if (patterns.length === 0) {
    return false;
  }

  const normalized = normalizeIdentityValue(value);
  if (!normalized) {
    return false;
  }

  return patterns.some((pattern) => normalized.includes(pattern));
}

export function buildDiscordChannelMap(metabase) {
  const channelMap = new Map();
  for (const endpoint of metabase.adapterEndpoints ?? []) {
    if (endpoint.system !== 'discord') {
      continue;
    }

    for (const mapping of endpoint.channelMappings ?? []) {
      channelMap.set(mapping.externalChannelId, mapping.channelId);
    }
  }

  return channelMap;
}

export function buildDiscordForumImportRules(metabase) {
  const rules = [];
  for (const endpoint of metabase.adapterEndpoints ?? []) {
    if (endpoint.system !== 'discord') {
      continue;
    }

    rules.push(...(endpoint.forumThreadImportRules ?? []));
  }

  return rules;
}

export function buildDiscordThreadParentMap(eventRows = []) {
  const parentMap = new Map();
  for (const row of eventRows) {
    const parentChannelId = String(row.parent_channel_id ?? '').trim();
    if (!parentChannelId) {
      continue;
    }

    parentMap.set(String(row.channel_id), parentChannelId);
  }

  return parentMap;
}

export function resolveDiscordForumImportTarget(rules, sourceChannel, firstMessage) {
  const title = sourceChannel?.name ?? '';
  const body = firstMessage?.content ?? '';

  for (const rule of rules) {
    if (rule.default) {
      return rule;
    }

    const titlePatterns = normalizePatternList(rule.match?.titleIncludes ?? rule.titleIncludes);
    const bodyPatterns = normalizePatternList(rule.match?.bodyIncludes ?? rule.bodyIncludes);
    const expectedTypes = normalizePatternList(rule.match?.channelTypes ?? rule.channelTypes);

    if (expectedTypes.length > 0 && !expectedTypes.includes(normalizeIdentityValue(sourceChannel?.channel_type))) {
      continue;
    }

    const titleMatched = textMatchesPatterns(title, titlePatterns);
    const bodyMatched = textMatchesPatterns(body, bodyPatterns);
    const hasTextPatterns = titlePatterns.length > 0 || bodyPatterns.length > 0;

    if (!hasTextPatterns && expectedTypes.length > 0) {
      return rule;
    }

    if ((titlePatterns.length > 0 && titleMatched) || (bodyPatterns.length > 0 && bodyMatched)) {
      return rule;
    }
  }

  return null;
}

export function matchDiscordAuthorToIdentity(identities, author) {
  const candidates = [
    normalizeIdentityValue(author?.globalName),
    normalizeIdentityValue(author?.username)
  ].filter(Boolean);

  for (const identity of identities) {
    const slug = normalizeIdentityValue(identity.slug);
    const displayName = normalizeIdentityValue(identity.displayName);
    if (candidates.includes(slug) || candidates.includes(displayName)) {
      return identity;
    }
  }

  return null;
}

export function buildImportedIdentity(author) {
  const displayName = author?.globalName ?? author?.username ?? `Discord ${author?.authorId ?? 'unknown'}`;
  return {
    id: `identity-discord-${author?.authorId ?? 'unknown'}`,
    slug: slugify(author?.username ?? author?.globalName ?? author?.authorId ?? 'unknown'),
    displayName,
    kind: author?.isBot ? 'system-service' : 'human',
    source: {
      system: 'discord',
      externalAuthorId: author?.authorId ?? null,
      username: author?.username ?? null,
      globalName: author?.globalName ?? null,
      isBot: Boolean(author?.isBot)
    }
  };
}

function buildImportedPostId(channelId) {
  return `post-discord-${channelId}`;
}

function buildImportedThreadId(channelId) {
  return `thread-discord-${channelId}`;
}

function buildImportedMessageId(messageId) {
  return `message-discord-${messageId}`;
}

function buildImportedAttachmentId(attachmentId) {
  return `attachment-discord-${attachmentId}`;
}

function buildImportedEventId(messageId) {
  return `event-discord-import-${messageId}`;
}

function buildImportedRelayId(messageId) {
  return `relay-discord-import-${messageId}`;
}

export function buildImportedRelayRecord({ row, scope, importedMessageId, authorIdentityId }) {
  const occurredAt = new Date(row.created_at).toISOString();
  return {
    id: buildImportedRelayId(row.message_id),
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    toScopeType: 'channel',
    toScopeId: scope.targetChannelId,
    actorIdentityId: authorIdentityId,
    messageId: importedMessageId,
    reason: 'Imported Discord adapter ingress',
    occurredAt,
    source: {
      system: 'discord',
      externalChannelId: row.channel_id,
      externalParentChannelId: scope.externalParentChannelId ?? null,
      externalMessageId: row.message_id,
      routedChannelId: scope.targetChannelId,
      importedBy: 'nexus-chatbase-import',
      importRuleId: scope.importRuleId,
      importStrategy: scope.importStrategy
    },
    raw: {
      externalChannelId: row.channel_id,
      externalMessageId: row.message_id,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      targetChannelId: scope.targetChannelId
    }
  };
}

async function loadSourceState({ connectionString, sourceSchema, directChannelIds }) {
  const client = new Client({ connectionString });
  try {
    await client.connect();

    const channels = await client.query(
      `
        SELECT
          c.channel_id,
          c.guild_id,
          c.name,
          c.channel_type,
          c.topic,
          c.raw_json,
          c.first_seen_at,
          c.last_seen_at
        FROM ${sourceSchema}.discord_channels c
        WHERE c.channel_id = ANY($1::text[])
           OR c.channel_type IN ('11', '12', '15')
        ORDER BY COALESCE(c.first_seen_at, c.last_seen_at) ASC NULLS LAST, c.channel_id ASC;
      `,
      [directChannelIds]
    );

    const sourceChannelIds = channels.rows.map((row) => row.channel_id);
    if (sourceChannelIds.length === 0) {
      return {
        channels: [],
        messages: [],
        attachments: []
      };
    }

    const messages = await client.query(
      `
        SELECT
          m.message_id,
          m.channel_id,
          m.author_id,
          m.content,
          m.created_at,
          m.edited_at,
          m.deleted_at,
          m.raw_json AS message_raw_json,
          c.name AS channel_name,
          c.channel_type,
          c.topic AS channel_topic,
          c.first_seen_at AS channel_first_seen_at,
          c.last_seen_at AS channel_last_seen_at,
          c.raw_json AS channel_raw_json,
          a.username,
          a.global_name,
          a.is_bot
        FROM ${sourceSchema}.discord_messages m
        JOIN ${sourceSchema}.discord_channels c
          ON c.channel_id = m.channel_id
        LEFT JOIN ${sourceSchema}.discord_authors a
          ON a.author_id = m.author_id
        WHERE m.channel_id = ANY($1::text[])
        ORDER BY m.created_at ASC, m.message_id ASC;
      `,
      [sourceChannelIds]
    );

    const attachments = await client.query(
      `
        SELECT
          dma.attachment_id,
          dma.message_id,
          dma.filename,
          dma.url,
          dma.content_type,
          dma.size_bytes,
          dma.raw_json
        FROM ${sourceSchema}.discord_message_attachments dma
        JOIN ${sourceSchema}.discord_messages dm
          ON dm.message_id = dma.message_id
        WHERE dm.channel_id = ANY($1::text[])
        ORDER BY dma.message_id ASC, dma.attachment_id ASC;
      `,
      [sourceChannelIds]
    );

    const parentEvents = await client.query(
      `
        SELECT
          dme.channel_id,
          COALESCE(dme.payload_json->'raw'->>'parentId', dme.payload_json->'raw'->>'parent_id') AS parent_channel_id,
          dme.observed_at
        FROM ${sourceSchema}.discord_message_events dme
        WHERE dme.channel_id = ANY($1::text[])
          AND COALESCE(dme.payload_json->'raw'->>'parentId', dme.payload_json->'raw'->>'parent_id') IS NOT NULL
        ORDER BY dme.observed_at ASC, dme.channel_id ASC;
      `,
      [sourceChannelIds]
    );

    return {
      channels: channels.rows,
      messages: messages.rows,
      attachments: attachments.rows,
      parentEvents: parentEvents.rows
    };
  }
  finally {
    await client.end().catch(() => {});
  }
}

function buildAuthorIdentityId(authorIdentityMap, row) {
  return authorIdentityMap.get(row.author_id ?? 'unknown') ?? buildImportedIdentity({
    authorId: row.author_id,
    username: row.username,
    globalName: row.global_name,
    isBot: row.is_bot
  }).id;
}

export async function importChatbaseIntoNexus(options = {}) {
  const config = resolveServiceConfig(options);
  if (config.storageMode !== 'library-postgres') {
    throw new Error('CHATBASE import requires NEXUS to run in library-postgres mode.');
  }

  const sourceConnectionString = options.sourceConnectionString ?? process.env.NEXUS_IMPORT_LIBRARY_CONNECTION_STRING ?? config.libraryConnectionString;
  const sourceSchema = options.sourceSchema ?? process.env.NEXUS_IMPORT_CHATBASE_SCHEMA ?? 'chatbase';
  if (!sourceConnectionString) {
    throw new Error('A source LIBRARY connection string is required for CHATBASE import.');
  }

  const store = new LibraryPostgresStore({
    bootstrapPath: config.bootstrapPath,
    connectionString: config.libraryConnectionString,
    chatbaseSchema: config.libraryChatbaseSchema,
    metabaseSchema: config.libraryMetabaseSchema
  });

  await store.init();
  try {
    const channelMap = buildDiscordChannelMap(store.metabase);
    const forumImportRules = buildDiscordForumImportRules(store.metabase);
    const source = await loadSourceState({
      connectionString: sourceConnectionString,
      sourceSchema,
      directChannelIds: [...channelMap.keys()]
    });

    const sourceChannelsById = new Map(source.channels.map((channel) => [channel.channel_id, channel]));
    const threadParentMap = buildDiscordThreadParentMap(source.parentEvents);
    const firstMessageByChannelId = new Map();
    for (const row of source.messages) {
      if (!firstMessageByChannelId.has(row.channel_id)) {
        firstMessageByChannelId.set(row.channel_id, row);
      }
    }

    const attachmentsByMessage = new Map();
    for (const attachment of source.attachments) {
      const list = attachmentsByMessage.get(attachment.message_id) ?? [];
      list.push(attachment);
      attachmentsByMessage.set(attachment.message_id, list);
    }

    const importedMessageIds = new Set(store.chatbase.messages.map((message) => message.id));
    const importedPostIds = new Set(store.chatbase.posts.map((post) => post.id));
    const importedThreadIds = new Set(store.chatbase.threads.map((thread) => thread.id));
    const importedRelayIds = new Set(store.chatbase.relays.map((relay) => relay.id));
    const identityIds = new Set(store.metabase.identities.map((identity) => identity.id));
    const newIdentities = [];
    const authorIdentityMap = new Map();

    for (const row of source.messages) {
      const author = {
        authorId: row.author_id,
        username: row.username,
        globalName: row.global_name,
        isBot: row.is_bot
      };

      if (authorIdentityMap.has(row.author_id ?? 'unknown')) {
        continue;
      }

      const matched = matchDiscordAuthorToIdentity(store.metabase.identities, author);
      if (matched) {
        authorIdentityMap.set(row.author_id ?? 'unknown', matched.id);
        continue;
      }

      const importedIdentity = buildImportedIdentity(author);
      authorIdentityMap.set(row.author_id ?? 'unknown', importedIdentity.id);
      if (!identityIds.has(importedIdentity.id)) {
        identityIds.add(importedIdentity.id);
        newIdentities.push(importedIdentity);
      }
    }

    if (newIdentities.length > 0) {
      store.metabase.identities.push(...newIdentities);
      await store.saveMetabase();
    }

    const scopeCache = new Map();
    let importedPosts = 0;
    let importedThreads = 0;
    let importedMessages = 0;
    let importedAttachments = 0;
    let importedRelays = 0;
    let importedHandoffs = 0;
    let importedEvents = 0;
    let importedScopesWithRecoveredParent = 0;

    function ensureForumPost(sourceChannelId) {
      const cached = scopeCache.get(sourceChannelId);
      if (cached) {
        return cached;
      }

      const sourceChannel = sourceChannelsById.get(sourceChannelId);
      if (!sourceChannel) {
        return null;
      }

      if (channelMap.has(sourceChannelId)) {
        const directScope = {
          scopeType: 'channel',
          scopeId: channelMap.get(sourceChannelId),
          targetChannelId: channelMap.get(sourceChannelId),
          importRuleId: null,
          externalScopeChannelId: sourceChannelId
        };
        scopeCache.set(sourceChannelId, directScope);
        return directScope;
      }

      if (!discordThreadChannelTypes.has(String(sourceChannel.channel_type))) {
        return null;
      }

      const externalParentChannelId = threadParentMap.get(sourceChannelId) ?? null;
      const mappedParentChannelId = externalParentChannelId
        ? channelMap.get(externalParentChannelId) ?? null
        : null;
      const firstMessage = firstMessageByChannelId.get(sourceChannelId);
      let targetChannelId = mappedParentChannelId;
      let importRuleId = null;
      let importStrategy = mappedParentChannelId ? 'recovered-parent' : 'forum-rule';

      if (!targetChannelId) {
        const importRule = resolveDiscordForumImportTarget(forumImportRules, sourceChannel, firstMessage);
        if (!importRule?.channelId) {
          return null;
        }

        targetChannelId = importRule.channelId;
        importRuleId = importRule.id ?? null;
        if (externalParentChannelId) {
          importStrategy = 'recovered-parent-fallback-rule';
        }
      }

      if (String(sourceChannel.channel_type) === '11') {
        const postId = buildImportedPostId(sourceChannelId);
        if (!importedPostIds.has(postId)) {
          const createdByIdentityId = firstMessage
            ? buildAuthorIdentityId(authorIdentityMap, firstMessage)
            : 'identity-jack';
          store.chatbase.posts.push({
            id: postId,
            channelId: targetChannelId,
            title: sourceChannel.name ?? `Imported Discord post ${sourceChannelId}`,
            createdAt: new Date(firstMessage?.created_at ?? sourceChannel.first_seen_at ?? sourceChannel.last_seen_at ?? Date.now()).toISOString(),
            createdByIdentityId,
            source: {
              system: 'discord',
              externalChannelId: sourceChannelId,
              externalParentChannelId,
              externalChannelType: sourceChannel.channel_type,
              importedBy: 'nexus-chatbase-import',
              importRuleId,
              importStrategy
            },
            raw: sourceChannel.raw_json ?? {}
          });
          importedPostIds.add(postId);
          importedPosts += 1;
          if (mappedParentChannelId) {
            importedScopesWithRecoveredParent += 1;
          }
        }

        const scope = {
          scopeType: 'post',
          scopeId: postId,
          targetChannelId,
          importRuleId,
          importStrategy,
          externalParentChannelId,
          externalScopeChannelId: sourceChannelId
        };
        scopeCache.set(sourceChannelId, scope);
        return scope;
      }

      const threadId = buildImportedThreadId(sourceChannelId);
      if (!importedThreadIds.has(threadId)) {
        const createdByIdentityId = firstMessage
          ? buildAuthorIdentityId(authorIdentityMap, firstMessage)
          : 'identity-jack';
        store.chatbase.threads.push({
          id: threadId,
          channelId: targetChannelId,
          postId: null,
          title: sourceChannel.name ?? `Imported Discord thread ${sourceChannelId}`,
          createdAt: new Date(firstMessage?.created_at ?? sourceChannel.first_seen_at ?? sourceChannel.last_seen_at ?? Date.now()).toISOString(),
          createdByIdentityId,
          source: {
            system: 'discord',
            externalChannelId: sourceChannelId,
            externalParentChannelId,
            externalChannelType: sourceChannel.channel_type,
            importedBy: 'nexus-chatbase-import',
            importRuleId,
            importStrategy
          },
          raw: sourceChannel.raw_json ?? {}
        });
        importedThreadIds.add(threadId);
        importedThreads += 1;
        if (mappedParentChannelId) {
          importedScopesWithRecoveredParent += 1;
        }
      }

      const scope = {
        scopeType: 'thread',
        scopeId: threadId,
        targetChannelId,
        importRuleId,
        importStrategy,
        externalParentChannelId,
        externalScopeChannelId: sourceChannelId
      };
      scopeCache.set(sourceChannelId, scope);
      return scope;
    }

    for (const row of source.messages) {
      const importedMessageId = buildImportedMessageId(row.message_id);
      const scope = ensureForumPost(row.channel_id);
      if (!scope) {
        continue;
      }

      const authorIdentityId = buildAuthorIdentityId(authorIdentityMap, row);
      const importedRelayId = buildImportedRelayId(row.message_id);
      if (!importedRelayIds.has(importedRelayId)) {
        store.chatbase.relays.push(buildImportedRelayRecord({
          row,
          scope,
          importedMessageId,
          authorIdentityId
        }));
        importedRelayIds.add(importedRelayId);
        importedRelays += 1;
      }

      if (importedMessageIds.has(importedMessageId)) {
        continue;
      }

      const attachmentRows = attachmentsByMessage.get(row.message_id) ?? [];
      const attachmentIds = attachmentRows.map((attachment) => buildImportedAttachmentId(attachment.attachment_id));

      store.chatbase.messages.push({
        id: importedMessageId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        authorIdentityId,
        body: row.content ?? '',
        createdAt: new Date(row.created_at).toISOString(),
        source: {
          system: 'discord',
          externalChannelId: row.channel_id,
          externalParentChannelId: scope.externalParentChannelId ?? null,
          externalMessageId: row.message_id,
          externalAuthorId: row.author_id ?? null,
          channelName: row.channel_name,
          channelTopic: row.channel_topic ?? null,
          routedChannelId: scope.targetChannelId,
          importedBy: 'nexus-chatbase-import',
          importRuleId: scope.importRuleId,
          importStrategy: scope.importStrategy
        },
        attachmentIds,
        editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
        deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
        raw: row.message_raw_json ?? {}
      });
      importedMessageIds.add(importedMessageId);
      importedMessages += 1;

      for (const attachment of attachmentRows) {
        store.chatbase.attachments.push({
          id: buildImportedAttachmentId(attachment.attachment_id),
          messageId: importedMessageId,
          name: attachment.filename,
          mediaType: attachment.content_type ?? 'application/octet-stream',
          url: attachment.url,
          bytes: Number(attachment.size_bytes ?? 0),
          source: {
            system: 'discord',
            externalAttachmentId: attachment.attachment_id
          },
          raw: attachment.raw_json ?? {}
        });
        importedAttachments += 1;
      }

      store.chatbase.messageEvents.push({
        id: buildImportedEventId(row.message_id),
        type: 'message.imported',
        messageId: importedMessageId,
        occurredAt: new Date(row.created_at).toISOString(),
        source: {
          system: 'discord',
          externalChannelId: row.channel_id,
          externalParentChannelId: scope.externalParentChannelId ?? null,
          externalMessageId: row.message_id,
          routedChannelId: scope.targetChannelId,
          importedBy: 'nexus-chatbase-import',
          importRuleId: scope.importRuleId,
          importStrategy: scope.importStrategy
        },
        raw: {
          externalChannelId: row.channel_id,
          externalMessageId: row.message_id,
          originalCreatedAt: row.created_at,
          originalEditedAt: row.edited_at,
          originalDeletedAt: row.deleted_at,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId
        }
      });
      importedEvents += 1;
    }

    if (importedPosts > 0 || importedThreads > 0 || importedMessages > 0 || importedAttachments > 0 || importedRelays > 0 || importedHandoffs > 0 || importedEvents > 0) {
      await store.saveChatbase();
    }

    return {
      sourceSchema,
      targetSchemas: {
        metabase: config.libraryMetabaseSchema,
        chatbase: config.libraryChatbaseSchema
      },
      mappedChannels: channelMap.size,
      forumImportRules: forumImportRules.length,
      recoveredParentMappings: threadParentMap.size,
      sourceChannels: source.channels.length,
      sourceMessages: source.messages.length,
      sourceAttachments: source.attachments.length,
      importedIdentities: newIdentities.length,
      importedPosts,
      importedThreads,
      importedScopesWithRecoveredParent,
      importedMessages,
      importedAttachments,
      importedRelays,
      importedHandoffs,
      importedEvents
    };
  }
  finally {
    await store.close();
  }
}
