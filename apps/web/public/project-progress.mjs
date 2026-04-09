const STATUS_META = {
  done: {
    label: 'Done',
    tone: 'done'
  },
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

function normalizeProjectPulseArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) {
    return [];
  }

  return artifacts.flatMap((artifact) => {
    if (!artifact) {
      return [];
    }

    if (typeof artifact === 'string') {
      const path = artifact.trim();
      return path
        ? [{ label: path, path, href: '', note: '' }]
        : [];
    }

    if (typeof artifact !== 'object') {
      return [];
    }

    const label = typeof artifact.label === 'string' ? artifact.label.trim() : '';
    const path = typeof artifact.path === 'string' ? artifact.path.trim() : '';
    const href = typeof artifact.href === 'string' ? artifact.href.trim() : '';
    const note = typeof artifact.note === 'string' ? artifact.note.trim() : '';

    if (!label && !path && !href) {
      return [];
    }

    return [{
      label: label || path || href,
      path,
      href,
      note
    }];
  });
}

export function summarizeProjectPulse(snapshot = {}) {
  const lanes = Array.isArray(snapshot.lanes)
    ? snapshot.lanes
      .filter((lane) => lane && typeof lane === 'object')
      .map((lane) => ({
        ...lane,
        artifacts: normalizeProjectPulseArtifacts(lane.artifacts)
      }))
    : [];
  const counts = {
    total: lanes.length,
    done: 0,
    executeNow: 0,
    inProgress: 0,
    queued: 0,
    parked: 0
  };

  for (const lane of lanes) {
    if (lane?.status === 'done') {
      counts.done += 1;
    }
    else if (lane?.status === 'execute-now') {
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
    focusArtifacts: focusLane?.artifacts ?? [],
    lanes,
    counts: {
      ...counts,
      active: counts.executeNow + counts.inProgress
    }
  };
}
