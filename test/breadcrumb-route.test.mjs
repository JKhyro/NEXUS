import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSelectionRouteHash
} from '../apps/web/public/selection-route.mjs';

function deriveBreadcrumbTrail(route) {
  const trail = [];

  if (route.actorId) {
    trail.push(`Actor:${route.actorId}`);
  }

  if (route.workspaceId) {
    trail.push(`Workspace:${route.workspaceId}`);
  }

  if (route.directConversationId) {
    trail.push(`Direct:${route.directConversationId}`);
  }
  else if (route.channelId) {
    trail.push(`Channel:${route.channelId}`);
    if (route.postId) {
      trail.push(`Post:${route.postId}`);
    }
    if (route.threadId) {
      trail.push(`Thread:${route.threadId}`);
    }
  }

  if (route.messageId) {
    trail.push(`Message:${route.messageId}`);
  }

  return trail;
}

test('breadcrumb trail follows a channel, post, thread, and message route', () => {
  const route = parseSelectionRouteHash(
    '#actor=identity-jack&workspace=workspace-internal-core&channel=channel-report&post=post-1&thread=thread-1&message=message-1'
  );

  assert.deepEqual(deriveBreadcrumbTrail(route), [
    'Actor:identity-jack',
    'Workspace:workspace-internal-core',
    'Channel:channel-report',
    'Post:post-1',
    'Thread:thread-1',
    'Message:message-1'
  ]);
});

test('breadcrumb trail follows a direct conversation route without channel crumbs', () => {
  const route = parseSelectionRouteHash(
    '#actor=identity-jack&workspace=workspace-internal-core&direct=direct-1&message=message-1'
  );

  assert.deepEqual(deriveBreadcrumbTrail(route), [
    'Actor:identity-jack',
    'Workspace:workspace-internal-core',
    'Direct:direct-1',
    'Message:message-1'
  ]);
});

test('breadcrumb trail stays empty when no route context is present', () => {
  assert.deepEqual(deriveBreadcrumbTrail(parseSelectionRouteHash('')), []);
});
