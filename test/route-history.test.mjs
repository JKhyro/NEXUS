import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canStepRouteHistory,
  createRouteHistoryState,
  pushRouteHistory,
  recentRouteHistory,
  selectRouteHistoryIndex,
  stepRouteHistory
} from '../apps/web/public/route-history.mjs';

test('pushRouteHistory appends new route entries and updates the active index', () => {
  let history = createRouteHistoryState(4);
  history = pushRouteHistory(history, { hash: '#workspace=a&channel=workflow', label: 'workflow' });
  history = pushRouteHistory(history, { hash: '#workspace=a&channel=requests', label: 'requests' });

  assert.equal(history.index, 1);
  assert.deepEqual(history.entries.map((entry) => entry.label), ['workflow', 'requests']);
});

test('pushRouteHistory truncates forward history when a new route is recorded after stepping back', () => {
  let history = createRouteHistoryState(5);
  history = pushRouteHistory(history, { hash: '#one', label: 'one' });
  history = pushRouteHistory(history, { hash: '#two', label: 'two' });
  history = pushRouteHistory(history, { hash: '#three', label: 'three' });

  history = stepRouteHistory(history, -1).history;
  history = pushRouteHistory(history, { hash: '#replacement', label: 'replacement' });

  assert.equal(history.index, 2);
  assert.deepEqual(history.entries.map((entry) => entry.hash), ['#one', '#two', '#replacement']);
});

test('stepRouteHistory moves backward and forward within the bounded stack', () => {
  let history = createRouteHistoryState(5);
  history = pushRouteHistory(history, { hash: '#one', label: 'one' });
  history = pushRouteHistory(history, { hash: '#two', label: 'two' });
  history = pushRouteHistory(history, { hash: '#three', label: 'three' });

  let result = stepRouteHistory(history, -1);
  assert.equal(result.entry?.hash, '#two');
  assert.equal(result.history.index, 1);

  result = stepRouteHistory(result.history, 1);
  assert.equal(result.entry?.hash, '#three');
  assert.equal(result.history.index, 2);

  assert.equal(canStepRouteHistory(result.history, 1), false);
});

test('recentRouteHistory returns the newest entries first and marks the active route', () => {
  let history = createRouteHistoryState(6);
  history = pushRouteHistory(history, { hash: '#one', label: 'one' });
  history = pushRouteHistory(history, { hash: '#two', label: 'two' });
  history = pushRouteHistory(history, { hash: '#three', label: 'three' });

  const recent = recentRouteHistory(history, 2);
  assert.deepEqual(recent.map((entry) => entry.label), ['three', 'two']);
  assert.equal(recent[0].isCurrent, true);
  assert.equal(recent[1].isCurrent, false);
});

test('selectRouteHistoryIndex activates a chosen recent entry without mutating unrelated data', () => {
  let history = createRouteHistoryState(5);
  history = pushRouteHistory(history, { hash: '#one', label: 'one', detail: 'first' });
  history = pushRouteHistory(history, { hash: '#two', label: 'two', detail: 'second' });

  const result = selectRouteHistoryIndex(history, 0);
  assert.equal(result.history.index, 0);
  assert.deepEqual(result.entry, history.entries[0]);
});
