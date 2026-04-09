const STATUS_META = {
  'execute-now': {
    label: 'Execute now',
    tone: 'execute-now'
  },
  'in-progress': {
    label: 'In progress',
    tone: 'in-progress'
  },
  queued: {
    label: 'Queued',
    tone: 'queued'
  },
  parked: {
    label: 'Parked',
    tone: 'parked'
  }
};

export function projectPulseStatusMeta(status) {
  return STATUS_META[status] ?? {
    label: 'Watching',
    tone: 'watching'
  };
}

export function summarizeProjectPulse(snapshot = {}) {
  const lanes = Array.isArray(snapshot.lanes) ? snapshot.lanes : [];
  const counts = {
    total: lanes.length,
    executeNow: 0,
    inProgress: 0,
    queued: 0,
    parked: 0
  };

  for (const lane of lanes) {
    if (lane?.status === 'execute-now') {
      counts.executeNow += 1;
    }
    else if (lane?.status === 'in-progress') {
      counts.inProgress += 1;
    }
    else if (lane?.status === 'queued') {
      counts.queued += 1;
    }
    else if (lane?.status === 'parked') {
      counts.parked += 1;
    }
  }

  const focusLane = lanes.find((lane) => lane?.status === 'execute-now')
    ?? lanes.find((lane) => lane?.status === 'in-progress')
    ?? lanes[0]
    ?? null;

  return {
    title: snapshot.title ?? 'Project Pulse',
    summary: snapshot.summary ?? '',
    source: snapshot.source ?? '',
    nextAction: snapshot.nextAction ?? focusLane?.nextAction ?? '',
    capturedAtLabel: snapshot.capturedAtLabel ?? 'Review time not recorded',
    focusLane,
    counts: {
      ...counts,
      active: counts.executeNow + counts.inProgress
    }
  };
}
