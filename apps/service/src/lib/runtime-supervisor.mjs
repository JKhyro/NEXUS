const DEFAULT_EVENT_LIMIT = 10;

function timestamp(now) {
  const value = now();
  return typeof value === 'string' ? value : value.toISOString();
}

function trimRecentEvents(events, eventLimit) {
  return events.slice(-eventLimit);
}

function normalizeFailure(error, at) {
  return {
    at,
    code: typeof error?.code === 'string' ? error.code : 'runtime-supervisor-start-failed',
    message: error?.message ?? 'Runtime supervisor failed to start.'
  };
}

export function createRuntimeSupervisor({
  manifestRegistry,
  now = () => new Date(),
  eventLimit = DEFAULT_EVENT_LIMIT
}) {
  const state = {
    owner: 'node-runtime-supervisor',
    targetOwner: 'native-runtime-supervisor',
    transitionSeam: 'service-runtime-supervisor-boundary',
    readiness: 'pending',
    lifecycleState: 'created',
    startupAttemptCount: 0,
    lastAttemptAt: null,
    startedAt: null,
    failedAt: null,
    stoppedAt: null,
    manifestRegistry: null,
    lastFailure: null,
    recentEvents: []
  };

  function recordEvent(type, details = {}) {
    state.recentEvents = trimRecentEvents([
      ...state.recentEvents,
      {
        at: timestamp(now),
        type,
        ...details
      }
    ], eventLimit);
  }

  function getStatus() {
    return {
      owner: state.owner,
      targetOwner: state.targetOwner,
      transitionSeam: state.transitionSeam,
      readiness: state.readiness,
      lifecycleState: state.lifecycleState,
      startupAttemptCount: state.startupAttemptCount,
      lastAttemptAt: state.lastAttemptAt,
      startedAt: state.startedAt,
      failedAt: state.failedAt,
      stoppedAt: state.stoppedAt,
      manifestRegistry: state.manifestRegistry,
      lastFailure: state.lastFailure,
      recentEvents: [...state.recentEvents]
    };
  }

  return {
    async start() {
      state.startupAttemptCount += 1;
      state.lastAttemptAt = timestamp(now);
      state.lifecycleState = 'starting';
      state.readiness = 'starting';
      recordEvent('start-attempt', {
        attempt: state.startupAttemptCount
      });

      try {
        state.manifestRegistry = await manifestRegistry.getSummary();
        state.startedAt = timestamp(now);
        state.failedAt = null;
        state.lastFailure = null;
        state.lifecycleState = 'running';
        state.readiness = 'ready';
        recordEvent('start-succeeded', {
          surfacePackageCount: state.manifestRegistry.surfacePackageCount,
          helperPackageCount: state.manifestRegistry.helperPackageCount
        });
      }
      catch (error) {
        state.failedAt = timestamp(now);
        state.lifecycleState = 'start-failed';
        state.readiness = 'degraded';
        state.lastFailure = normalizeFailure(error, state.failedAt);
        recordEvent('start-failed', {
          code: state.lastFailure.code,
          message: state.lastFailure.message
        });
      }

      return getStatus();
    },
    async stop() {
      if (state.lifecycleState === 'stopped') {
        return getStatus();
      }

      state.lifecycleState = 'stopping';
      recordEvent('stop-attempt');
      state.stoppedAt = timestamp(now);
      state.lifecycleState = 'stopped';
      state.readiness = state.lastFailure ? 'degraded' : 'stopped';
      recordEvent('stopped');
      return getStatus();
    },
    isReady() {
      return state.readiness === 'ready';
    },
    getStatus
  };
}
