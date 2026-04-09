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

function normalizeHelperCrashFailure(error, at, activationId, slotId, helperPackageId) {
  return {
    at,
    activationId,
    slotId,
    helperPackageId,
    code: typeof error?.code === 'string' ? error.code : 'runtime-helper-crash',
    message: error?.message ?? `Helper slot ${slotId} crashed.`
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
    sourceRuntime: slot.helper?.sourceRuntime ?? null,
    restartCount: 0,
    restartWindowStartedAt: null,
    restartWindowCount: 0,
    lastCrashAt: null,
    lastRestartedAt: null,
    lastFailure: null,
    failurePolicy: slot.helper?.failurePolicy ?? null
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

function ensureHelperCrashEnvelope(crashEnvelope) {
  if (!crashEnvelope || typeof crashEnvelope !== 'object' || Array.isArray(crashEnvelope)) {
    throw createCommandValidationError('Runtime helper crash reporting requires a JSON object payload.');
  }

  if (typeof crashEnvelope.slotId !== 'string' || crashEnvelope.slotId.trim().length === 0) {
    throw createCommandValidationError('Runtime helper crash field slotId must be a non-empty string.', {
      field: 'slotId'
    });
  }

  if (crashEnvelope.code !== undefined && (typeof crashEnvelope.code !== 'string' || crashEnvelope.code.trim().length === 0)) {
    throw createCommandValidationError('Runtime helper crash field code must be omitted or be a non-empty string.', {
      field: 'code'
    });
  }

  if (crashEnvelope.message !== undefined && (typeof crashEnvelope.message !== 'string' || crashEnvelope.message.trim().length === 0)) {
    throw createCommandValidationError('Runtime helper crash field message must be omitted or be a non-empty string.', {
      field: 'message'
    });
  }

  return {
    slotId: crashEnvelope.slotId.trim(),
    code: typeof crashEnvelope.code === 'string' ? crashEnvelope.code.trim() : 'runtime-helper-crash',
    message: typeof crashEnvelope.message === 'string' ? crashEnvelope.message.trim() : 'Synthetic helper crash report.'
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

function createHelperCrashDiagnostic(slotId, helperPackageId, failure) {
  return {
    level: 'warning',
    code: 'helper-crash-isolated',
    slotId,
    helperPackageId,
    message: `${failure.code}: ${failure.message}`
  };
}

function upsertActivationDiagnostic(diagnostics, nextDiagnostic) {
  return [
    ...diagnostics.filter((diagnostic) => !(diagnostic.slotId === nextDiagnostic.slotId && diagnostic.code === nextDiagnostic.code)),
    nextDiagnostic
  ];
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

function createHelperSlotNotFoundError(activationId, slotId) {
  const error = new Error(`Runtime helper slot ${slotId} is not active for activation ${activationId}.`);
  error.code = 'runtime-helper-slot-not-found';
  error.statusCode = 404;
  error.details = {
    activationId,
    slotId
  };
  return error;
}

function createHelperSlotNotBoundError(activationId, slotId) {
  const error = new Error(`Runtime helper slot ${slotId} is not bound for activation ${activationId}.`);
  error.code = 'runtime-helper-slot-not-bound';
  error.statusCode = 409;
  error.details = {
    activationId,
    slotId
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
    lastCrashAt: null,
    commandDispatchCount: 0,
    crashCount: 0,
    lastCommand: null,
    lastCrash: null,
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
      lastCrashAt: state.lastCrashAt,
      commandDispatchCount: state.commandDispatchCount,
      crashCount: state.crashCount,
      lastCommand: state.lastCommand ? {
        ...state.lastCommand,
        result: state.lastCommand.result && typeof state.lastCommand.result === 'object'
          ? { ...state.lastCommand.result }
          : state.lastCommand.result
      } : null,
      lastCrash: state.lastCrash ? {
        ...state.lastCrash,
        failure: state.lastCrash.failure ? { ...state.lastCrash.failure } : null,
        helperSlot: state.lastCrash.helperSlot ? {
          ...state.lastCrash.helperSlot,
          failurePolicy: state.lastCrash.helperSlot.failurePolicy
            ? { ...state.lastCrash.helperSlot.failurePolicy }
            : null,
          lastFailure: state.lastCrash.helperSlot.lastFailure ? { ...state.lastCrash.helperSlot.lastFailure } : null
        } : null
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
        helperSlots: activation.helperSlots.map((slot) => ({
          ...slot,
          failurePolicy: slot.failurePolicy ? { ...slot.failurePolicy } : null,
          lastFailure: slot.lastFailure ? { ...slot.lastFailure } : null
        })),
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
    listEvents() {
      return getStatus().recentEvents;
    },
    reportHelperCrash(activationId, crashEnvelope) {
      const recordIndex = state.activeRouteActivations.findIndex((entry) => entry.activationId === activationId);
      if (recordIndex === -1) {
        throw createActivationNotFoundError(activationId);
      }

      const activation = state.activeRouteActivations[recordIndex];
      const normalizedCrash = ensureHelperCrashEnvelope(crashEnvelope);
      const slotIndex = activation.helperSlots.findIndex((slot) => slot.slotId === normalizedCrash.slotId);
      if (slotIndex === -1) {
        throw createHelperSlotNotFoundError(activationId, normalizedCrash.slotId);
      }

      const slot = activation.helperSlots[slotIndex];
      if (!slot.helperPackageId) {
        throw createHelperSlotNotBoundError(activationId, normalizedCrash.slotId);
      }

      const crashedAt = timestamp(now);
      const failure = normalizeHelperCrashFailure(
        normalizedCrash,
        crashedAt,
        activationId,
        slot.slotId,
        slot.helperPackageId
      );
      slot.lastCrashAt = crashedAt;
      slot.lastFailure = failure;
      state.lastCrashAt = crashedAt;
      state.crashCount += 1;

      recordEvent('helper-crash-reported', {
        activationId,
        slotId: slot.slotId,
        helperPackageId: slot.helperPackageId,
        code: failure.code
      });

      const failurePolicy = slot.failurePolicy ?? {};
      const maxRestartsPerHour = Number(failurePolicy.maxRestartsPerHour ?? 0);
      const restartBudgetStartedAt = slot.restartWindowStartedAt
        ? Date.parse(slot.restartWindowStartedAt)
        : Number.NaN;
      const crashedAtValue = Date.parse(crashedAt);
      if (!slot.restartWindowStartedAt || Number.isNaN(restartBudgetStartedAt) || Number.isNaN(crashedAtValue) || (crashedAtValue - restartBudgetStartedAt) >= 3_600_000) {
        slot.restartWindowStartedAt = crashedAt;
        slot.restartWindowCount = 0;
      }

      if (failurePolicy.onCrash === 'restartable' && slot.restartWindowCount < maxRestartsPerHour) {
        slot.status = 'restarting';
        recordEvent('helper-restart-scheduled', {
          activationId,
          slotId: slot.slotId,
          helperPackageId: slot.helperPackageId,
          nextRestartCount: slot.restartCount + 1
        });
        slot.restartCount += 1;
        slot.restartWindowCount += 1;
        slot.lastRestartedAt = timestamp(now);
        slot.status = 'bound';
        activation.diagnostics = activation.diagnostics.filter((diagnostic) => !(diagnostic.slotId === slot.slotId && diagnostic.code === 'helper-crash-isolated'));
        state.lastCrash = {
          activationId,
          slotId: slot.slotId,
          helperPackageId: slot.helperPackageId,
          crashedAt,
          recoveryAction: 'restarted',
          failure,
          helperSlot: {
            ...slot,
            failurePolicy: slot.failurePolicy ? { ...slot.failurePolicy } : null,
            lastFailure: slot.lastFailure ? { ...slot.lastFailure } : null
          }
        };
        recordEvent('helper-restarted', {
          activationId,
          slotId: slot.slotId,
          helperPackageId: slot.helperPackageId,
          restartCount: slot.restartCount
        });
      }
      else {
        slot.status = 'degraded';
        activation.diagnostics = upsertActivationDiagnostic(
          activation.diagnostics,
          createHelperCrashDiagnostic(slot.slotId, slot.helperPackageId, failure)
        );
        state.lastCrash = {
          activationId,
          slotId: slot.slotId,
          helperPackageId: slot.helperPackageId,
          crashedAt,
          recoveryAction: 'degraded',
          failure,
          helperSlot: {
            ...slot,
            failurePolicy: slot.failurePolicy ? { ...slot.failurePolicy } : null,
            lastFailure: slot.lastFailure ? { ...slot.lastFailure } : null
          }
        };
        recordEvent('helper-crash-isolated', {
          activationId,
          slotId: slot.slotId,
          helperPackageId: slot.helperPackageId,
          code: failure.code
        });
      }

      return {
        activationId,
        slotId: slot.slotId,
        helperPackageId: slot.helperPackageId,
        crashedAt,
        recoveryAction: state.lastCrash.recoveryAction,
        failure,
        helperSlot: {
          ...slot,
          failurePolicy: slot.failurePolicy ? { ...slot.failurePolicy } : null,
          lastFailure: slot.lastFailure ? { ...slot.lastFailure } : null
        }
      };
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
