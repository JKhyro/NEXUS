import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveBreadcrumbRoute,
  parseSelectionRouteHash
} from '../apps/web/public/selection-route.mjs';

test('breadcrumb trail follows a channel, post, thread, and message route', () => {
  const route = parseSelectionRouteHash(
    '#actor=identity-jack&workspace=workspace-internal-core&channel=channel-report&post=post-1&thread=thread-1&message=message-1'
  );

  assert.deepEqual(deriveBreadcrumbRoute(route), [
    { level: 'workspace', id: 'workspace-internal-core' },
    { level: 'channel', id: 'channel-report' },
    { level: 'post', id: 'post-1' },
    { level: 'thread', id: 'thread-1' },
    { level: 'message', id: 'message-1' }
  ]);
});

test('breadcrumb trail follows a direct conversation route without channel crumbs', () => {
  const route = parseSelectionRouteHash(
    '#actor=identity-jack&workspace=workspace-internal-core&direct=direct-1&message=message-1'
  );

  assert.deepEqual(deriveBreadcrumbRoute(route), [
    { level: 'workspace', id: 'workspace-internal-core' },
    { level: 'direct', id: 'direct-1' },
    { level: 'message', id: 'message-1' }
  ]);
});

test('breadcrumb trail stays empty when no route context is present', () => {
  assert.deepEqual(deriveBreadcrumbRoute(parseSelectionRouteHash('')), []);
});
