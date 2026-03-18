import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLinkedContextSelection,
  groupLinkedContextResults,
  linkedContextOwnerTypeFilters,
  normalizeLinkedContextOwnerTypeFilter,
  summarizeLinkedContextCoordination,
  summarizeLinkedContextFilter,
  summarizeLinkedContextPath
} from '../apps/web/public/linked-context.mjs';

test('buildLinkedContextSelection returns channel-post-thread-message route state', () => {
  const selection = buildLinkedContextSelection({
    route: {
      workspaceId: 'workspace-internal-core',
      channelId: 'channel-report',
      postId: 'post-1',
      threadId: 'thread-1',
      messageId: 'message-1'
    }
  }, 'identity-jack');

  assert.deepEqual(selection, {
    actorId: 'identity-jack',
    workspaceId: 'workspace-internal-core',
    directConversationId: null,
    channelId: 'channel-report',
    postId: 'post-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    coordinationFocusMode: 'message'
  });
});

test('buildLinkedContextSelection prefers direct-conversation route state', () => {
  const selection = buildLinkedContextSelection({
    route: {
      workspaceId: null,
      directConversationId: 'direct-1',
      channelId: 'channel-report',
      messageId: 'message-2'
    }
  }, 'identity-kira');

  assert.deepEqual(selection, {
    actorId: 'identity-kira',
    workspaceId: null,
    directConversationId: 'direct-1',
    channelId: null,
    postId: null,
    threadId: null,
    messageId: 'message-2',
    coordinationFocusMode: 'message'
  });
});

test('buildLinkedContextSelection fails safely for incomplete route metadata', () => {
  assert.equal(buildLinkedContextSelection({ route: { workspaceId: 'workspace-internal-core' } }, 'identity-jack'), null);
  assert.equal(buildLinkedContextSelection(null, 'identity-jack'), null);
});

test('summarizeLinkedContextPath renders direct and nested scope metadata', () => {
  assert.equal(
    summarizeLinkedContextPath({
      route: {
        directConversationId: 'direct-1',
        messageId: 'message-1'
      }
    }),
    'Direct conversation | message message-1'
  );

  assert.equal(
    summarizeLinkedContextPath({
      route: {
        channelId: 'channel-report',
        postId: 'post-1',
        threadId: 'thread-1'
      }
    }),
    'Channel channel-report | Post post-1 | Thread thread-1'
  );
});

test('summarizeLinkedContextCoordination renders scope and message coordination counts', () => {
  assert.equal(
    summarizeLinkedContextCoordination({
      coordination: {
        scope: {
          relayCount: 2,
          handoffCount: 1
        },
        message: {
          relayCount: 1,
          handoffCount: 0
        }
      }
    }),
    'Scope 2 relays | 1 handoff || Message 1 relay | 0 handoffs'
  );

  assert.equal(
    summarizeLinkedContextCoordination({
      coordination: {
        scope: {
          relayCount: 0,
          handoffCount: 0
        },
        message: null
      }
    }),
    'Scope 0 relays | 0 handoffs'
  );
});

test('linked-context owner-type filters count readable results by owner type', () => {
  const filters = linkedContextOwnerTypeFilters([
    { owner: { ownerType: 'message' } },
    { owner: { ownerType: 'channel' } },
    { owner: { ownerType: 'message' } },
    { owner: { ownerType: 'direct' } }
  ]);

  assert.deepEqual(filters, [
    { value: 'all', count: 4, label: 'All readable' },
    { value: 'channel', count: 1, label: 'Channels' },
    { value: 'direct', count: 1, label: 'Direct conversations' },
    { value: 'message', count: 2, label: 'Messages' }
  ]);
});

test('linked-context owner-type filters fall back to reference owner type and unknown buckets', () => {
  const filters = linkedContextOwnerTypeFilters([
    { owner: {}, reference: { ownerType: 'thread' } },
    { owner: { ownerType: '   ' }, reference: { ownerType: 'message' } },
    { owner: {}, reference: {} }
  ]);

  assert.deepEqual(filters, [
    { value: 'all', count: 3, label: 'All readable' },
    { value: 'thread', count: 1, label: 'Threads' },
    { value: 'unknown', count: 2, label: 'Other owners' }
  ]);
});

test('groupLinkedContextResults groups readable results and preserves order within groups', () => {
  const grouped = groupLinkedContextResults([
    { owner: { ownerType: 'message' }, marker: 'message-a' },
    { owner: { ownerType: 'channel' }, marker: 'channel-a' },
    { owner: { ownerType: 'message' }, marker: 'message-b' },
    { owner: { ownerType: 'thread' }, marker: 'thread-a' }
  ]);

  assert.deepEqual(grouped.map((group) => ({
    ownerType: group.ownerType,
    label: group.label,
    markers: group.results.map((result) => result.marker)
  })), [
    { ownerType: 'channel', label: 'Channels', markers: ['channel-a'] },
    { ownerType: 'thread', label: 'Threads', markers: ['thread-a'] },
    { ownerType: 'message', label: 'Messages', markers: ['message-a', 'message-b'] }
  ]);
});

test('groupLinkedContextResults narrows to the selected owner type and invalid filters fail back to all', () => {
  const results = [
    { owner: { ownerType: 'channel' }, marker: 'channel-a' },
    { owner: { ownerType: 'post' }, marker: 'post-a' },
    { owner: { ownerType: 'post' }, marker: 'post-b' }
  ];

  assert.equal(normalizeLinkedContextOwnerTypeFilter('post', results), 'post');
  assert.equal(normalizeLinkedContextOwnerTypeFilter('missing', results), 'all');

  const grouped = groupLinkedContextResults(results, 'post');
  assert.deepEqual(grouped.map((group) => ({
    ownerType: group.ownerType,
    markers: group.results.map((result) => result.marker)
  })), [
    { ownerType: 'post', markers: ['post-a', 'post-b'] }
  ]);
});

test('summarizeLinkedContextFilter describes all-results and filtered views', () => {
  const results = [
    { owner: { ownerType: 'channel' } },
    { owner: { ownerType: 'message' } },
    { owner: { ownerType: 'message' } }
  ];

  assert.equal(
    summarizeLinkedContextFilter(results, 'all'),
    'Showing all 3 readable linked results across 2 owner types.'
  );

  assert.equal(
    summarizeLinkedContextFilter(results, 'message'),
    'Showing 2 readable linked results for messages. Switch back to All readable to compare other owner types.'
  );

  assert.equal(
    summarizeLinkedContextFilter([], 'all'),
    'No owner-type groups are available for this lookup yet.'
  );
});
