import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coordinationCountsForMessage,
  filterCoordinationRecords,
  normalizeCoordinationFocusMode
} from '../apps/web/public/coordination-focus.mjs';

const relayRecords = [
  { id: 'relay-1', messageId: 'message-1' },
  { id: 'relay-2', messageId: 'message-2' },
  { id: 'relay-3' }
];

const handoffRecords = [
  { id: 'handoff-1', messageId: 'message-1' },
  { id: 'handoff-2' }
];

test('scope mode keeps full coordination lists', () => {
  assert.deepEqual(
    filterCoordinationRecords(relayRecords, 'scope', 'message-1').map((record) => record.id),
    ['relay-1', 'relay-2', 'relay-3']
  );
});

test('selected-message mode narrows coordination lists to matching message ids', () => {
  assert.deepEqual(
    filterCoordinationRecords(relayRecords, 'message', 'message-1').map((record) => record.id),
    ['relay-1']
  );
  assert.deepEqual(
    filterCoordinationRecords(handoffRecords, 'message', 'message-1').map((record) => record.id),
    ['handoff-1']
  );
});

test('selected-message mode can be empty without falling back to scope mode', () => {
  assert.deepEqual(
    filterCoordinationRecords(relayRecords, 'message', 'message-9').map((record) => record.id),
    []
  );
});

test('records without message ids remain visible in scope mode only', () => {
  assert.deepEqual(
    filterCoordinationRecords(relayRecords, 'scope', 'message-1').map((record) => record.id),
    ['relay-1', 'relay-2', 'relay-3']
  );
  assert.deepEqual(
    filterCoordinationRecords(relayRecords, 'message', 'message-1').map((record) => record.id),
    ['relay-1']
  );
});

test('coordination focus mode normalizes back to scope without a selected message', () => {
  assert.equal(normalizeCoordinationFocusMode('message', null), 'scope');
  assert.equal(normalizeCoordinationFocusMode('message', 'message-1'), 'message');
});

test('message coordination counts only include matching message-linked records', () => {
  assert.deepEqual(
    coordinationCountsForMessage(relayRecords, handoffRecords, 'message-1'),
    { relayCount: 1, handoffCount: 1 }
  );
  assert.deepEqual(
    coordinationCountsForMessage(relayRecords, handoffRecords, null),
    { relayCount: 0, handoffCount: 0 }
  );
});
