import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLinkedContextSelection,
  summarizeLinkedContextCoordination,
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
