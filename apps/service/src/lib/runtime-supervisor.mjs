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

function summarizeHelperSlot(slot) {
  return {
    slotId: slot.slotId,
    status: slot.status,
    helperPackageId: slot.helper?.packageId ?? null,
    sourceRuntime: slot.helper?.sourceRuntime ?? null
  };
}

function summarizeDiagnostic(diagnostic) {
  return {
    level: diagnostic.level ?? 'warning',
    code: diagnostic.code ?? 'runtime-activation-diagnostic',
    slotId: diagnostic.slotId ?? null,
    helperPackageId: diagnostic.helperPackageId ?? null,
    message: diagnostic.message ?? 'Runtime activation diagnostic.'
  };
}

function createActivationRecord(activation) {
  return {
    activationId: activation.activationId,
    activatedAt: activation.activatedAt,
    route: {
      actorId: activation.route.actorId,
      workspaceId: activation.route.workspaceId,
      surfaceKind: activation.route.surfaceKind,
      scopeId: activation.route.scopeId,
      selectedMessageId: activation.route.selectedMessageId,
      surfacePackageId: activation.route.surfacePackageId
    },
    surface: {
      packageId: activation.surface.packageId,
      displayName: activation.surface.displayName,
      surfaceKind: activation.surface.surfaceKind,
      manifestVersion: activation.surface.manifestVersion,
      abiVersion: activation.surface.abiVersion,
      entrypoint: activation.surface.entrypoint
    },
    helperSlots: Array.isArray(activation.helperSlots)
      ? activation.helperSlots.map(summarizeHelperSlot)
      : [],
    diagnostics: Array.isArray(activation.diagnostics)
      ? activation.diagnostics.map(summarizeDiagnostic)
      : []
  };
}

function createActivationNotFoundError(activationId) {
  const error = new Error(`Runtime activation ${activationId} is not active.`);
  error.code = 'runtime-activation-not-found';
  error.statusCode = 404;
  error.details = {
    activationId
  };
  return error;
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
    lastActivatedAt: null,
    lastReleasedAt: null,
    manifestRegistry: null,
    activeRouteActivations: [],
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
      lastActivatedAt: state.lastActivatedAt,
      lastReleasedAt: state.lastReleasedAt,
      manifestRegistry: state.manifestRegistry,
      activeRouteActivationCount: state.activeRouteActivations.length,
      activeRouteActivations: state.activeRouteActivations.map((activation) => ({
        ...activation,
        route: { ...activation.route },
        surface: { ...activation.surface },
        helperSlots: activation.helperSlots.map((slot) => ({ ...slot })),
        diagnostics: activation.diagnostics.map((diagnostic) => ({ ...diagnostic }))
      })),
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
      const clearedActivationCount = state.activeRouteActivations.length;
      state.activeRouteActivations = [];
      state.stoppedAt = timestamp(now);
      state.lifecycleState = 'stopped';
      state.readiness = state.lastFailure ? 'degraded' : 'stopped';
      if (clearedActivationCount > 0) {
        recordEvent('route-activations-cleared', {
          count: clearedActivationCount
        });
      }
      recordEvent('stopped');
      return getStatus();
    },
    async activateRoute(activateRoute) {
      const activation = await activateRoute();
      const record = createActivationRecord(activation);
      state.activeRouteActivations = [
        ...state.activeRouteActivations.filter((entry) => entry.activationId !== record.activationId),
        record
      ];
      state.lastActivatedAt = record.activatedAt;
      recordEvent('route-activated', {
        activationId: record.activationId,
        surfaceKind: record.route.surfaceKind,
        surfacePackageId: record.surface.packageId,
        degradedHelperSlotCount: record.helperSlots.filter((slot) => slot.status === 'degraded').length
      });
      return activation;
    },
    listRouteActivations() {
      return getStatus().activeRouteActivations;
    },
    releaseRouteActivation(activationId) {
      const recordIndex = state.activeRouteActivations.findIndex((entry) => entry.activationId === activationId);
      if (recordIndex === -1) {
        throw createActivationNotFoundError(activationId);
      }

      const [record] = state.activeRouteActivations.splice(recordIndex, 1);
      const releasedAt = timestamp(now);
      state.lastReleasedAt = releasedAt;
      recordEvent('route-released', {
        activationId,
        surfaceKind: record.route.surfaceKind,
        surfacePackageId: record.surface.packageId
      });
      return {
        ...record,
        releasedAt
      };
    },
    isReady() {
      return state.readiness === 'ready';
    },
    getStatus
  };
}
