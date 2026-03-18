import {
  validateDirectConversationCreateInput,
  validateDiscordEventInput,
  validateExternalReferenceCreateInput,
  validateHandoffCreateInput,
  validateMessageCreateInput,
  validatePostCreateInput,
  validateRelayCreateInput,
  validateThreadCreateInput
} from '../../../../packages/contracts/src/index.mjs';
import { createId } from './ids.mjs';
import { assertReadableScope, assertWritableScope, canReadChannel, canReadDirectConversation } from './policy.mjs';

function nowIso() {
  return new Date().toISOString();
}

function timestampValue(value) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordTouchesScope(record, scopeType, scopeId) {
  const candidates = [
    [record.scopeType, record.scopeId],
    [record.fromScopeType, record.fromScopeId],
    [record.toScopeType, record.toScopeId],
    [record.sourceScopeType, record.sourceScopeId],
    [record.targetScopeType, record.targetScopeId],
    [record.scope?.scopeType, record.scope?.scopeId],
    [record.scope?.type, record.scope?.id],
    [record.fromScope?.scopeType, record.fromScope?.scopeId],
    [record.fromScope?.type, record.fromScope?.id],
    [record.toScope?.scopeType, record.toScope?.scopeId],
    [record.toScope?.type, record.toScope?.id],
    [record.source?.scopeType, record.source?.scopeId],
    [record.source?.type, record.source?.id],
    [record.target?.scopeType, record.target?.scopeId],
    [record.target?.type, record.target?.id]
  ];

  return candidates.some(([candidateType, candidateId]) => {
    return candidateType === scopeType && candidateId === scopeId;
  });
}

function sortByRecentTimestamp(left, right) {
  return timestampValue(right?.recentAt) - timestampValue(left?.recentAt);
}

export class BaseNexusStore {
  constructor() {
    this.metabase = null;
    this.chatbase = null;
  }

  async init() {
    throw new Error('BaseNexusStore.init must be implemented by a subclass.');
  }

  async saveMetabase() {
    throw new Error('BaseNexusStore.saveMetabase must be implemented by a subclass.');
  }

  async saveChatbase() {
    throw new Error('BaseNexusStore.saveChatbase must be implemented by a subclass.');
  }

  async close() {
    // Optional lifecycle hook for subclasses that hold external resources.
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

  listActivity(actorId, workspaceId) {
    const channels = this.listChannels(actorId, workspaceId);
    const directConversations = this.listDirectConversations(actorId);
    const channelIds = new Set(channels.map((channel) => channel.id));
    const directConversationIds = new Set(directConversations.map((conversation) => conversation.id));
    const postsById = new Map(this.chatbase.posts.map((post) => [post.id, post]));
    const channelThreads = new Map();
    const directMessages = new Map();
    const channelMessages = new Map();

    for (const thread of this.chatbase.threads) {
      const parentChannelId = thread.channelId ?? postsById.get(thread.postId ?? '')?.channelId ?? null;
      if (!parentChannelId || !channelIds.has(parentChannelId)) {
        continue;
      }

      const list = channelThreads.get(parentChannelId) ?? [];
      list.push(thread);
      channelThreads.set(parentChannelId, list);
    }

    for (const message of this.chatbase.messages) {
      if (message.scopeType === 'direct' && directConversationIds.has(message.scopeId)) {
        const list = directMessages.get(message.scopeId) ?? [];
        list.push(message);
        directMessages.set(message.scopeId, list);
        continue;
      }

      let channelId = null;
      if (message.scopeType === 'channel') {
        channelId = message.scopeId;
      }
      else if (message.scopeType === 'post') {
        channelId = postsById.get(message.scopeId)?.channelId ?? null;
      }
      else if (message.scopeType === 'thread') {
        const thread = this.chatbase.threads.find((entry) => entry.id === message.scopeId);
        channelId = thread?.channelId ?? postsById.get(thread?.postId ?? '')?.channelId ?? null;
      }

      if (!channelId || !channelIds.has(channelId)) {
        continue;
      }

      const list = channelMessages.get(channelId) ?? [];
      list.push(message);
      channelMessages.set(channelId, list);
    }

    const channelActivity = channels.map((channel) => {
      const latestMessage = [...(channelMessages.get(channel.id) ?? [])]
        .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt))[0] ?? null;
      const latestThread = [...(channelThreads.get(channel.id) ?? [])]
        .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt))[0] ?? null;

      let recentAt = latestMessage?.createdAt ?? null;
      let preview = latestMessage?.body?.trim() || null;
      let previewAuthorIdentityId = latestMessage?.authorIdentityId ?? null;
      let messageId = latestMessage?.id ?? null;
      let postId = null;
      let threadId = null;
      let activityKind = latestMessage ? 'message' : 'channel';

      if (latestMessage?.scopeType === 'post') {
        postId = latestMessage.scopeId;
      }
      else if (latestMessage?.scopeType === 'thread') {
        threadId = latestMessage.scopeId;
        postId = this.chatbase.threads.find((thread) => thread.id === latestMessage.scopeId)?.postId ?? null;
      }

      if ((!recentAt || !messageId) && latestThread?.createdAt && timestampValue(latestThread.createdAt) > timestampValue(recentAt)) {
        recentAt = latestThread.createdAt;
        preview = `Thread created: ${latestThread.title}`;
        previewAuthorIdentityId = latestThread.createdByIdentityId;
        threadId = latestThread.id;
        postId = latestThread.postId ?? null;
        messageId = null;
        activityKind = 'thread-created';
      }

      return {
        scopeType: 'channel',
        scopeId: channel.id,
        channelId: channel.id,
        directConversationId: null,
        label: channel.name,
        kind: channel.kind,
        description: channel.description ?? '',
        recentAt,
        preview,
        previewAuthorIdentityId,
        messageId,
        postId,
        threadId,
        activityKind
      };
    });

    const directActivity = directConversations.map((conversation) => {
      const latestMessage = [...(directMessages.get(conversation.id) ?? [])]
        .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt))[0] ?? null;

      return {
        scopeType: 'direct',
        scopeId: conversation.id,
        channelId: null,
        directConversationId: conversation.id,
        label: conversation.id,
        kind: 'direct',
        description: '',
        recentAt: latestMessage?.createdAt ?? conversation.createdAt ?? null,
        preview: latestMessage?.body?.trim() || (conversation.createdAt ? 'Direct conversation started.' : null),
        previewAuthorIdentityId: latestMessage?.authorIdentityId ?? conversation.createdByIdentityId ?? null,
        messageId: latestMessage?.id ?? null,
        postId: null,
        threadId: null,
        activityKind: latestMessage ? 'message' : 'conversation-created'
      };
    });

    return [...channelActivity, ...directActivity].filter((entry) => entry.recentAt).sort((left, right) => {
      const byTime = sortByRecentTimestamp(left, right);
      if (byTime !== 0) {
        return byTime;
      }

      return String(left.label ?? '').localeCompare(String(right.label ?? ''));
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

  hydrateMessageAttachments(messages) {
    return messages.map((message) => {
      const attachments = this.chatbase.attachments.filter((attachment) => {
        return attachment.messageId === message.id || (message.attachmentIds ?? []).includes(attachment.id);
      });
      return {
        ...message,
        attachments
      };
    });
  }

  listMessages(actorId, scopeType, scopeId) {
    assertReadableScope(this, actorId, scopeType, scopeId);
    const messages = this.chatbase.messages.filter((message) => {
      return message.scopeType === scopeType && message.scopeId === scopeId;
    });
    return this.hydrateMessageAttachments(messages);
  }

  getMessage(actorId, messageId) {
    const message = this.chatbase.messages.find((entry) => entry.id === messageId);
    if (!message) {
      throw new Error('Message not found.');
    }

    assertReadableScope(this, actorId, message.scopeType, message.scopeId);
    return this.hydrateMessageAttachments([message])[0];
  }

  listRelays(actorId, scopeType, scopeId) {
    assertReadableScope(this, actorId, scopeType, scopeId);
    return this.chatbase.relays.filter((relay) => recordTouchesScope(relay, scopeType, scopeId));
  }

  listHandoffs(actorId, scopeType, scopeId) {
    assertReadableScope(this, actorId, scopeType, scopeId);
    return this.chatbase.handoffs.filter((handoff) => recordTouchesScope(handoff, scopeType, scopeId));
  }

  async createRelay(input) {
    validateRelayCreateInput(input);
    assertReadableScope(this, input.actorId, input.scopeType, input.scopeId);
    if (input.toScopeType && input.toScopeId) {
      assertReadableScope(this, input.actorId, input.toScopeType, input.toScopeId);
    }
    if (input.fromScopeType && input.fromScopeId) {
      assertReadableScope(this, input.actorId, input.fromScopeType, input.fromScopeId);
    }

    const relay = {
      id: createId('relay'),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      fromScopeType: input.fromScopeType ?? null,
      fromScopeId: input.fromScopeId ?? null,
      toScopeType: input.toScopeType ?? null,
      toScopeId: input.toScopeId ?? null,
      actorIdentityId: input.actorId,
      messageId: input.messageId ?? null,
      reason: input.reason,
      occurredAt: input.occurredAt ?? nowIso(),
      source: input.source ?? { system: 'nexus', transport: 'local-service' },
      raw: input.raw ?? {}
    };

    this.chatbase.relays.push(relay);
    await this.saveChatbase();
    return relay;
  }

  async createHandoff(input) {
    validateHandoffCreateInput(input);
    assertWritableScope(this, input.actorId, input.scopeType, input.scopeId);

    const handoff = {
      id: createId('handoff'),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      fromIdentityId: input.fromIdentityId ?? input.actorId,
      toIdentityId: input.toIdentityId,
      messageId: input.messageId ?? null,
      rationale: input.rationale,
      createdAt: input.createdAt ?? nowIso(),
      source: input.source ?? { system: 'nexus', transport: 'local-service' },
      raw: input.raw ?? {}
    };

    this.chatbase.handoffs.push(handoff);
    await this.saveChatbase();
    return handoff;
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
    const messages = this.chatbase.messages.filter((message) => {
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
    return this.hydrateMessageAttachments(messages);
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
      body: input.body,
      attachments: input.attachments ?? []
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

    const source = {
      system: 'discord',
      adapterEndpointId: endpoint?.id ?? null,
      externalChannelId: input.externalChannelId,
      externalMessageId: input.externalMessageId,
      direction: 'ingest'
    };

    const created = await this.createMessage({
      actorId: input.actorId,
      scopeType: 'channel',
      scopeId: mapping.channelId,
      body: input.content,
      attachments: input.attachments ?? [],
      source
    });

    const relay = await this.createRelay({
      actorId: input.actorId,
      scopeType: 'channel',
      scopeId: mapping.channelId,
      toScopeType: 'channel',
      toScopeId: mapping.channelId,
      messageId: created.message.id,
      occurredAt: created.message.createdAt,
      reason: input.relayReason ?? 'Discord adapter ingress',
      source,
      raw: {
        eventType: input.type
      }
    });

    let handoff = null;
    if (input.handoff) {
      handoff = await this.createHandoff({
        actorId: input.actorId,
        scopeType: 'channel',
        scopeId: mapping.channelId,
        fromIdentityId: input.handoff.fromIdentityId ?? input.actorId,
        toIdentityId: input.handoff.toIdentityId,
        messageId: created.message.id,
        createdAt: created.message.createdAt,
        rationale: input.handoff.rationale,
        source,
        raw: {
          eventType: input.type
        }
      });
    }

    return {
      ...created.message,
      relayId: relay.id,
      handoffId: handoff?.id ?? null
    };
  }
}
