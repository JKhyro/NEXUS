import { createId } from './ids.mjs';

const DEFAULT_EVENT_LIMIT = 10;
const ALLOWED_LIFECYCLE_STATES = new Set(['active', 'background', 'suspended', 'draining']);

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

function normalizeCommandFailure(error, at, commandType) {
  return {
    at,
    commandType,
    code: typeof error?.code === 'string' ? error.code : 'runtime-command-dispatch-failed',
    message: error?.message ?? 'Runtime command dispatch failed.'
  };
}

function createCommandValidationError(message, details = null) {
  const error = new Error(message);
  error.code = 'runtime-command-invalid';
  error.statusCode = 400;
  error.details = details;
  return error;
}

function createCommandCapabilityDeniedError(activationId, commandType, requiredCapability) {
  const error = new Error(`Runtime activation ${activationId} is not approved to dispatch ${commandType} with capability ${requiredCapability}.`);
  error.code = 'runtime-command-capability-denied';
  error.statusCode = 403;
  error.details = {
    activationId,
    commandType,
    requiredCapability
  };
  return error;
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

function ensureCommandEnvelope(commandEnvelope) {
  if (!commandEnvelope || typeof commandEnvelope !== 'object' || Array.isArray(commandEnvelope)) {
    throw createCommandValidationError('Runtime command dispatch requires a JSON object payload.');
  }

  if (typeof commandEnvelope.commandType !== 'string' || commandEnvelope.commandType.trim().length === 0) {
    throw createCommandValidationError('Runtime command field commandType must be a non-empty string.', {
      field: 'commandType'
    });
  }

  if (commandEnvelope.payload !== undefined && (!commandEnvelope.payload || typeof commandEnvelope.payload !== 'object' || Array.isArray(commandEnvelope.payload))) {
    throw createCommandValidationError('Runtime command field payload must be omitted or be a JSON object.', {
      field: 'payload'
    });
  }

  if (commandEnvelope.requiredCapability !== undefined && (typeof commandEnvelope.requiredCapability !== 'string' || commandEnvelope.requiredCapability.trim().length === 0)) {
    throw createCommandValidationError('Runtime command field requiredCapability must be omitted or be a non-empty string.', {
      field: 'requiredCapability'
    });
  }

  if (commandEnvelope.targetLifecycleState !== undefined) {
    if (typeof commandEnvelope.targetLifecycleState !== 'string' || commandEnvelope.targetLifecycleState.trim().length === 0) {
      throw createCommandValidationError('Runtime command field targetLifecycleState must be omitted or be a non-empty string.', {
        field: 'targetLifecycleState'
      });
    }

    const normalizedTargetLifecycleState = commandEnvelope.targetLifecycleState.trim();
    if (!ALLOWED_LIFECYCLE_STATES.has(normalizedTargetLifecycleState)) {
      throw createCommandValidationError(
        `Runtime command targetLifecycleState ${normalizedTargetLifecycleState} is not supported.`,
        {
          field: 'targetLifecycleState',
          allowedValues: [...ALLOWED_LIFECYCLE_STATES]
        }
      );
    }
  }

  return {
    commandType: commandEnvelope.commandType.trim(),
    payload: commandEnvelope.payload ?? {},
    requiredCapability: typeof commandEnvelope.requiredCapability === 'string'
      ? commandEnvelope.requiredCapability.trim()
      : null,
    targetLifecycleState: typeof commandEnvelope.targetLifecycleState === 'string'
      ? commandEnvelope.targetLifecycleState.trim()
      : 'active'
  };
}

function createActivationRecord(activation) {
  return {
    activationId: activation.activationId,
    activatedAt: activation.activatedAt,
    lifecycleState: 'active',
    commandDispatchCount: 0,
    lastCommandAt: null,
    lastCommand: null,
    lastCommandFailure: null,
    route: {
      actorId: activation.route.actorId,
      workspaceId: activation.route.workspaceId,
      surfaceKind: activation.route.surfaceKind,
      scopeId: activation.route.scopeId,
      selectedMessageId: activation.route.selectedMessageId,
      surfacePackageId: activation.route.surfacePackageId,
      grantedCapabilities: [...(activation.route.grantedCapabilities ?? [])]
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

function createCommandRecord(commandEnvelope, activationRecord, commandResult, dispatchedAt, completedAt, dispatchOwner, targetOwner) {
  return {
    commandId: createId('runtime-command'),
    activationId: activationRecord.activationId,
    commandType: commandEnvelope.commandType,
    requiredCapability: commandEnvelope.requiredCapability,
    targetLifecycleState: commandEnvelope.targetLifecycleState,
    dispatchedAt,
    completedAt,
    dispatchOwner,
    targetOwner,
    result: commandResult
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
    lastCommandAt: null,
    commandDispatchCount: 0,
    lastCommand: null,
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
      lastCommandAt: state.lastCommandAt,
      commandDispatchCount: state.commandDispatchCount,
      lastCommand: state.lastCommand ? {
        ...state.lastCommand,
        result: state.lastCommand.result && typeof state.lastCommand.result === 'object'
          ? { ...state.lastCommand.result }
          : state.lastCommand.result
      } : null,
      manifestRegistry: state.manifestRegistry,
      activeRouteActivationCount: state.activeRouteActivations.length,
      activeRouteActivations: state.activeRouteActivations.map((activation) => ({
        ...activation,
        route: { ...activation.route },
        surface: { ...activation.surface },
        lastCommand: activation.lastCommand ? {
          ...activation.lastCommand,
          result: activation.lastCommand.result && typeof activation.lastCommand.result === 'object'
            ? { ...activation.lastCommand.result }
            : activation.lastCommand.result
        } : null,
        lastCommandFailure: activation.lastCommandFailure ? { ...activation.lastCommandFailure } : null,
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
    async dispatchRouteCommand(activationId, commandEnvelope, executeCommand) {
      const recordIndex = state.activeRouteActivations.findIndex((entry) => entry.activationId === activationId);
      if (recordIndex === -1) {
        throw createActivationNotFoundError(activationId);
      }

      const activation = state.activeRouteActivations[recordIndex];
      const normalizedCommand = ensureCommandEnvelope(commandEnvelope);
      if (
        normalizedCommand.requiredCapability
        && !activation.route.grantedCapabilities.includes(normalizedCommand.requiredCapability)
      ) {
        throw createCommandCapabilityDeniedError(
          activationId,
          normalizedCommand.commandType,
          normalizedCommand.requiredCapability
        );
      }

      const dispatchedAt = timestamp(now);
      activation.lifecycleState = 'dispatching';
      recordEvent('command-dispatch-started', {
        activationId,
        commandType: normalizedCommand.commandType,
        targetLifecycleState: normalizedCommand.targetLifecycleState
      });

      try {
        const commandResult = await executeCommand({
          activation: {
            ...activation,
            route: { ...activation.route },
            surface: { ...activation.surface }
          },
          command: normalizedCommand
        });
        const completedAt = timestamp(now);
        activation.lifecycleState = normalizedCommand.targetLifecycleState;
        activation.commandDispatchCount += 1;
        activation.lastCommandAt = completedAt;
        activation.lastCommandFailure = null;
        const commandRecord = createCommandRecord(
          normalizedCommand,
          activation,
          commandResult,
          dispatchedAt,
          completedAt,
          state.owner,
          state.targetOwner
        );
        activation.lastCommand = commandRecord;
        state.commandDispatchCount += 1;
        state.lastCommandAt = completedAt;
        state.lastCommand = commandRecord;
        recordEvent('command-dispatched', {
          activationId,
          commandId: commandRecord.commandId,
          commandType: normalizedCommand.commandType,
          resultingLifecycleState: activation.lifecycleState
        });
        return commandRecord;
      }
      catch (error) {
        const failedAt = timestamp(now);
        activation.lifecycleState = 'command-failed';
        activation.lastCommandFailure = normalizeCommandFailure(
          error,
          failedAt,
          normalizedCommand.commandType
        );
        recordEvent('command-dispatch-failed', {
          activationId,
          commandType: normalizedCommand.commandType,
          code: activation.lastCommandFailure.code
        });
        throw error;
      }
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
