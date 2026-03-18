import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNexusService } from '../apps/service/src/server.mjs';
import { resolveServiceConfig } from '../apps/service/src/lib/config.mjs';
import { createStore } from '../apps/service/src/lib/store-factory.mjs';

async function withService(run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'nexus-'));
  const service = await createNexusService({ dataDir, port: 0, storageMode: 'json' });
  await service.start();
  try {
    await run(service);
  }
  finally {
    await service.stop();
  }
}

test('service boots and exposes the seeded internal channel map', async () => {
  await withService(async (service) => {
    const health = await fetch(`${service.url}/api/health`).then((response) => response.json());
    assert.equal(health.status, 'ok');

    const workspaces = await fetch(`${service.url}/api/workspaces?actorId=identity-jack`).then((response) => response.json());
    assert.equal(workspaces.length, 1);

    const channels = await fetch(`${service.url}/api/channels?actorId=identity-jack&workspaceId=workspace-internal-core`).then((response) => response.json());
    const slugs = new Set(channels.map((channel) => channel.slug));
    assert(slugs.has('workflow'));
    assert(slugs.has('report'));
    assert(slugs.has('investigation'));
    assert(slugs.has('digest-agent'));
    assert(slugs.has('hera'));
    assert(slugs.has('librarian'));
  });
});

test('messages persist across service restarts', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nexus-'));

  let service = await createNexusService({ dataDir, port: 0, storageMode: 'json' });
  await service.start();
  await fetch(`${service.url}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      actorId: 'identity-jack',
      scopeType: 'channel',
      scopeId: 'channel-workflow',
      body: 'Persistence check'
    })
  });
  await service.stop();

  service = await createNexusService({ dataDir, port: 0, storageMode: 'json' });
  await service.start();
  try {
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=channel&scopeId=channel-workflow`).then((response) => response.json());
    assert(messages.some((message) => message.body === 'Persistence check'));
  }
  finally {
    await service.stop();
  }
});

test('private channel reads are blocked by access policy', async () => {
  await withService(async (service) => {
    const response = await fetch(`${service.url}/api/messages?actorId=identity-yura&scopeType=channel&scopeId=channel-hera`);
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.match(body.error, /not allowed/i);
  });
});

test('channel write policy can be narrower than channel read policy', async () => {
  await withService(async (service) => {
    const readable = await fetch(`${service.url}/api/messages?actorId=identity-librarian&scopeType=channel&scopeId=channel-investigation`);
    assert.equal(readable.status, 200);

    const writeAttempt = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-librarian',
        scopeType: 'channel',
        scopeId: 'channel-investigation',
        body: 'Curator note in a read-only lane'
      })
    });
    const body = await writeAttempt.json();
    assert.equal(writeAttempt.status, 500);
    assert.match(body.error, /write/i);
  });
});

test('discord adapter ingress maps transport events into NEXUS channels', async () => {
  await withService(async (service) => {
    await fetch(`${service.url}/api/adapters/discord/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'message.created',
        externalChannelId: '1481091195013955664',
        externalMessageId: 'discord-123',
        actorId: 'identity-kira',
        content: 'Adapter ingress message'
      })
    });

    const messages = await fetch(`${service.url}/api/messages?actorId=identity-kira&scopeType=channel&scopeId=channel-workflow`).then((response) => response.json());
    const found = messages.find((message) => message.body === 'Adapter ingress message');
    assert(found);
    assert.equal(found.source.system, 'discord');
  });
});

test('ANVIL references can attach to readable messages', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Attach ANVIL reference'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'message',
        ownerId: created.message.id,
        system: 'anvil',
        relationType: 'tracks',
        externalId: 'ANVIL-42',
        url: 'https://example.invalid/anvil/42',
        title: 'ANVIL work item'
      })
    });

    const references = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=message&ownerId=${created.message.id}`).then((response) => response.json());
    assert.equal(references.length, 1);
    assert.equal(references[0].system, 'anvil');
  });
});

test('external references can attach to channel, post, thread, and direct owners', async () => {
  await withService(async (service) => {
    const post = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Reference owner post',
        body: 'Open a post for reference ownership checks.'
      })
    }).then((response) => response.json());

    const thread = await fetch(`${service.url}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        postId: post.post.id,
        title: 'Reference owner thread'
      })
    }).then((response) => response.json());

    const directConversation = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'channel',
        ownerId: 'channel-requests',
        system: 'github',
        relationType: 'tracks',
        externalId: 'JKhyro/NEXUS#29',
        url: 'https://github.com/JKhyro/NEXUS/issues/29',
        title: 'Attachment follow-up issue'
      })
    });

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'post',
        ownerId: post.post.id,
        system: 'anvil',
        relationType: 'relatesTo',
        externalId: 'ANVIL-77',
        url: 'https://example.invalid/anvil/77',
        title: 'Post context'
      })
    });

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'thread',
        ownerId: thread.id,
        system: 'github',
        relationType: 'implements',
        externalId: 'JKhyro/NEXUS#30',
        url: 'https://github.com/JKhyro/NEXUS/issues/30',
        title: 'Thread implementation'
      })
    });

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-kira',
        ownerType: 'direct',
        ownerId: directConversation.id,
        system: 'discord',
        relationType: 'mirrors',
        externalId: 'discord-direct-123',
        url: 'https://discord.com/channels/example',
        title: 'Legacy direct mirror'
      })
    });

    const channelReferences = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=channel&ownerId=channel-requests`).then((response) => response.json());
    const postReferences = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=post&ownerId=${post.post.id}`).then((response) => response.json());
    const threadReferences = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=thread&ownerId=${thread.id}`).then((response) => response.json());
    const directReferences = await fetch(`${service.url}/api/external-references?actorId=identity-kira&ownerType=direct&ownerId=${directConversation.id}`).then((response) => response.json());

    assert.equal(channelReferences.length, 1);
    assert.equal(channelReferences[0].system, 'github');
    assert.equal(postReferences.length, 1);
    assert.equal(postReferences[0].system, 'anvil');
    assert.equal(threadReferences.length, 1);
    assert.equal(threadReferences[0].relationType, 'implements');
    assert.equal(directReferences.length, 1);
    assert.equal(directReferences[0].system, 'discord');
  });
});

test('relays and handoffs can be listed for a readable scope', async () => {
  await withService(async (service) => {
    service.store.chatbase.relays.push(
      {
        id: 'relay-report-requests',
        fromScopeType: 'channel',
        fromScopeId: 'channel-report',
        toScopeType: 'channel',
        toScopeId: 'channel-requests',
        reason: 'Escalated for tracked action',
        occurredAt: '2026-03-18T00:00:00.000Z',
        source: { system: 'discord', externalChannelId: '1481840691066700038' }
      },
      {
        id: 'relay-general-workflow',
        fromScopeType: 'channel',
        fromScopeId: 'channel-general',
        toScopeType: 'channel',
        toScopeId: 'channel-workflow',
        reason: 'Unrelated relay',
        occurredAt: '2026-03-18T00:05:00.000Z'
      }
    );
    service.store.chatbase.handoffs.push(
      {
        id: 'handoff-requests-librarian',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        fromIdentityId: 'identity-kira',
        toIdentityId: 'identity-librarian',
        rationale: 'Needs curator review',
        createdAt: '2026-03-18T00:10:00.000Z'
      },
      {
        id: 'handoff-general-yura',
        scopeType: 'channel',
        scopeId: 'channel-general',
        fromIdentityId: 'identity-kira',
        toIdentityId: 'identity-yura',
        rationale: 'Unrelated handoff',
        createdAt: '2026-03-18T00:20:00.000Z'
      }
    );
    await service.store.saveChatbase();

    const relays = await fetch(`${service.url}/api/relays?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());
    const handoffs = await fetch(`${service.url}/api/handoffs?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());

    assert.equal(relays.length, 1);
    assert.equal(relays[0].id, 'relay-report-requests');
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].id, 'handoff-requests-librarian');
  });
});

test('messages expose inline attachments through read and search flows', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Attachment-bearing message',
        attachments: [
          {
            name: 'trace.txt',
            mediaType: 'text/plain',
            url: 'https://example.invalid/trace.txt',
            bytes: 512
          }
        ]
      })
    }).then((response) => response.json());

    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());
    const searchResults = await fetch(`${service.url}/api/search?actorId=identity-jack&q=${encodeURIComponent('Attachment-bearing message')}`).then((response) => response.json());

    const message = messages.find((entry) => entry.id === created.message.id);
    const match = searchResults.find((entry) => entry.id === created.message.id);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].name, 'trace.txt');
    assert.equal(match.attachments.length, 1);
    assert.equal(match.attachments[0].url, 'https://example.invalid/trace.txt');
  });
});

test('forum posts can be created and read through the shared service contract', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Import fidelity check',
        body: 'This is the opening message for a report post.',
        attachments: [
          {
            name: 'report-screenshot.png',
            mediaType: 'image/png',
            url: 'https://example.invalid/report-screenshot.png',
            bytes: 2048
          }
        ]
      })
    }).then((response) => response.json());

    const posts = await fetch(`${service.url}/api/posts?actorId=identity-jack&channelId=channel-report`).then((response) => response.json());
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=post&scopeId=${created.post.id}`).then((response) => response.json());

    assert(posts.some((post) => post.id === created.post.id && post.title === 'Import fidelity check'));
    const openingMessage = messages.find((message) => message.body === 'This is the opening message for a report post.');
    assert(openingMessage);
    assert.equal(openingMessage.attachments.length, 1);
    assert.equal(openingMessage.attachments[0].name, 'report-screenshot.png');
  });
});

test('direct conversations can be created, listed, and messaged through the shared service contract', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-kira',
        scopeType: 'direct',
        scopeId: created.id,
        body: 'Direct conversation test message'
      })
    });

    const conversations = await fetch(`${service.url}/api/direct-conversations?actorId=identity-kira`).then((response) => response.json());
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=direct&scopeId=${created.id}`).then((response) => response.json());

    assert(conversations.some((conversation) => conversation.id === created.id));
    assert(messages.some((message) => message.body === 'Direct conversation test message'));
  });
});

test('threads can be created and read through the shared service contract', async () => {
  await withService(async (service) => {
    const post = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Thread parent post',
        body: 'Opening post body'
      })
    }).then((response) => response.json());

    const thread = await fetch(`${service.url}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        postId: post.post.id,
        title: 'Follow-up thread'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'thread',
        scopeId: thread.id,
        body: 'Threaded follow-up message'
      })
    });

    const threads = await fetch(`${service.url}/api/threads?actorId=identity-jack&postId=${post.post.id}`).then((response) => response.json());
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=thread&scopeId=${thread.id}`).then((response) => response.json());

    assert(threads.some((entry) => entry.id === thread.id && entry.title === 'Follow-up thread'));
    assert(messages.some((message) => message.body === 'Threaded follow-up message'));
  });
});

test('store factory defaults to JSON mode and validates library-postgres configuration', async () => {
  const jsonStore = createStore({
    storageMode: 'json',
    dataDir: 'runtime',
    bootstrapPath: 'config/internal-bootstrap.json'
  });
  assert.equal(jsonStore.constructor.name, 'NexusJsonStore');

  assert.throws(() => {
    createStore({
      storageMode: 'library-postgres',
      bootstrapPath: 'config/internal-bootstrap.json',
      libraryConnectionString: ''
    });
  }, /NEXUS_LIBRARY_CONNECTION_STRING/);
});

test('service config can load library-postgres settings from a local config file', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'nexus-config-'));
  const configPath = join(configDir, 'nexus.local.json');
  await writeFile(configPath, JSON.stringify({
    deploymentMode: 'hosted',
    host: '0.0.0.0',
    port: 45210,
    staticMode: 'disabled',
    publicOrigin: 'https://nexus.example.invalid',
    allowedOrigins: ['https://nexus.example.invalid', 'https://desktop.example.invalid'],
    storageMode: 'library-postgres',
    libraryConnectionString: 'postgresql://example:secret@127.0.0.1:5432/library',
    libraryChatbaseSchema: 'nexus_chatbase_cfg',
    libraryMetabaseSchema: 'nexus_metabase_cfg'
  }, null, 2));

  const resolved = resolveServiceConfig({ configPath, port: 0 });
  assert.equal(resolved.deploymentMode, 'hosted');
  assert.equal(resolved.host, '0.0.0.0');
  assert.equal(resolved.storageMode, 'library-postgres');
  assert.equal(resolved.staticMode, 'disabled');
  assert.equal(resolved.publicOrigin, 'https://nexus.example.invalid');
  assert.deepEqual(resolved.allowedOrigins, ['https://nexus.example.invalid', 'https://desktop.example.invalid']);
  assert.equal(resolved.libraryConnectionString, 'postgresql://example:secret@127.0.0.1:5432/library');
  assert.equal(resolved.libraryChatbaseSchema, 'nexus_chatbase_cfg');
  assert.equal(resolved.libraryMetabaseSchema, 'nexus_metabase_cfg');
});

test('service can boot in hosted mode with API-only serving and CORS', async () => {
  const hosted = await createNexusService({
    dataDir: await mkdtemp(join(tmpdir(), 'nexus-hosted-')),
    port: 0,
    storageMode: 'json',
    deploymentMode: 'hosted',
    host: '127.0.0.1',
    staticMode: 'disabled',
    publicOrigin: 'https://nexus.example.invalid',
    allowedOrigins: ['https://nexus.example.invalid']
  });

  await hosted.start();
  try {
    const healthResponse = await fetch(`${hosted.url}/api/health`, {
      headers: {
        origin: 'https://nexus.example.invalid'
      }
    });
    const health = await healthResponse.json();
    assert.equal(health.deploymentMode, 'hosted');
    assert.equal(health.staticMode, 'disabled');
    assert.equal(healthResponse.headers.get('access-control-allow-origin'), 'https://nexus.example.invalid');

    const options = await fetch(`${hosted.url}/api/health`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://nexus.example.invalid'
      }
    });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), 'https://nexus.example.invalid');

    const root = await fetch(`${hosted.url}/`);
    assert.equal(root.status, 404);
  }
  finally {
    await hosted.stop();
  }
});
