import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSelectionRouteHash,
  parseSelectionRouteHash
} from '../apps/web/public/selection-route.mjs';

test('buildSelectionRouteHash serializes a channel/post/thread/message selection', () => {
  const hash = buildSelectionRouteHash({
    actorId: 'identity-jack',
    workspaceId: 'workspace-internal-core',
    channelId: 'channel-report',
    postId: 'post-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    coordinationFocusMode: 'message'
  });

  assert.equal(
    hash,
    '#actor=identity-jack&workspace=workspace-internal-core&channel=channel-report&post=post-1&thread=thread-1&message=message-1&coordination=message'
  );
});

test('buildSelectionRouteHash prefers direct conversation selection over channel state', () => {
  const hash = buildSelectionRouteHash({
    actorId: 'identity-jack',
    workspaceId: 'workspace-internal-core',
    directConversationId: 'direct-1',
    channelId: 'channel-report',
    messageId: 'message-1',
    coordinationFocusMode: 'scope'
  });

  assert.equal(
    hash,
    '#actor=identity-jack&workspace=workspace-internal-core&direct=direct-1&message=message-1'
  );
});

test('buildSelectionRouteHash omits message-only focus when there is no selected message', () => {
  const hash = buildSelectionRouteHash({
    actorId: 'identity-jack',
    workspaceId: 'workspace-internal-core',
    channelId: 'channel-general',
    coordinationFocusMode: 'message'
  });

  assert.equal(
    hash,
    '#actor=identity-jack&workspace=workspace-internal-core&channel=channel-general'
  );
});

test('parseSelectionRouteHash restores serialized selection state', () => {
  const route = parseSelectionRouteHash(
    '#actor=identity-jack&workspace=workspace-internal-core&channel=channel-report&post=post-1&thread=thread-1&message=message-1&coordination=message'
  );

  assert.deepEqual(route, {
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

test('parseSelectionRouteHash falls back safely on missing or invalid values', () => {
  assert.deepEqual(parseSelectionRouteHash(''), {
    actorId: null,
    workspaceId: null,
    directConversationId: null,
    channelId: null,
    postId: null,
    threadId: null,
    messageId: null,
    coordinationFocusMode: 'scope'
  });

  assert.equal(
    parseSelectionRouteHash('#coordination=unexpected').coordinationFocusMode,
    'scope'
  );
});
