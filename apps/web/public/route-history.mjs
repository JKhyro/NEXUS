export function createRouteHistoryState(limit = 12) {
  return {
    entries: [],
    index: -1,
    limit
  };
}

function normalizeHistory(history) {
  const limit = Number(history?.limit) > 0 ? Number(history.limit) : 12;
  const entries = Array.isArray(history?.entries) ? history.entries.slice() : [];
  const index = Math.max(-1, Math.min(Number(history?.index ?? entries.length - 1), entries.length - 1));
  return {
    entries,
    index,
    limit
  };
}

export function pushRouteHistory(history, entry) {
  const current = normalizeHistory(history);
  const nextEntry = entry && typeof entry.hash === 'string' && entry.hash.trim()
    ? {
        ...entry,
        hash: entry.hash.trim(),
        label: entry.label ?? entry.hash.trim(),
        detail: entry.detail ?? '',
        visitedAt: entry.visitedAt ?? null
      }
    : null;

  if (!nextEntry) {
    return current;
  }

  const entries = current.entries.slice(0, current.index + 1);
  const lastEntry = entries.at(-1) ?? null;

  if (lastEntry?.hash === nextEntry.hash) {
    entries[entries.length - 1] = {
      ...lastEntry,
      ...nextEntry
    };
    return {
      ...current,
      entries,
      index: entries.length - 1
    };
  }

  entries.push(nextEntry);
  if (entries.length > current.limit) {
    entries.splice(0, entries.length - current.limit);
  }

  return {
    ...current,
    entries,
    index: entries.length - 1
  };
}

export function canStepRouteHistory(history, direction) {
  const current = normalizeHistory(history);
  const nextIndex = current.index + direction;
  return nextIndex >= 0 && nextIndex < current.entries.length;
}

export function stepRouteHistory(history, direction) {
  const current = normalizeHistory(history);
  const nextIndex = current.index + direction;
  if (nextIndex < 0 || nextIndex >= current.entries.length) {
    return {
      history: current,
      entry: null
    };
  }

  return {
    history: {
      ...current,
      index: nextIndex
    },
    entry: current.entries[nextIndex]
  };
}

export function selectRouteHistoryIndex(history, index) {
  const current = normalizeHistory(history);
  if (index < 0 || index >= current.entries.length) {
    return {
      history: current,
      entry: null
    };
  }

  return {
    history: {
      ...current,
      index
    },
    entry: current.entries[index]
  };
}

export function recentRouteHistory(history, limit = 6) {
  const current = normalizeHistory(history);
  const start = Math.max(0, current.entries.length - limit);
  return current.entries
    .map((entry, index) => ({
      ...entry,
      index,
      isCurrent: index === current.index
    }))
    .slice(start)
    .reverse();
}

export const recordRouteHistory = pushRouteHistory;
