import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLinkedContextSelection,
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
