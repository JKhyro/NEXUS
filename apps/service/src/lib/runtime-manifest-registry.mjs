import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createId } from './ids.mjs';

const MANIFEST_DIRECTORY = ['config', 'runtime-packages'];

const SURFACE_REQUIRED_FIELDS = [
  'packageId',
  'displayName',
  'surfaceKind',
  'manifestVersion',
  'abiVersion',
  'entrypoint',
  'hostCapabilities',
  'routing',
  'failurePolicy'
];

const HELPER_REQUIRED_FIELDS = [
  'packageId',
  'displayName',
  'manifestVersion',
  'sourceRuntime',
  'version',
  'hostingMode',
  'capabilities',
  'failurePolicy',
  'presentationHooks'
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toStringArray(value, fieldName, packageId) {
  if (!Array.isArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    throw new Error(`Runtime manifest ${packageId} must declare ${fieldName} as an array of non-empty strings.`);
  }

  return value.map((entry) => entry.trim());
}

function assertRequiredFields(manifest, requiredFields, manifestType) {
  for (const fieldName of requiredFields) {
    if (!(fieldName in manifest)) {
      throw new Error(`${manifestType} manifest is missing required field ${fieldName}.`);
    }
  }
}

function inferManifestType(manifest) {
  if (isNonEmptyString(manifest.surfaceKind)) {
    return 'surface';
  }

  if (isNonEmptyString(manifest.sourceRuntime)) {
    return 'helper';
  }

  throw new Error('Runtime manifest must declare either surfaceKind or sourceRuntime.');
}

function normalizeSurfaceManifest(manifest, sourcePath) {
  assertRequiredFields(manifest, SURFACE_REQUIRED_FIELDS, 'surface');
  const packageId = manifest.packageId;
  if (!isNonEmptyString(packageId)) {
    throw new Error('surface manifest packageId must be a non-empty string.');
  }

  return {
    ...manifest,
    packageId: packageId.trim(),
    displayName: manifest.displayName.trim(),
    surfaceKind: manifest.surfaceKind.trim(),
    manifestVersion: String(manifest.manifestVersion).trim(),
    abiVersion: String(manifest.abiVersion).trim(),
    hostCapabilities: toStringArray(manifest.hostCapabilities, 'hostCapabilities', packageId),
    helperSlots: Array.isArray(manifest.helperSlots)
      ? manifest.helperSlots
        .filter((slot) => slot && typeof slot === 'object' && isNonEmptyString(slot.slotId))
        .map((slot) => ({
          slotId: slot.slotId.trim(),
          allowedKinds: Array.isArray(slot.allowedKinds)
            ? slot.allowedKinds.filter(isNonEmptyString).map((entry) => entry.trim())
            : []
        }))
      : [],
    sourcePath
  };
}

function normalizeHelperManifest(manifest, sourcePath) {
  assertRequiredFields(manifest, HELPER_REQUIRED_FIELDS, 'helper');
  const packageId = manifest.packageId;
  if (!isNonEmptyString(packageId)) {
    throw new Error('helper manifest packageId must be a non-empty string.');
  }

  return {
    ...manifest,
    packageId: packageId.trim(),
    displayName: manifest.displayName.trim(),
    manifestVersion: String(manifest.manifestVersion).trim(),
    version: String(manifest.version).trim(),
    sourceRuntime: manifest.sourceRuntime.trim(),
    hostingMode: manifest.hostingMode.trim(),
    capabilities: toStringArray(manifest.capabilities, 'capabilities', packageId),
    presentationHooks: toStringArray(manifest.presentationHooks, 'presentationHooks', packageId),
    slotTargets: Array.isArray(manifest.slotTargets)
      ? manifest.slotTargets
        .filter((target) => target && typeof target === 'object' && isNonEmptyString(target.surfacePackageId) && isNonEmptyString(target.slotId))
        .map((target) => ({
          surfacePackageId: target.surfacePackageId.trim(),
          slotId: target.slotId.trim()
        }))
      : [],
    sourcePath
  };
}

async function loadManifestSnapshot(repoRoot) {
  const manifestDirectory = join(repoRoot, ...MANIFEST_DIRECTORY);
  const entries = await readdir(manifestDirectory, { withFileTypes: true });
  const surfacePackages = new Map();
  const helperPackages = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const sourcePath = join(manifestDirectory, entry.name);
    const manifest = JSON.parse(await readFile(sourcePath, 'utf8'));
    const manifestType = inferManifestType(manifest);
    if (manifestType === 'surface') {
      const normalized = normalizeSurfaceManifest(manifest, sourcePath);
      surfacePackages.set(normalized.packageId, normalized);
      continue;
    }

    const normalized = normalizeHelperManifest(manifest, sourcePath);
    helperPackages.set(normalized.packageId, normalized);
  }

  return {
    manifestDirectory,
    loadedAt: new Date().toISOString(),
    surfacePackages,
    helperPackages
  };
}

function ensureRouteEnvelope(routeEnvelope) {
  if (!routeEnvelope || typeof routeEnvelope !== 'object' || Array.isArray(routeEnvelope)) {
    throw new RuntimeRouteActivationError('Route activation requires a JSON object payload.', {
      code: 'invalid-route-envelope',
      statusCode: 400
    });
  }

  const requiredStringFields = ['actorId', 'workspaceId', 'surfaceKind', 'scopeId', 'surfacePackageId'];
  for (const fieldName of requiredStringFields) {
    if (!isNonEmptyString(routeEnvelope[fieldName])) {
      throw new RuntimeRouteActivationError(`Route activation field ${fieldName} must be a non-empty string.`, {
        code: 'invalid-route-envelope',
        statusCode: 400,
        details: { field: fieldName }
      });
    }
  }

  if (routeEnvelope.selectedMessageId !== undefined && !isNonEmptyString(routeEnvelope.selectedMessageId)) {
    throw new RuntimeRouteActivationError('Route activation field selectedMessageId must be omitted or be a non-empty string.', {
      code: 'invalid-route-envelope',
      statusCode: 400,
      details: { field: 'selectedMessageId' }
    });
  }

  if (routeEnvelope.routeCapabilities !== undefined && (!Array.isArray(routeEnvelope.routeCapabilities) || routeEnvelope.routeCapabilities.some((entry) => !isNonEmptyString(entry)))) {
    throw new RuntimeRouteActivationError('Route activation field routeCapabilities must be an array of non-empty strings.', {
      code: 'invalid-route-envelope',
      statusCode: 400,
      details: { field: 'routeCapabilities' }
    });
  }

  if (routeEnvelope.helperSlotRequests !== undefined && !Array.isArray(routeEnvelope.helperSlotRequests)) {
    throw new RuntimeRouteActivationError('Route activation field helperSlotRequests must be an array.', {
      code: 'invalid-route-envelope',
      statusCode: 400,
      details: { field: 'helperSlotRequests' }
    });
  }

  const helperSlotRequests = (routeEnvelope.helperSlotRequests ?? []).map((request, index) => {
    if (!request || typeof request !== 'object' || Array.isArray(request) || !isNonEmptyString(request.slotId)) {
      throw new RuntimeRouteActivationError('Each helperSlotRequest must declare a non-empty slotId.', {
        code: 'invalid-route-envelope',
        statusCode: 400,
        details: { field: `helperSlotRequests[${index}].slotId` }
      });
    }

    if (request.preferredHelperPackageId !== undefined && !isNonEmptyString(request.preferredHelperPackageId)) {
      throw new RuntimeRouteActivationError('preferredHelperPackageId must be omitted or be a non-empty string.', {
        code: 'invalid-route-envelope',
        statusCode: 400,
        details: { field: `helperSlotRequests[${index}].preferredHelperPackageId` }
      });
    }

    return {
      slotId: request.slotId.trim(),
      preferredHelperPackageId: isNonEmptyString(request.preferredHelperPackageId)
        ? request.preferredHelperPackageId.trim()
        : null
    };
  });

  return {
    actorId: routeEnvelope.actorId.trim(),
    workspaceId: routeEnvelope.workspaceId.trim(),
    surfaceKind: routeEnvelope.surfaceKind.trim(),
    scopeId: routeEnvelope.scopeId.trim(),
    selectedMessageId: isNonEmptyString(routeEnvelope.selectedMessageId) ? routeEnvelope.selectedMessageId.trim() : null,
    surfacePackageId: routeEnvelope.surfacePackageId.trim(),
    routeCapabilities: (routeEnvelope.routeCapabilities ?? []).map((entry) => entry.trim()),
    helperSlotRequests
  };
}

function createHelperDiagnostic(code, slotId, message, helperPackageId = null) {
  return {
    level: 'warning',
    code,
    slotId,
    helperPackageId,
    message
  };
}

function resolveHelperSlotRequest(surfaceManifest, helperPackages, request) {
  const slotDefinition = surfaceManifest.helperSlots.find((slot) => slot.slotId === request.slotId);
  if (!slotDefinition) {
    return {
      slotId: request.slotId,
      status: 'degraded',
      allowedKinds: [],
      helper: null,
      diagnostics: [
        createHelperDiagnostic(
          'slot-not-declared',
          request.slotId,
          `Surface package ${surfaceManifest.packageId} does not declare helper slot ${request.slotId}.`,
          request.preferredHelperPackageId
        )
      ]
    };
  }

  if (!request.preferredHelperPackageId) {
    return {
      slotId: request.slotId,
      status: 'reserved',
      allowedKinds: slotDefinition.allowedKinds,
      helper: null,
      diagnostics: []
    };
  }

  const helperManifest = helperPackages.get(request.preferredHelperPackageId);
  if (!helperManifest) {
    return {
      slotId: request.slotId,
      status: 'degraded',
      allowedKinds: slotDefinition.allowedKinds,
      helper: null,
      diagnostics: [
        createHelperDiagnostic(
          'helper-package-not-found',
          request.slotId,
          `Helper package ${request.preferredHelperPackageId} is not present in the runtime manifest registry.`,
          request.preferredHelperPackageId
        )
      ]
    };
  }

  const targetedSlot = helperManifest.slotTargets.some((target) => (
    target.surfacePackageId === surfaceManifest.packageId
    && target.slotId === request.slotId
  ));
  if (!targetedSlot) {
    return {
      slotId: request.slotId,
      status: 'degraded',
      allowedKinds: slotDefinition.allowedKinds,
      helper: null,
      diagnostics: [
        createHelperDiagnostic(
          'helper-slot-target-mismatch',
          request.slotId,
          `Helper package ${helperManifest.packageId} is not targeted to ${surfaceManifest.packageId}:${request.slotId}.`,
          helperManifest.packageId
        )
      ]
    };
  }

  const minSurfaceAbi = helperManifest.compatibility?.minSurfaceAbi;
  if (isNonEmptyString(minSurfaceAbi) && Number(surfaceManifest.abiVersion) < Number(minSurfaceAbi)) {
    return {
      slotId: request.slotId,
      status: 'degraded',
      allowedKinds: slotDefinition.allowedKinds,
      helper: null,
      diagnostics: [
        createHelperDiagnostic(
          'helper-surface-abi-incompatible',
          request.slotId,
          `Helper package ${helperManifest.packageId} requires surface ABI ${minSurfaceAbi} but ${surfaceManifest.packageId} exposes ${surfaceManifest.abiVersion}.`,
          helperManifest.packageId
        )
      ]
    };
  }

  return {
    slotId: request.slotId,
    status: 'bound',
    allowedKinds: slotDefinition.allowedKinds,
    helper: {
      packageId: helperManifest.packageId,
      displayName: helperManifest.displayName,
      sourceRuntime: helperManifest.sourceRuntime,
      version: helperManifest.version,
      hostingMode: helperManifest.hostingMode,
      capabilities: helperManifest.capabilities,
      presentationHooks: helperManifest.presentationHooks,
      failurePolicy: helperManifest.failurePolicy
    },
    diagnostics: []
  };
}

function createActivationResult(routeEnvelope, surfaceManifest, helperSlots, snapshot) {
  const diagnostics = helperSlots.flatMap((slot) => slot.diagnostics);
  return {
    activationId: createId('route-activation'),
    activatedAt: new Date().toISOString(),
    route: {
      actorId: routeEnvelope.actorId,
      workspaceId: routeEnvelope.workspaceId,
      surfaceKind: routeEnvelope.surfaceKind,
      scopeId: routeEnvelope.scopeId,
      selectedMessageId: routeEnvelope.selectedMessageId,
      surfacePackageId: routeEnvelope.surfacePackageId,
      grantedCapabilities: routeEnvelope.routeCapabilities
    },
    surface: {
      packageId: surfaceManifest.packageId,
      displayName: surfaceManifest.displayName,
      surfaceKind: surfaceManifest.surfaceKind,
      abiVersion: surfaceManifest.abiVersion,
      manifestVersion: surfaceManifest.manifestVersion,
      routing: surfaceManifest.routing,
      entrypoint: surfaceManifest.entrypoint,
      hostCapabilities: surfaceManifest.hostCapabilities,
      failurePolicy: surfaceManifest.failurePolicy
    },
    helperSlots,
    diagnostics,
    registry: {
      manifestDirectory: snapshot.manifestDirectory,
      loadedAt: snapshot.loadedAt,
      surfacePackageCount: snapshot.surfacePackages.size,
      helperPackageCount: snapshot.helperPackages.size
    }
  };
}

export class RuntimeRouteActivationError extends Error {
  constructor(message, { code = 'route-activation-failed', statusCode = 400, details = null } = {}) {
    super(message);
    this.name = 'RuntimeRouteActivationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function createRuntimeManifestRegistry({ repoRoot }) {
  let snapshotPromise = null;

  async function getSnapshot() {
    if (!snapshotPromise) {
      snapshotPromise = loadManifestSnapshot(repoRoot);
    }
    return snapshotPromise;
  }

  return {
    async getSummary() {
      const snapshot = await getSnapshot();
      return {
        manifestDirectory: snapshot.manifestDirectory,
        loadedAt: snapshot.loadedAt,
        surfacePackageCount: snapshot.surfacePackages.size,
        helperPackageCount: snapshot.helperPackages.size
      };
    },
    async activateRoute(routeEnvelope) {
      const normalizedRoute = ensureRouteEnvelope(routeEnvelope);
      const snapshot = await getSnapshot();
      const surfaceManifest = snapshot.surfacePackages.get(normalizedRoute.surfacePackageId);

      if (!surfaceManifest) {
        throw new RuntimeRouteActivationError(`Surface package ${normalizedRoute.surfacePackageId} is not present in the runtime manifest registry.`, {
          code: 'surface-package-not-found',
          statusCode: 404,
          details: { surfacePackageId: normalizedRoute.surfacePackageId }
        });
      }

      if (surfaceManifest.surfaceKind !== normalizedRoute.surfaceKind) {
        throw new RuntimeRouteActivationError(
          `Surface package ${surfaceManifest.packageId} is declared for ${surfaceManifest.surfaceKind} routes, not ${normalizedRoute.surfaceKind}.`,
          {
            code: 'surface-kind-mismatch',
            statusCode: 400,
            details: {
              surfacePackageId: surfaceManifest.packageId,
              expectedSurfaceKind: normalizedRoute.surfaceKind,
              actualSurfaceKind: surfaceManifest.surfaceKind
            }
          }
        );
      }

      const unsupportedCapability = normalizedRoute.routeCapabilities.find(
        (capability) => !surfaceManifest.hostCapabilities.includes(capability)
      );
      if (unsupportedCapability) {
        throw new RuntimeRouteActivationError(
          `Route capability ${unsupportedCapability} is not approved by surface package ${surfaceManifest.packageId}.`,
          {
            code: 'route-capability-not-approved',
            statusCode: 400,
            details: {
              surfacePackageId: surfaceManifest.packageId,
              capability: unsupportedCapability
            }
          }
        );
      }

      const helperSlots = normalizedRoute.helperSlotRequests.map((request) => (
        resolveHelperSlotRequest(surfaceManifest, snapshot.helperPackages, request)
      ));

      return createActivationResult(normalizedRoute, surfaceManifest, helperSlots, snapshot);
    }
  };
}
