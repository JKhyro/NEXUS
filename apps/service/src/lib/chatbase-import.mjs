import pg from 'pg';

import { LibraryPostgresStore } from './library-postgres-store.mjs';
import { resolveServiceConfig } from './config.mjs';

const { Client } = pg;

function normalizeIdentityValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function slugify(value) {
  return normalizeIdentityValue(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'discord-identity';
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

function buildImportedMessageId(messageId) {
  return `message-discord-${messageId}`;
}

function buildImportedAttachmentId(attachmentId) {
  return `attachment-discord-${attachmentId}`;
}

function buildImportedEventId(messageId) {
  return `event-discord-import-${messageId}`;
}

async function loadSourceMessages({ connectionString, sourceSchema, channelIds }) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
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
          c.topic AS channel_topic,
          a.username,
          a.global_name,
          a.is_bot,
          a.raw_json AS author_raw_json
        FROM ${sourceSchema}.discord_messages m
        JOIN ${sourceSchema}.discord_channels c
          ON c.channel_id = m.channel_id
        LEFT JOIN ${sourceSchema}.discord_authors a
          ON a.author_id = m.author_id
        WHERE m.channel_id = ANY($1::text[])
        ORDER BY m.created_at ASC, m.message_id ASC;
      `,
      [channelIds]
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
      [channelIds]
    );

    return {
      messages: messages.rows,
      attachments: attachments.rows
    };
  }
  finally {
    await client.end().catch(() => {});
  }
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
    const source = await loadSourceMessages({
      connectionString: sourceConnectionString,
      sourceSchema,
      channelIds: [...channelMap.keys()]
    });

    const attachmentsByMessage = new Map();
    for (const attachment of source.attachments) {
      const list = attachmentsByMessage.get(attachment.message_id) ?? [];
      list.push(attachment);
      attachmentsByMessage.set(attachment.message_id, list);
    }

    const importedIds = new Set(store.chatbase.messages.map((message) => message.id));
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

    let importedMessages = 0;
    let importedAttachments = 0;
    let importedEvents = 0;

    for (const row of source.messages) {
      const importedMessageId = buildImportedMessageId(row.message_id);
      if (importedIds.has(importedMessageId)) {
        continue;
      }

      const attachmentRows = attachmentsByMessage.get(row.message_id) ?? [];
      const attachmentIds = attachmentRows.map((attachment) => buildImportedAttachmentId(attachment.attachment_id));
      const authorIdentityId = authorIdentityMap.get(row.author_id ?? 'unknown') ?? buildImportedIdentity({
        authorId: row.author_id,
        username: row.username,
        globalName: row.global_name,
        isBot: row.is_bot
      }).id;

      store.chatbase.messages.push({
        id: importedMessageId,
        scopeType: 'channel',
        scopeId: channelMap.get(row.channel_id),
        authorIdentityId,
        body: row.content ?? '',
        createdAt: new Date(row.created_at).toISOString(),
        source: {
          system: 'discord',
          externalChannelId: row.channel_id,
          externalMessageId: row.message_id,
          externalAuthorId: row.author_id ?? null,
          channelName: row.channel_name,
          channelTopic: row.channel_topic ?? null,
          importedBy: 'nexus-chatbase-import'
        },
        attachmentIds,
        editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
        deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
        raw: row.message_raw_json ?? {}
      });
      importedIds.add(importedMessageId);
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
          externalMessageId: row.message_id,
          importedBy: 'nexus-chatbase-import'
        },
        raw: {
          externalChannelId: row.channel_id,
          externalMessageId: row.message_id,
          originalCreatedAt: row.created_at,
          originalEditedAt: row.edited_at,
          originalDeletedAt: row.deleted_at
        }
      });
      importedEvents += 1;
    }

    if (importedMessages > 0 || importedAttachments > 0 || importedEvents > 0) {
      await store.saveChatbase();
    }

    return {
      sourceSchema,
      targetSchemas: {
        metabase: config.libraryMetabaseSchema,
        chatbase: config.libraryChatbaseSchema
      },
      mappedChannels: channelMap.size,
      sourceMessages: source.messages.length,
      sourceAttachments: source.attachments.length,
      importedIdentities: newIdentities.length,
      importedMessages,
      importedAttachments,
      importedEvents
    };
  }
  finally {
    await store.close();
  }
}
