import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  validateDirectConversationCreateInput,
  validateDiscordEventInput,
  validateExternalReferenceCreateInput,
  validateMessageCreateInput,
  validatePostCreateInput,
  validateThreadCreateInput
} from '../../../../packages/contracts/src/index.mjs';
import { createId } from './ids.mjs';
import { ensureJsonFile, readJson, writeJson } from './json-store.mjs';
import { assertReadableScope, assertWritableScope, canReadChannel, canReadDirectConversation } from './policy.mjs';

function nowIso() {
  return new Date().toISOString();
}

export class NexusStore {
  constructor({ dataDir, bootstrapPath }) {
    this.dataDir = dataDir;
    this.bootstrapPath = bootstrapPath;
    this.metabasePath = join(dataDir, 'metabase.json');
    this.chatbasePath = join(dataDir, 'chatbase.json');
    this.metabase = null;
    this.chatbase = null;
  }

  async init() {
    const bootstrap = JSON.parse(await readFile(this.bootstrapPath, 'utf8'));
    const seedMetabase = {
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
    const seedChatbase = {
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

    await ensureJsonFile(this.metabasePath, seedMetabase);
    await ensureJsonFile(this.chatbasePath, seedChatbase);

    this.metabase = await readJson(this.metabasePath);
    this.chatbase = await readJson(this.chatbasePath);
  }

  async saveMetabase() {
    this.metabase.updatedAt = nowIso();
    await writeJson(this.metabasePath, this.metabase);
  }

  async saveChatbase() {
    this.chatbase.updatedAt = nowIso();
    await writeJson(this.chatbasePath, this.chatbase);
  }

  getIdentity(actorId) {
    return this.metabase.identities.find((identity) => identity.id === actorId) ?? null;
  }

  getBootstrapSummary() {
    return {
      roles: this.metabase.roles,
      identities: this.metabase.identities,
      workspaces: this.metabase.workspaces,
      channels: this.metabase.channels,
      memberships: this.metabase.memberships,
      adapterEndpoints: this.metabase.adapterEndpoints
    };
  }

  listIdentities() {
    return this.metabase.identities;
  }

  listWorkspaces(actorId) {
    return this.metabase.workspaces.filter((workspace) => {
      return this.metabase.memberships.some((membership) => {
        return membership.scopeType === 'workspace' &&
          membership.scopeId === workspace.id &&
          membership.identityId === actorId;
      });
    });
  }

  listChannels(actorId, workspaceId) {
    return this.metabase.channels.filter((channel) => {
      return channel.workspaceId === workspaceId && canReadChannel(this.metabase, actorId, channel);
    });
  }

  listDirectConversations(actorId) {
    return this.metabase.directConversations.filter((directConversation) => {
      return canReadDirectConversation(this.metabase, actorId, directConversation);
    });
  }

  listPosts(actorId, channelId) {
    assertReadableScope(this, actorId, 'channel', channelId);
    return this.chatbase.posts.filter((post) => post.channelId === channelId);
  }

  listThreads(actorId, { channelId, postId }) {
    const scopeType = postId ? 'post' : 'channel';
    const scopeId = postId ?? channelId;
    assertReadableScope(this, actorId, scopeType, scopeId);

    return this.chatbase.threads.filter((thread) => {
      if (postId) {
        return thread.postId === postId;
      }
      return thread.channelId === channelId;
    });
  }

  listMessages(actorId, scopeType, scopeId) {
    assertReadableScope(this, actorId, scopeType, scopeId);
    return this.chatbase.messages.filter((message) => {
      return message.scopeType === scopeType && message.scopeId === scopeId;
    });
  }

  listExternalReferences(actorId, ownerType, ownerId) {
    if (ownerType === 'message') {
      const message = this.chatbase.messages.find((entry) => entry.id === ownerId);
      if (!message) {
        throw new Error('Message not found for external reference lookup.');
      }
      assertReadableScope(this, actorId, message.scopeType, message.scopeId);
    }
    else if (ownerType === 'channel') {
      assertReadableScope(this, actorId, 'channel', ownerId);
    }
    else if (ownerType === 'post' || ownerType === 'thread' || ownerType === 'direct') {
      const normalizedScopeType = ownerType === 'direct' ? 'direct' : ownerType;
      assertReadableScope(this, actorId, normalizedScopeType, ownerId);
    }

    return this.metabase.externalReferences.filter((reference) => {
      return reference.ownerType === ownerType && reference.ownerId === ownerId;
    });
  }

  searchMessages(actorId, query) {
    const lower = query.trim().toLowerCase();
    return this.chatbase.messages.filter((message) => {
      if (!message.body.toLowerCase().includes(lower)) {
        return false;
      }
      try {
        assertReadableScope(this, actorId, message.scopeType, message.scopeId);
        return true;
      }
      catch {
        return false;
      }
    });
  }

  async createMessage(input) {
    validateMessageCreateInput(input);
    assertWritableScope(this, input.actorId, input.scopeType, input.scopeId);
    const timestamp = nowIso();

    const attachments = (input.attachments ?? []).map((attachment) => {
      return {
        id: createId('attachment'),
        messageId: '',
        name: attachment.name ?? 'attachment',
        mediaType: attachment.mediaType ?? 'application/octet-stream',
        url: attachment.url ?? '',
        bytes: attachment.bytes ?? 0
      };
    });

    const message = {
      id: createId('message'),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      authorIdentityId: input.actorId,
      body: input.body,
      createdAt: timestamp,
      source: input.source ?? { system: 'nexus', transport: 'local-service' },
      attachmentIds: attachments.map((attachment) => attachment.id)
    };

    for (const attachment of attachments) {
      attachment.messageId = message.id;
    }

    const event = {
      id: createId('event'),
      type: 'message.created',
      messageId: message.id,
      occurredAt: timestamp,
      source: message.source
    };

    this.chatbase.messages.push(message);
    this.chatbase.attachments.push(...attachments);
    this.chatbase.messageEvents.push(event);
    await this.saveChatbase();
    return { message, attachments, event };
  }

  async createPost(input) {
    validatePostCreateInput(input);
    assertWritableScope(this, input.actorId, 'channel', input.channelId);

    const post = {
      id: createId('post'),
      channelId: input.channelId,
      title: input.title,
      createdAt: nowIso(),
      createdByIdentityId: input.actorId
    };

    this.chatbase.posts.push(post);
    const created = await this.createMessage({
      actorId: input.actorId,
      scopeType: 'post',
      scopeId: post.id,
      body: input.body
    });

    await this.saveChatbase();
    return { post, initialMessage: created.message };
  }

  async createThread(input) {
    validateThreadCreateInput(input);
    if (input.postId) {
      assertWritableScope(this, input.actorId, 'post', input.postId);
    }
    else {
      assertWritableScope(this, input.actorId, 'channel', input.channelId);
    }

    const thread = {
      id: createId('thread'),
      channelId: input.channelId ?? null,
      postId: input.postId ?? null,
      title: input.title ?? 'Thread',
      createdAt: nowIso(),
      createdByIdentityId: input.actorId
    };

    this.chatbase.threads.push(thread);
    await this.saveChatbase();
    return thread;
  }

  async createDirectConversation(input) {
    validateDirectConversationCreateInput(input);
    if (!input.memberIdentityIds.includes(input.actorId)) {
      throw new Error('The creating actor must be part of the direct conversation.');
    }

    const directConversation = {
      id: createId('direct'),
      memberIdentityIds: [...new Set(input.memberIdentityIds)],
      createdAt: nowIso(),
      createdByIdentityId: input.actorId
    };

    this.metabase.directConversations.push(directConversation);
    await this.saveMetabase();
    return directConversation;
  }

  async createExternalReference(input) {
    validateExternalReferenceCreateInput(input);

    if (input.ownerType === 'message') {
      const message = this.chatbase.messages.find((entry) => entry.id === input.ownerId);
      if (!message) {
        throw new Error('Cannot attach an external reference to a missing message.');
      }
      assertReadableScope(this, input.actorId, message.scopeType, message.scopeId);
    }
    else if (input.ownerType === 'channel') {
      assertReadableScope(this, input.actorId, 'channel', input.ownerId);
    }
    else if (input.ownerType === 'post' || input.ownerType === 'thread' || input.ownerType === 'direct') {
      const normalizedScopeType = input.ownerType === 'direct' ? 'direct' : input.ownerType;
      assertReadableScope(this, input.actorId, normalizedScopeType, input.ownerId);
    }

    const externalReference = {
      id: createId('xref'),
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      system: input.system,
      relationType: input.relationType,
      externalId: input.externalId,
      url: input.url,
      title: input.title,
      createdByIdentityId: input.actorId,
      createdAt: nowIso()
    };

    this.metabase.externalReferences.push(externalReference);
    await this.saveMetabase();
    return externalReference;
  }

  async ingestDiscordEvent(input) {
    validateDiscordEventInput(input);
    const endpoint = this.metabase.adapterEndpoints.find((adapter) => adapter.system === 'discord');
    const mapping = endpoint?.channelMappings.find((entry) => entry.externalChannelId === input.externalChannelId);
    if (!mapping) {
      throw new Error(`No Discord channel mapping found for ${input.externalChannelId}.`);
    }

    const created = await this.createMessage({
      actorId: input.actorId,
      scopeType: 'channel',
      scopeId: mapping.channelId,
      body: input.content,
      attachments: input.attachments ?? [],
      source: {
        system: 'discord',
        externalChannelId: input.externalChannelId,
        externalMessageId: input.externalMessageId
      }
    });

    return created.message;
  }
}
