import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { BaseNexusStore } from './base-store.mjs';
import { syncBootstrapMetabase } from './bootstrap-sync.mjs';

const { Pool } = pg;

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function setSearchPath(client, schemaName) {
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public;`);
}

async function runSchema(client, schemaName, schemaPath) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)};`);
  await setSearchPath(client, schemaName);
  await client.query(await readFile(schemaPath, 'utf8'));
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  return value ?? fallback;
}

const schemaDir = dirname(fileURLToPath(import.meta.url));

export class LibraryPostgresStore extends BaseNexusStore {
  constructor({ bootstrapPath, connectionString, chatbaseSchema, metabaseSchema }) {
    super();
    this.bootstrapPath = bootstrapPath;
    this.chatbaseSchema = chatbaseSchema;
    this.metabaseSchema = metabaseSchema;
    this.pool = new Pool({
      connectionString,
      allowExitOnIdle: true
    });
    this.metabaseSchemaPath = join(schemaDir, 'library-metabase.schema.sql');
    this.chatbaseSchemaPath = join(schemaDir, 'library-chatbase.schema.sql');
    this.metabasePath = `library-postgres:${metabaseSchema}`;
    this.chatbasePath = `library-postgres:${chatbaseSchema}`;
  }

  async withClient(callback) {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    }
    finally {
      client.release();
    }
  }

  async withTransaction(callback) {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      }
      catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async init() {
    const bootstrap = JSON.parse(await readFile(this.bootstrapPath, 'utf8'));

    await this.withTransaction(async (client) => {
      await runSchema(client, this.metabaseSchema, this.metabaseSchemaPath);
      await runSchema(client, this.chatbaseSchema, this.chatbaseSchemaPath);
    });

    const isEmpty = await this.withClient(async (client) => {
      await setSearchPath(client, this.metabaseSchema);
      const result = await client.query('SELECT COUNT(*)::int AS count FROM workspaces;');
      return Number(result.rows[0]?.count ?? 0) === 0;
    });

    if (isEmpty) {
      this.metabase = {
        version: '0.1.0',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        roles: bootstrap.roles,
        identities: bootstrap.identities,
        workspaces: bootstrap.workspaces,
        channels: bootstrap.channels,
        memberships: bootstrap.memberships,
        directConversations: bootstrap.directConversations,
        adapterEndpoints: bootstrap.adapterEndpoints,
        externalReferences: []
      };
      this.chatbase = {
        version: '0.1.0',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        posts: [],
        threads: [],
        messages: [],
        attachments: [],
        relays: [],
        handoffs: [],
        messageEvents: []
      };
      await this.saveMetabase();
      await this.saveChatbase();
      return;
    }

    await this.reload();

    const synced = syncBootstrapMetabase(this.metabase, bootstrap, nowIso());
    if (synced.changed) {
      this.metabase = synced.metabase;
      await this.saveMetabase();
    }
  }

  async reload() {
    await this.withClient(async (client) => {
      await setSearchPath(client, this.metabaseSchema);
      const roles = await client.query('SELECT raw_json FROM roles ORDER BY slug ASC;');
      const identities = await client.query('SELECT raw_json FROM identities ORDER BY slug ASC;');
      const workspaces = await client.query('SELECT raw_json FROM workspaces ORDER BY slug ASC;');
      const channels = await client.query('SELECT raw_json, access_json FROM channels ORDER BY workspace_id, slug ASC;');
      const memberships = await client.query('SELECT raw_json, role_ids_json FROM memberships ORDER BY scope_type, scope_id, identity_id ASC;');
      const directConversations = await client.query('SELECT raw_json, member_identity_ids_json FROM direct_conversations ORDER BY created_at ASC;');
      const adapterEndpoints = await client.query('SELECT raw_json FROM adapter_endpoints ORDER BY id ASC;');
      const adapterMappings = await client.query('SELECT endpoint_id, raw_json FROM adapter_channel_mappings ORDER BY endpoint_id, external_channel_id ASC;');
      const externalReferences = await client.query('SELECT raw_json FROM external_references ORDER BY created_at ASC;');

      const endpoints = adapterEndpoints.rows.map((row) => parseJson(row.raw_json, {}));
      for (const mapping of adapterMappings.rows) {
        const endpoint = endpoints.find((entry) => entry.id === mapping.endpoint_id);
        if (!endpoint) {
          continue;
        }
        endpoint.channelMappings ??= [];
        endpoint.channelMappings.push(parseJson(mapping.raw_json, {}));
      }

      this.metabase = {
        version: '0.1.0',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        roles: roles.rows.map((row) => parseJson(row.raw_json, {})),
        identities: identities.rows.map((row) => parseJson(row.raw_json, {})),
        workspaces: workspaces.rows.map((row) => parseJson(row.raw_json, {})),
        channels: channels.rows.map((row) => {
          const channel = parseJson(row.raw_json, {});
          channel.access = parseJson(row.access_json, channel.access ?? {});
          return channel;
        }),
        memberships: memberships.rows.map((row) => {
          const membership = parseJson(row.raw_json, {});
          membership.roleIds = parseJson(row.role_ids_json, membership.roleIds ?? []);
          return membership;
        }),
        directConversations: directConversations.rows.map((row) => {
          const conversation = parseJson(row.raw_json, {});
          conversation.memberIdentityIds = parseJson(row.member_identity_ids_json, conversation.memberIdentityIds ?? []);
          return conversation;
        }),
        adapterEndpoints: endpoints,
        externalReferences: externalReferences.rows.map((row) => parseJson(row.raw_json, {}))
      };
    });

    await this.withClient(async (client) => {
      await setSearchPath(client, this.chatbaseSchema);
      const posts = await client.query('SELECT raw_json FROM posts ORDER BY created_at ASC;');
      const threads = await client.query('SELECT raw_json FROM threads ORDER BY created_at ASC;');
      const messages = await client.query('SELECT raw_json FROM messages ORDER BY created_at ASC;');
      const attachments = await client.query('SELECT raw_json FROM attachments ORDER BY message_id, id ASC;');
      const relays = await client.query('SELECT raw_json FROM relays ORDER BY id ASC;');
      const handoffs = await client.query('SELECT raw_json FROM handoffs ORDER BY id ASC;');
      const events = await client.query('SELECT raw_json FROM message_events ORDER BY occurred_at ASC;');

      this.chatbase = {
        version: '0.1.0',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        posts: posts.rows.map((row) => parseJson(row.raw_json, {})),
        threads: threads.rows.map((row) => parseJson(row.raw_json, {})),
        messages: messages.rows.map((row) => parseJson(row.raw_json, {})),
        attachments: attachments.rows.map((row) => parseJson(row.raw_json, {})),
        relays: relays.rows.map((row) => parseJson(row.raw_json, {})),
        handoffs: handoffs.rows.map((row) => parseJson(row.raw_json, {})),
        messageEvents: events.rows.map((row) => parseJson(row.raw_json, {}))
      };
    });
  }

  async saveMetabase() {
    await this.withTransaction(async (client) => {
      await setSearchPath(client, this.metabaseSchema);
      await client.query('TRUNCATE TABLE adapter_channel_mappings, adapter_endpoints, external_references, direct_conversations, memberships, channels, workspaces, identities, roles RESTART IDENTITY CASCADE;');

      for (const role of this.metabase.roles) {
        await client.query('INSERT INTO roles (id, slug, name, identity_kind, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW());', [role.id, role.slug, role.name, role.identityKind, JSON.stringify(role)]);
      }
      for (const identity of this.metabase.identities) {
        await client.query('INSERT INTO identities (id, slug, display_name, kind, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW());', [identity.id, identity.slug, identity.displayName, identity.kind, JSON.stringify(identity)]);
      }
      for (const workspace of this.metabase.workspaces) {
        await client.query('INSERT INTO workspaces (id, slug, name, description, visibility, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW());', [workspace.id, workspace.slug, workspace.name, workspace.description, workspace.visibility, JSON.stringify(workspace)]);
      }
      for (const channel of this.metabase.channels) {
        await client.query('INSERT INTO channels (id, workspace_id, slug, name, kind, description, access_json, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW());', [channel.id, channel.workspaceId, channel.slug, channel.name, channel.kind, channel.description, JSON.stringify(channel.access ?? {}), JSON.stringify(channel)]);
      }
      for (const membership of this.metabase.memberships) {
        await client.query('INSERT INTO memberships (id, scope_type, scope_id, identity_id, role_ids_json, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW());', [membership.id, membership.scopeType, membership.scopeId, membership.identityId, JSON.stringify(membership.roleIds ?? []), JSON.stringify(membership)]);
      }
      for (const directConversation of this.metabase.directConversations) {
        await client.query('INSERT INTO direct_conversations (id, member_identity_ids_json, created_at, created_by_identity_id, raw_json, updated_at) VALUES ($1, $2::jsonb, $3, $4, $5::jsonb, NOW());', [directConversation.id, JSON.stringify(directConversation.memberIdentityIds ?? []), directConversation.createdAt, directConversation.createdByIdentityId, JSON.stringify(directConversation)]);
      }
      for (const endpoint of this.metabase.adapterEndpoints) {
        await client.query('INSERT INTO adapter_endpoints (id, system, direction, workspace_id, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW());', [endpoint.id, endpoint.system, endpoint.direction, endpoint.workspaceId, JSON.stringify({ ...endpoint, channelMappings: undefined })]);
        for (const mapping of endpoint.channelMappings ?? []) {
          await client.query('INSERT INTO adapter_channel_mappings (endpoint_id, external_channel_id, channel_id, raw_json, updated_at) VALUES ($1, $2, $3, $4::jsonb, NOW());', [endpoint.id, mapping.externalChannelId, mapping.channelId, JSON.stringify(mapping)]);
        }
      }
      for (const reference of this.metabase.externalReferences) {
        await client.query('INSERT INTO external_references (id, owner_type, owner_id, system, relation_type, external_id, url, title, created_by_identity_id, created_at, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW());', [reference.id, reference.ownerType, reference.ownerId, reference.system, reference.relationType, reference.externalId, reference.url, reference.title, reference.createdByIdentityId, reference.createdAt, JSON.stringify(reference)]);
      }
    });
    await this.reload();
  }

  async saveChatbase() {
    await this.withTransaction(async (client) => {
      await setSearchPath(client, this.chatbaseSchema);
      await client.query('TRUNCATE TABLE message_events, attachments, messages, threads, posts, relays, handoffs RESTART IDENTITY CASCADE;');

      for (const post of this.chatbase.posts) {
        await client.query('INSERT INTO posts (id, channel_id, title, created_at, created_by_identity_id, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW());', [post.id, post.channelId, post.title, post.createdAt, post.createdByIdentityId, JSON.stringify(post)]);
      }
      for (const thread of this.chatbase.threads) {
        await client.query('INSERT INTO threads (id, channel_id, post_id, title, created_at, created_by_identity_id, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW());', [thread.id, thread.channelId, thread.postId, thread.title, thread.createdAt, thread.createdByIdentityId, JSON.stringify(thread)]);
      }
      for (const message of this.chatbase.messages) {
        await client.query('INSERT INTO messages (id, scope_type, scope_id, author_identity_id, body, source_json, attachment_ids_json, created_at, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, NOW());', [message.id, message.scopeType, message.scopeId, message.authorIdentityId, message.body, JSON.stringify(message.source ?? {}), JSON.stringify(message.attachmentIds ?? []), message.createdAt, JSON.stringify(message)]);
      }
      for (const attachment of this.chatbase.attachments) {
        await client.query('INSERT INTO attachments (id, message_id, name, media_type, url, bytes, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW());', [attachment.id, attachment.messageId, attachment.name, attachment.mediaType, attachment.url, attachment.bytes ?? 0, JSON.stringify(attachment)]);
      }
      for (const relay of this.chatbase.relays) {
        await client.query('INSERT INTO relays (id, raw_json, updated_at) VALUES ($1, $2::jsonb, NOW());', [relay.id, JSON.stringify(relay)]);
      }
      for (const handoff of this.chatbase.handoffs) {
        await client.query('INSERT INTO handoffs (id, raw_json, updated_at) VALUES ($1, $2::jsonb, NOW());', [handoff.id, JSON.stringify(handoff)]);
      }
      for (const event of this.chatbase.messageEvents) {
        await client.query('INSERT INTO message_events (id, event_type, message_id, occurred_at, source_json, raw_json, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW());', [event.id, event.type, event.messageId ?? null, event.occurredAt, JSON.stringify(event.source ?? {}), JSON.stringify(event)]);
      }
    });
    await this.reload();
  }

  async close() {
    await this.pool.end();
  }
}
