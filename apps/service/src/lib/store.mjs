import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureJsonFile, readJson, writeJson } from './json-store.mjs';
import { BaseNexusStore } from './base-store.mjs';
import { syncBootstrapMetabase } from './bootstrap-sync.mjs';

function nowIso() {
  return new Date().toISOString();
}

export class NexusJsonStore extends BaseNexusStore {
  constructor({ dataDir, bootstrapPath }) {
    super();
    this.dataDir = dataDir;
    this.bootstrapPath = bootstrapPath;
    this.metabasePath = join(dataDir, 'metabase.json');
    this.chatbasePath = join(dataDir, 'chatbase.json');
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

    const synced = syncBootstrapMetabase(this.metabase, bootstrap, nowIso());
    if (synced.changed) {
      this.metabase = synced.metabase;
      await this.saveMetabase();
    }
  }

  async saveMetabase() {
    this.metabase.updatedAt = nowIso();
    await writeJson(this.metabasePath, this.metabase);
  }

  async saveChatbase() {
    this.chatbase.updatedAt = nowIso();
    await writeJson(this.chatbasePath, this.chatbase);
  }
}
