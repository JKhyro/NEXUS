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
    storageMode: 'library-postgres',
    libraryConnectionString: 'postgresql://example:secret@127.0.0.1:5432/library',
    libraryChatbaseSchema: 'nexus_chatbase_cfg',
    libraryMetabaseSchema: 'nexus_metabase_cfg'
  }, null, 2));

  const resolved = resolveServiceConfig({ configPath, port: 0 });
  assert.equal(resolved.storageMode, 'library-postgres');
  assert.equal(resolved.libraryConnectionString, 'postgresql://example:secret@127.0.0.1:5432/library');
  assert.equal(resolved.libraryChatbaseSchema, 'nexus_chatbase_cfg');
  assert.equal(resolved.libraryMetabaseSchema, 'nexus_metabase_cfg');
});
