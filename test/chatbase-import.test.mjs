import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDiscordChannelMap,
  buildDiscordForumImportRules,
  buildDiscordThreadParentMap,
  buildImportedIdentity,
  buildImportedRelayRecord,
  matchDiscordAuthorToIdentity,
  resolveDiscordForumImportTarget
} from '../apps/service/src/lib/chatbase-import.mjs';
import { syncBootstrapMetabase } from '../apps/service/src/lib/bootstrap-sync.mjs';

test('buildDiscordChannelMap flattens Discord adapter mappings', () => {
  const channelMap = buildDiscordChannelMap({
    adapterEndpoints: [
      {
        system: 'discord',
        channelMappings: [
          { externalChannelId: '1481091195013955664', channelId: 'channel-workflow' },
          { externalChannelId: '1481093718919483616', channelId: 'channel-requests' }
        ]
      },
      {
        system: 'github',
        channelMappings: [
          { externalChannelId: 'ignored', channelId: 'ignored' }
        ]
      }
    ]
  });

  assert.equal(channelMap.get('1481091195013955664'), 'channel-workflow');
  assert.equal(channelMap.get('1481093718919483616'), 'channel-requests');
  assert.equal(channelMap.has('ignored'), false);
});

test('buildDiscordForumImportRules collects Discord forum routing rules', () => {
  const rules = buildDiscordForumImportRules({
    adapterEndpoints: [
      {
        system: 'discord',
        forumThreadImportRules: [
          { id: 'rule-one', channelId: 'channel-investigation' },
          { id: 'rule-two', channelId: 'channel-library', default: true }
        ]
      },
      {
        system: 'github',
        forumThreadImportRules: [{ id: 'ignored', channelId: 'channel-ignored' }]
      }
    ]
  });

  assert.equal(rules.length, 2);
  assert.equal(rules[0].id, 'rule-one');
  assert.equal(rules[1].channelId, 'channel-library');
});

test('buildDiscordThreadParentMap prefers retained parent metadata when present', () => {
  const parentMap = buildDiscordThreadParentMap([
    {
      channel_id: '1481138305155338320',
      parent_channel_id: '1481091195013955664'
    },
    {
      channel_id: '1481168107031494787',
      parent_channel_id: '1481883341161631844'
    }
  ]);

  assert.equal(parentMap.get('1481138305155338320'), '1481091195013955664');
  assert.equal(parentMap.get('1481168107031494787'), '1481883341161631844');
});

test('resolveDiscordForumImportTarget routes retained Discord forum threads deterministically', () => {
  const rules = [
    {
      id: 'discord-forum-investigation',
      channelId: 'channel-investigation',
      match: {
        titleIncludes: ['review request', '[digest]'],
        bodyIncludes: ['review this report', 'missing required digest']
      }
    },
    {
      id: 'discord-forum-library-default',
      channelId: 'channel-library',
      default: true
    }
  ];

  const investigationRule = resolveDiscordForumImportTarget(rules, {
    channel_type: '11',
    name: 'Review request'
  }, {
    content: 'Review this report and tell me the immediate concern.'
  });
  const titleOnlyRule = resolveDiscordForumImportTarget(rules, {
    channel_type: '11',
    name: '[DIGEST] Hera missing required Agent Digest'
  }, {
    content: 'Procedural follow-up only.'
  });
  const fallbackRule = resolveDiscordForumImportTarget(rules, {
    channel_type: '11',
    name: 'Hello'
  }, {
    content: 'Just checking the lane.'
  });

  assert.equal(investigationRule?.channelId, 'channel-investigation');
  assert.equal(titleOnlyRule?.channelId, 'channel-investigation');
  assert.equal(fallbackRule?.channelId, 'channel-library');
});

test('matchDiscordAuthorToIdentity maps known Discord authors to existing NEXUS identities', () => {
  const identities = [
    { id: 'identity-jack', slug: 'jack', displayName: 'Jack' },
    { id: 'identity-kira', slug: 'kira', displayName: 'Kira' }
  ];

  const jack = matchDiscordAuthorToIdentity(identities, {
    username: 'jackkhyro',
    globalName: 'Jack'
  });
  const kira = matchDiscordAuthorToIdentity(identities, {
    username: 'Kira',
    globalName: null
  });

  assert.equal(jack?.id, 'identity-jack');
  assert.equal(kira?.id, 'identity-kira');
});

test('buildImportedIdentity creates a deterministic fallback identity for unmapped Discord authors', () => {
  const identity = buildImportedIdentity({
    authorId: '1234567890',
    username: 'OutsideUser',
    globalName: 'Outside User',
    isBot: false
  });

  assert.equal(identity.id, 'identity-discord-1234567890');
  assert.equal(identity.slug, 'outsideuser');
  assert.equal(identity.displayName, 'Outside User');
  assert.equal(identity.kind, 'human');
});

test('buildImportedRelayRecord anchors imported Discord ingress to native scopes', () => {
  const relay = buildImportedRelayRecord({
    row: {
      message_id: 'discord-123',
      channel_id: '1481840691066700038',
      created_at: '2026-03-18T00:00:00.000Z'
    },
    scope: {
      scopeType: 'post',
      scopeId: 'post-discord-1481138305155338320',
      targetChannelId: 'channel-report',
      importRuleId: 'discord-forum-report',
      importStrategy: 'recovered-parent',
      externalParentChannelId: '1481840691066700038'
    },
    importedMessageId: 'message-discord-discord-123',
    authorIdentityId: 'identity-hera'
  });

  assert.equal(relay.id, 'relay-discord-import-discord-123');
  assert.equal(relay.scopeType, 'post');
  assert.equal(relay.scopeId, 'post-discord-1481138305155338320');
  assert.equal(relay.toScopeType, 'channel');
  assert.equal(relay.toScopeId, 'channel-report');
  assert.equal(relay.actorIdentityId, 'identity-hera');
  assert.equal(relay.messageId, 'message-discord-discord-123');
  assert.equal(relay.source.externalChannelId, '1481840691066700038');
  assert.equal(relay.source.importStrategy, 'recovered-parent');
});

test('syncBootstrapMetabase refreshes bootstrap-owned metadata while preserving extras', () => {
  const existing = {
    roles: [{ id: 'role-operator', slug: 'operator', name: 'Old Operator', identityKind: 'human' }],
    identities: [
      { id: 'identity-jack', slug: 'jack', displayName: 'Old Jack', kind: 'human' },
      { id: 'identity-discord-1', slug: 'outside-user', displayName: 'Outside User', kind: 'human' }
    ],
    workspaces: [],
    channels: [{ id: 'channel-workflow', workspaceId: 'workspace-internal-core', slug: 'workflow', name: 'Old Workflow', kind: 'shared', description: 'old', access: {} }],
    memberships: [],
    directConversations: [],
    adapterEndpoints: [{ id: 'adapter-discord-primary', system: 'discord', direction: 'ingest-relay', workspaceId: 'workspace-internal-core', channelMappings: [{ externalChannelId: 'old', channelId: 'channel-workflow' }] }],
    externalReferences: [{ id: 'xref-1' }]
  };

  const bootstrap = {
    roles: [{ id: 'role-operator', slug: 'operator', name: 'Operator', identityKind: 'human' }],
    identities: [{ id: 'identity-jack', slug: 'jack', displayName: 'Jack', kind: 'human' }],
    workspaces: [{ id: 'workspace-internal-core', slug: 'internal-core', name: 'Internal Core', description: 'core', visibility: 'internal' }],
    channels: [{ id: 'channel-workflow', workspaceId: 'workspace-internal-core', slug: 'workflow', name: 'Workflow', kind: 'shared', description: 'new', access: {} }],
    memberships: [],
    directConversations: [],
    adapterEndpoints: [{ id: 'adapter-discord-primary', system: 'discord', direction: 'ingest-relay', workspaceId: 'workspace-internal-core', channelMappings: [{ externalChannelId: '1481091195013955664', channelId: 'channel-workflow' }] }]
  };

  const synced = syncBootstrapMetabase(existing, bootstrap, '2026-03-17T00:00:00.000Z');
  assert.equal(synced.changed, true);
  assert.equal(synced.metabase.roles[0].name, 'Operator');
  assert.equal(synced.metabase.identities.find((identity) => identity.id === 'identity-jack').displayName, 'Jack');
  assert(synced.metabase.identities.some((identity) => identity.id === 'identity-discord-1'));
  assert.equal(synced.metabase.channels.find((channel) => channel.id === 'channel-workflow').name, 'Workflow');
  assert.equal(synced.metabase.adapterEndpoints[0].channelMappings[0].externalChannelId, '1481091195013955664');
  assert.equal(synced.metabase.externalReferences.length, 1);
});
