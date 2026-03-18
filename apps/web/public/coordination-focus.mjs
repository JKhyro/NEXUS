export function normalizeCoordinationFocusMode(mode, selectedMessageId) {
  return mode === 'message' && selectedMessageId ? 'message' : 'scope';
}

export function coordinationCountsForMessage(relays, handoffs, messageId) {
  if (!messageId) {
    return {
      relayCount: 0,
      handoffCount: 0
    };
  }

  const relayCount = relays.filter((relay) => relay.messageId === messageId).length;
  const handoffCount = handoffs.filter((handoff) => handoff.messageId === messageId).length;

  return {
    relayCount,
    handoffCount
  };
}

export function filterCoordinationRecords(records, mode, selectedMessageId) {
  const focusMode = normalizeCoordinationFocusMode(mode, selectedMessageId);
  if (focusMode !== 'message') {
    return records;
  }

  return records.filter((record) => record.messageId === selectedMessageId);
}
