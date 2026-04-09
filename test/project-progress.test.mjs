import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectPulseStatusMeta,
  summarizeProjectPulse
} from '../apps/web/public/project-progress.mjs';

test('summarizeProjectPulse counts lane states and selects the execute-now focus lane', () => {
  const summary = summarizeProjectPulse({
    title: 'Project Pulse',
    lanes: [
      { ref: '#57', status: 'in-progress', nextAction: 'Continue topology work.' },
      { ref: '#54', status: 'execute-now', nextAction: 'Write back readiness findings.' },
      { ref: '#56', status: 'queued', nextAction: 'Wait for runtime topology.' },
      { ref: '#47', status: 'parked', nextAction: 'Keep parked.' }
    ]
  });

  assert.equal(summary.focusLane?.ref, '#54');
  assert.deepEqual(summary.counts, {
    total: 4,
    executeNow: 1,
    inProgress: 1,
    queued: 1,
    parked: 1,
    active: 2
  });
  assert.equal(summary.nextAction, 'Write back readiness findings.');
});

test('summarizeProjectPulse falls back to the first in-progress lane when no execute-now lane exists', () => {
  const summary = summarizeProjectPulse({
    lanes: [
      { ref: '#55', status: 'in-progress', nextAction: 'Finish README review.' },
      { ref: '#56', status: 'queued', nextAction: 'Hold.' }
    ]
  });

  assert.equal(summary.focusLane?.ref, '#55');
  assert.equal(summary.counts.active, 1);
});

test('projectPulseStatusMeta exposes readable labels and a safe fallback', () => {
  assert.deepEqual(projectPulseStatusMeta('queued'), {
    label: 'Queued',
    tone: 'queued'
  });
  assert.deepEqual(projectPulseStatusMeta('unknown-state'), {
    label: 'Watching',
    tone: 'watching'
  });
});
