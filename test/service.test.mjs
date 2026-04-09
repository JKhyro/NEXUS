import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNexusService } from '../apps/service/src/server.mjs';
import { resolveServiceConfig } from '../apps/service/src/lib/config.mjs';
import { createInProcessRuntimeAdapter } from '../apps/service/src/lib/runtime-adapter.mjs';
import { createStore } from '../apps/service/src/lib/store-factory.mjs';

async function withService(run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'nexus-'));
  const service = await createNexusService({ dataDir, port: 0, storageMode: 'json' });
  await service.start();
  try {
    await run(service);
  }
  finally {
    await service.stop();
  }
}

function createFailingManifestRegistry(code = 'TEST_RUNTIME_SUPERVISOR_BOOT_FAILED') {
  return {
    async getSummary() {
      const error = new Error('Synthetic runtime supervisor bootstrap failure.');
      error.code = code;
      throw error;
    },
    async activateRoute() {
      throw new Error('activateRoute should not execute when the runtime supervisor is degraded.');
    }
  };
}

test('service boots and exposes the seeded internal channel map', async () => {
  await withService(async (service) => {
    const health = await fetch(`${service.url}/api/health`).then((response) => response.json());
    assert.equal(health.status, 'ok');
    assert.equal(health.runtime.owner, 'node-transition-adapter');
    assert.equal(health.runtime.targetOwner, 'native-runtime-core');
    assert.equal(health.runtime.transitionSeam, 'service-runtime-boundary');
    assert.equal(health.runtime.readiness, 'ready');
    assert.equal(health.runtime.backingImplementation, 'in-process-store');
    assert.equal(health.runtime.lifecycleState, 'running');
    assert.equal(health.runtime.lastCommandAt, null);
    assert.equal(health.runtime.commandDispatchCount, 0);
    assert.equal(health.runtime.lastCommand, null);
    assert.equal(health.runtime.activeRouteActivationCount, 0);
    assert.deepEqual(health.runtime.activeRouteActivations, []);
    assert.equal(health.runtime.manifestRegistry.surfacePackageCount, 4);
    assert.equal(health.runtime.manifestRegistry.helperPackageCount, 1);
    assert.equal(health.runtime.supervisor.transitionSeam, 'service-runtime-supervisor-boundary');
    assert.equal(health.runtime.supervisor.readiness, 'ready');
    assert.equal(health.runtime.supervisor.lifecycleState, 'running');
    assert.equal(health.runtime.supervisor.startupAttemptCount, 1);
    assert.equal(health.runtime.supervisor.activeRouteActivationCount, 0);
    assert(health.runtime.supervisor.recentEvents.some((event) => event.type === 'start-attempt'));
    assert(health.runtime.supervisor.recentEvents.some((event) => event.type === 'start-succeeded'));

    const workspaces = await fetch(`${service.url}/api/workspaces?actorId=identity-jack`).then((response) => response.json());
    assert.equal(workspaces.length, 1);

    const channels = await fetch(`${service.url}/api/channels?actorId=identity-jack&workspaceId=workspace-internal-core`).then((response) => response.json());
    const slugs = new Set(channels.map((channel) => channel.slug));
    assert(slugs.has('workflow'));
    assert(slugs.has('report'));
    assert(slugs.has('investigation'));
    assert(slugs.has('digest-agent'));
    assert(slugs.has('hera'));
    assert(slugs.has('librarian'));
  });
});

test('service boots in degraded mode when the runtime supervisor startup fails', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nexus-supervisor-'));
  const bootstrapFailureCode = 'TEST_RUNTIME_SUPERVISOR_BOOT_FAILED';
  const service = await createNexusService({
    dataDir,
    port: 0,
    storageMode: 'json',
    runtimeAdapterFactory: ({ config, store, contractVersion }) => createInProcessRuntimeAdapter({
      config,
      store,
      contractVersion,
      manifestRegistry: createFailingManifestRegistry(bootstrapFailureCode)
    })
  });

  await service.start();
  try {
    const healthResponse = await fetch(`${service.url}/api/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, 'degraded');
    assert.equal(health.runtime.readiness, 'degraded');
    assert.equal(health.runtime.lifecycleState, 'start-failed');
    assert.equal(health.runtime.supervisor.transitionSeam, 'service-runtime-supervisor-boundary');
    assert.equal(health.runtime.supervisor.lifecycleState, 'start-failed');
    assert.equal(health.runtime.supervisor.lastFailure.code, bootstrapFailureCode);
    assert(health.runtime.supervisor.recentEvents.some((event) => event.type === 'start-failed'));

    const workspacesResponse = await fetch(`${service.url}/api/workspaces?actorId=identity-jack`);
    const workspaces = await workspacesResponse.json();
    assert.equal(workspacesResponse.status, 200);
    assert.equal(workspaces.length, 1);

    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read'
        ],
        helperSlotRequests: []
      })
    });
    const activation = await activationResponse.json();
    assert.equal(activationResponse.status, 503);
    assert.equal(activation.code, 'runtime-supervisor-not-ready');
    assert.equal(activation.details.supervisor.lifecycleState, 'start-failed');
    assert.equal(activation.details.supervisor.lastFailure.code, bootstrapFailureCode);
  }
  finally {
    await service.stop();
  }
});

test('route activation resolves a manifest-backed thread surface and compatible helper slot', async () => {
  await withService(async (service) => {
    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        selectedMessageId: 'msg-001',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read',
          'message.compose',
          'coordination.focus'
        ],
        helperSlotRequests: [
          {
            slotId: 'thread-sidebar',
            preferredHelperPackageId: 'symbiosis.helper.review'
          }
        ]
      })
    });
    const activation = await activationResponse.json();

    assert.equal(activationResponse.status, 200);
    assert.match(activation.activationId, /^route-activation-/);
    assert.equal(activation.route.surfaceKind, 'thread');
    assert.equal(activation.route.scopeId, 'thread-roadmap-71');
    assert.equal(activation.surface.packageId, 'nexus.surface.thread');
    assert.deepEqual(activation.route.grantedCapabilities, [
      'conversation.read',
      'message.compose',
      'coordination.focus'
    ]);
    assert.equal(activation.helperSlots.length, 1);
    assert.equal(activation.helperSlots[0].slotId, 'thread-sidebar');
    assert.equal(activation.helperSlots[0].status, 'bound');
    assert.equal(activation.helperSlots[0].helper.packageId, 'symbiosis.helper.review');
    assert.equal(activation.helperSlots[0].helper.sourceRuntime, 'SYMBIOSIS');
    assert.deepEqual(activation.helperSlots[0].helper.capabilities, [
      'message.inspect',
      'coordination.suggest'
    ]);
    assert.deepEqual(activation.diagnostics, []);
  });
});

test('route activation resolves a manifest-backed channel surface and compatible helper slot', async () => {
  await withService(async (service) => {
    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'channel',
        scopeId: 'channel-workflow',
        surfacePackageId: 'nexus.surface.channel',
        routeCapabilities: [
          'conversation.read',
          'message.compose',
          'route.selection'
        ],
        helperSlotRequests: [
          {
            slotId: 'channel-sidebar',
            preferredHelperPackageId: 'symbiosis.helper.review'
          }
        ]
      })
    });
    const activation = await activationResponse.json();

    assert.equal(activationResponse.status, 200);
    assert.equal(activation.route.surfaceKind, 'channel');
    assert.equal(activation.route.scopeId, 'channel-workflow');
    assert.equal(activation.surface.packageId, 'nexus.surface.channel');
    assert.equal(activation.helperSlots.length, 1);
    assert.equal(activation.helperSlots[0].status, 'bound');
    assert.equal(activation.helperSlots[0].helper.packageId, 'symbiosis.helper.review');
    assert.deepEqual(activation.diagnostics, []);
  });
});

test('route activation resolves a manifest-backed forum surface and compatible helper slot', async () => {
  await withService(async (service) => {
    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'forum',
        scopeId: 'channel-report',
        surfacePackageId: 'nexus.surface.forum',
        routeCapabilities: [
          'conversation.read',
          'route.selection'
        ],
        helperSlotRequests: [
          {
            slotId: 'forum-insights',
            preferredHelperPackageId: 'symbiosis.helper.review'
          }
        ]
      })
    });
    const activation = await activationResponse.json();

    assert.equal(activationResponse.status, 200);
    assert.equal(activation.route.surfaceKind, 'forum');
    assert.equal(activation.surface.packageId, 'nexus.surface.forum');
    assert.equal(activation.helperSlots.length, 1);
    assert.equal(activation.helperSlots[0].status, 'bound');
    assert.deepEqual(activation.diagnostics, []);
  });
});

test('route activation resolves a manifest-backed direct surface and compatible helper slot', async () => {
  await withService(async (service) => {
    const directConversation = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'direct',
        scopeId: directConversation.id,
        surfacePackageId: 'nexus.surface.direct',
        routeCapabilities: [
          'conversation.read',
          'message.compose'
        ],
        helperSlotRequests: [
          {
            slotId: 'participant-card',
            preferredHelperPackageId: 'symbiosis.helper.review'
          }
        ]
      })
    });
    const activation = await activationResponse.json();

    assert.equal(activationResponse.status, 200);
    assert.equal(activation.route.surfaceKind, 'direct');
    assert.equal(activation.route.scopeId, directConversation.id);
    assert.equal(activation.surface.packageId, 'nexus.surface.direct');
    assert.equal(activation.helperSlots.length, 1);
    assert.equal(activation.helperSlots[0].status, 'bound');
    assert.deepEqual(activation.diagnostics, []);
  });
});

test('route activation is retained as supervisor-owned runtime state and can be released', async () => {
  await withService(async (service) => {
    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read',
          'message.compose'
        ],
        helperSlotRequests: [
          {
            slotId: 'thread-sidebar',
            preferredHelperPackageId: 'symbiosis.helper.review'
          }
        ]
      })
    });
    const activation = await activationResponse.json();

    assert.equal(activationResponse.status, 200);

    const activeActivationsResponse = await fetch(`${service.url}/api/runtime/route-activations`);
    const activeActivations = await activeActivationsResponse.json();
    assert.equal(activeActivationsResponse.status, 200);
    assert.equal(activeActivations.length, 1);
    assert.equal(activeActivations[0].activationId, activation.activationId);
    assert.equal(activeActivations[0].route.surfaceKind, 'thread');
    assert.equal(activeActivations[0].surface.packageId, 'nexus.surface.thread');
    assert.equal(activeActivations[0].helperSlots[0].helperPackageId, 'symbiosis.helper.review');

    const healthWhileActive = await fetch(`${service.url}/api/health`).then((response) => response.json());
    assert.equal(healthWhileActive.runtime.activeRouteActivationCount, 1);
    assert.equal(healthWhileActive.runtime.activeRouteActivations[0].activationId, activation.activationId);
    assert.equal(healthWhileActive.runtime.supervisor.activeRouteActivationCount, 1);
    assert(healthWhileActive.runtime.supervisor.recentEvents.some((event) => event.type === 'route-activated'));

    const releasedResponse = await fetch(
      `${service.url}/api/runtime/route-activations?activationId=${encodeURIComponent(activation.activationId)}`,
      { method: 'DELETE' }
    );
    const released = await releasedResponse.json();
    assert.equal(releasedResponse.status, 200);
    assert.equal(released.activationId, activation.activationId);
    assert.match(released.releasedAt, /\d{4}-\d{2}-\d{2}T/);

    const healthAfterRelease = await fetch(`${service.url}/api/health`).then((response) => response.json());
    assert.equal(healthAfterRelease.runtime.activeRouteActivationCount, 0);
    assert.deepEqual(healthAfterRelease.runtime.activeRouteActivations, []);
    assert.equal(healthAfterRelease.runtime.supervisor.activeRouteActivationCount, 0);
    assert(healthAfterRelease.runtime.supervisor.recentEvents.some((event) => event.type === 'route-released'));
  });
});

test('runtime command dispatch is retained as supervisor-owned lifecycle state', async () => {
  await withService(async (service) => {
    const activation = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read',
          'message.compose'
        ],
        helperSlotRequests: []
      })
    }).then((response) => response.json());

    const commandResponse = await fetch(`${service.url}/api/runtime/route-activations/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activationId: activation.activationId,
        commandType: 'set-lifecycle-state',
        requiredCapability: 'conversation.read',
        targetLifecycleState: 'background',
        payload: {
          reason: 'operator-opened-another-surface'
        }
      })
    });
    const command = await commandResponse.json();

    assert.equal(commandResponse.status, 200);
    assert.match(command.commandId, /^runtime-command-/);
    assert.equal(command.activationId, activation.activationId);
    assert.equal(command.commandType, 'set-lifecycle-state');
    assert.equal(command.targetLifecycleState, 'background');
    assert.equal(command.dispatchOwner, 'node-runtime-supervisor');
    assert.equal(command.targetOwner, 'native-runtime-supervisor');
    assert.equal(command.result.accepted, true);
    assert.equal(command.result.handlingMode, 'transition-adapter');
    assert.equal(command.result.surfacePackageId, 'nexus.surface.thread');
    assert.deepEqual(command.result.echoedPayload, {
      reason: 'operator-opened-another-surface'
    });

    const activeActivations = await fetch(`${service.url}/api/runtime/route-activations`).then((response) => response.json());
    assert.equal(activeActivations.length, 1);
    assert.equal(activeActivations[0].activationId, activation.activationId);
    assert.equal(activeActivations[0].lifecycleState, 'background');
    assert.equal(activeActivations[0].commandDispatchCount, 1);
    assert.equal(activeActivations[0].lastCommand.commandId, command.commandId);
    assert.equal(activeActivations[0].lastCommand.targetLifecycleState, 'background');
    assert.equal(activeActivations[0].lastCommandFailure, null);

    const health = await fetch(`${service.url}/api/health`).then((response) => response.json());
    assert.equal(health.runtime.commandDispatchCount, 1);
    assert.equal(health.runtime.lastCommand.commandId, command.commandId);
    assert.equal(health.runtime.activeRouteActivations[0].lifecycleState, 'background');
    assert(health.runtime.supervisor.recentEvents.some((event) => event.type === 'command-dispatch-started'));
    assert(health.runtime.supervisor.recentEvents.some((event) => event.type === 'command-dispatched'));
  });
});

test('releasing an unknown runtime activation returns a stable not-found error', async () => {
  await withService(async (service) => {
    const releaseResponse = await fetch(
      `${service.url}/api/runtime/route-activations?activationId=${encodeURIComponent('route-activation-missing')}`,
      { method: 'DELETE' }
    );
    const body = await releaseResponse.json();

    assert.equal(releaseResponse.status, 404);
    assert.equal(body.code, 'runtime-activation-not-found');
    assert.equal(body.details.activationId, 'route-activation-missing');
  });
});

test('runtime command dispatch rejects unsupported capability use and invalid payloads', async () => {
  await withService(async (service) => {
    const activation = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read'
        ],
        helperSlotRequests: []
      })
    }).then((response) => response.json());

    const deniedResponse = await fetch(`${service.url}/api/runtime/route-activations/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activationId: activation.activationId,
        commandType: 'set-lifecycle-state',
        requiredCapability: 'runtime.admin',
        targetLifecycleState: 'suspended'
      })
    });
    const denied = await deniedResponse.json();
    assert.equal(deniedResponse.status, 403);
    assert.equal(denied.code, 'runtime-command-capability-denied');
    assert.equal(denied.details.activationId, activation.activationId);
    assert.equal(denied.details.requiredCapability, 'runtime.admin');

    const invalidResponse = await fetch(`${service.url}/api/runtime/route-activations/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activationId: activation.activationId,
        commandType: '',
        targetLifecycleState: 'invalid-state'
      })
    });
    const invalid = await invalidResponse.json();
    assert.equal(invalidResponse.status, 400);
    assert.equal(invalid.code, 'runtime-command-invalid');

    const missingResponse = await fetch(`${service.url}/api/runtime/route-activations/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activationId: 'route-activation-missing',
        commandType: 'refresh-surface'
      })
    });
    const missing = await missingResponse.json();
    assert.equal(missingResponse.status, 404);
    assert.equal(missing.code, 'runtime-activation-not-found');
  });
});

test('route activation degrades an incompatible helper slot without failing the route', async () => {
  await withService(async (service) => {
    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read'
        ],
        helperSlotRequests: [
          {
            slotId: 'thread-sidebar',
            preferredHelperPackageId: 'symbiosis.helper.unknown'
          },
          {
            slotId: 'thread-inline',
            preferredHelperPackageId: 'symbiosis.helper.review'
          }
        ]
      })
    });
    const activation = await activationResponse.json();

    assert.equal(activationResponse.status, 200);
    assert.equal(activation.helperSlots.length, 2);
    assert.equal(activation.helperSlots[0].status, 'degraded');
    assert.equal(activation.helperSlots[0].helper, null);
    assert.equal(activation.helperSlots[0].diagnostics[0].code, 'helper-package-not-found');
    assert.equal(activation.helperSlots[1].status, 'degraded');
    assert.equal(activation.helperSlots[1].diagnostics[0].code, 'slot-not-declared');
    assert.equal(activation.diagnostics.length, 2);
    assert.deepEqual(
      activation.diagnostics.map((entry) => entry.code),
      ['helper-package-not-found', 'slot-not-declared']
    );
  });
});

test('route activation rejects route capabilities not approved by the selected surface package', async () => {
  await withService(async (service) => {
    const activationResponse = await fetch(`${service.url}/api/runtime/route-activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        workspaceId: 'workspace-internal-core',
        surfaceKind: 'thread',
        scopeId: 'thread-roadmap-71',
        surfacePackageId: 'nexus.surface.thread',
        routeCapabilities: [
          'conversation.read',
          'runtime.admin'
        ],
        helperSlotRequests: []
      })
    });
    const body = await activationResponse.json();

    assert.equal(activationResponse.status, 400);
    assert.equal(body.code, 'route-capability-not-approved');
    assert.equal(body.details.capability, 'runtime.admin');
  });
});

test('activity endpoint summarizes recent readable channel and direct changes', async () => {
  await withService(async (service) => {
    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-workflow',
        body: 'Workflow activity snapshot'
      })
    });

    const directConversation = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-kira',
        scopeType: 'direct',
        scopeId: directConversation.id,
        body: 'Direct activity snapshot'
      })
    });

    const activity = await fetch(
      `${service.url}/api/activity?actorId=identity-jack&workspaceId=workspace-internal-core`
    ).then((response) => response.json());

    const workflow = activity.find((entry) => entry.scopeType === 'channel' && entry.scopeId === 'channel-workflow');
    const direct = activity.find((entry) => entry.scopeType === 'direct' && entry.scopeId === directConversation.id);

    assert(workflow);
    assert.equal(workflow.preview, 'Workflow activity snapshot');
    assert.equal(workflow.activityKind, 'message');

    assert(direct);
    assert.equal(direct.preview, 'Direct activity snapshot');
    assert.equal(direct.activityKind, 'message');
    assert.equal(direct.directConversationId, directConversation.id);
  });
});

test('messages persist across service restarts', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nexus-'));

  let service = await createNexusService({ dataDir, port: 0, storageMode: 'json' });
  await service.start();
  await fetch(`${service.url}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      actorId: 'identity-jack',
      scopeType: 'channel',
      scopeId: 'channel-workflow',
      body: 'Persistence check'
    })
  });
  await service.stop();

  service = await createNexusService({ dataDir, port: 0, storageMode: 'json' });
  await service.start();
  try {
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=channel&scopeId=channel-workflow`).then((response) => response.json());
    assert(messages.some((message) => message.body === 'Persistence check'));
  }
  finally {
    await service.stop();
  }
});

test('private channel reads are blocked by access policy', async () => {
  await withService(async (service) => {
    const response = await fetch(`${service.url}/api/messages?actorId=identity-yura&scopeType=channel&scopeId=channel-hera`);
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.match(body.error, /not allowed/i);
  });
});

test('channel write policy can be narrower than channel read policy', async () => {
  await withService(async (service) => {
    const readable = await fetch(`${service.url}/api/messages?actorId=identity-librarian&scopeType=channel&scopeId=channel-investigation`);
    assert.equal(readable.status, 200);

    const writeAttempt = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-librarian',
        scopeType: 'channel',
        scopeId: 'channel-investigation',
        body: 'Curator note in a read-only lane'
      })
    });
    const body = await writeAttempt.json();
    assert.equal(writeAttempt.status, 500);
    assert.match(body.error, /write/i);
  });
});

test('discord adapter ingress maps transport events into NEXUS channels and persists cutover diagnostics', async () => {
  await withService(async (service) => {
    const ingested = await fetch(`${service.url}/api/adapters/discord/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'message.created',
        externalChannelId: '1481091195013955664',
        externalMessageId: 'discord-123',
        actorId: 'identity-kira',
        content: 'Adapter ingress message',
        handoff: {
          toIdentityId: 'identity-librarian',
          rationale: 'Needs curator follow-up after ingress'
        }
      })
    }).then((response) => response.json());

    const messages = await fetch(`${service.url}/api/messages?actorId=identity-kira&scopeType=channel&scopeId=channel-workflow`).then((response) => response.json());
    const relays = await fetch(`${service.url}/api/relays?actorId=identity-kira&scopeType=channel&scopeId=channel-workflow`).then((response) => response.json());
    const handoffs = await fetch(`${service.url}/api/handoffs?actorId=identity-kira&scopeType=channel&scopeId=channel-workflow`).then((response) => response.json());
    const found = messages.find((message) => message.body === 'Adapter ingress message');
    assert(found);
    assert.equal(found.source.system, 'discord');
    assert.equal(ingested.relayId, relays[0].id);
    assert.equal(ingested.handoffId, handoffs[0].id);
    assert.equal(relays.length, 1);
    assert.equal(relays[0].messageId, found.id);
    assert.equal(relays[0].reason, 'Discord adapter ingress');
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].toIdentityId, 'identity-librarian');
  });
});

test('ANVIL references can attach to readable messages', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Attach ANVIL reference'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'message',
        ownerId: created.message.id,
        system: 'anvil',
        relationType: 'tracks',
        externalId: 'ANVIL-42',
        url: 'https://example.invalid/anvil/42',
        title: 'ANVIL work item'
      })
    });

    const references = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=message&ownerId=${created.message.id}`).then((response) => response.json());
    assert.equal(references.length, 1);
    assert.equal(references[0].system, 'anvil');
  });
});

test('external references can attach to channel, post, thread, and direct owners', async () => {
  await withService(async (service) => {
    const post = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Reference owner post',
        body: 'Open a post for reference ownership checks.'
      })
    }).then((response) => response.json());

    const thread = await fetch(`${service.url}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        postId: post.post.id,
        title: 'Reference owner thread'
      })
    }).then((response) => response.json());

    const directConversation = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'channel',
        ownerId: 'channel-requests',
        system: 'github',
        relationType: 'tracks',
        externalId: 'JKhyro/NEXUS#29',
        url: 'https://github.com/JKhyro/NEXUS/issues/29',
        title: 'Attachment follow-up issue'
      })
    });

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'post',
        ownerId: post.post.id,
        system: 'anvil',
        relationType: 'relatesTo',
        externalId: 'ANVIL-77',
        url: 'https://example.invalid/anvil/77',
        title: 'Post context'
      })
    });

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'thread',
        ownerId: thread.id,
        system: 'github',
        relationType: 'implements',
        externalId: 'JKhyro/NEXUS#30',
        url: 'https://github.com/JKhyro/NEXUS/issues/30',
        title: 'Thread implementation'
      })
    });

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-kira',
        ownerType: 'direct',
        ownerId: directConversation.id,
        system: 'discord',
        relationType: 'mirrors',
        externalId: 'discord-direct-123',
        url: 'https://discord.com/channels/example',
        title: 'Legacy direct mirror'
      })
    });

    const channelReferences = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=channel&ownerId=channel-requests`).then((response) => response.json());
    const postReferences = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=post&ownerId=${post.post.id}`).then((response) => response.json());
    const threadReferences = await fetch(`${service.url}/api/external-references?actorId=identity-jack&ownerType=thread&ownerId=${thread.id}`).then((response) => response.json());
    const directReferences = await fetch(`${service.url}/api/external-references?actorId=identity-kira&ownerType=direct&ownerId=${directConversation.id}`).then((response) => response.json());

    assert.equal(channelReferences.length, 1);
    assert.equal(channelReferences[0].system, 'github');
    assert.equal(postReferences.length, 1);
    assert.equal(postReferences[0].system, 'anvil');
    assert.equal(threadReferences.length, 1);
    assert.equal(threadReferences[0].relationType, 'implements');
    assert.equal(directReferences.length, 1);
    assert.equal(directReferences[0].system, 'discord');
  });
});

test('reverse external reference lookup returns readable linked contexts across owner types', async () => {
  await withService(async (service) => {
    const createdMessage = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Request linked to ANVIL-42'
      })
    }).then((response) => response.json());

    const post = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Report linked to ANVIL-42',
        body: 'Opening report post'
      })
    }).then((response) => response.json());

    const thread = await fetch(`${service.url}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        postId: post.post.id,
        title: 'Follow-up linked thread'
      })
    }).then((response) => response.json());

    const directConversation = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    const referenceInputs = [
      {
        ownerType: 'message',
        ownerId: createdMessage.message.id,
        system: 'anvil',
        relationType: 'tracks',
        externalId: 'ANVIL-42',
        url: 'https://example.invalid/anvil/42/message',
        title: 'Linked request message'
      },
      {
        ownerType: 'post',
        ownerId: post.post.id,
        system: 'anvil',
        relationType: 'reportedBy',
        externalId: 'ANVIL-42',
        url: 'https://example.invalid/anvil/42/post',
        title: 'Linked report post'
      },
      {
        ownerType: 'thread',
        ownerId: thread.id,
        system: 'anvil',
        relationType: 'implements',
        externalId: 'ANVIL-42',
        url: 'https://example.invalid/anvil/42/thread',
        title: 'Linked report thread'
      },
      {
        ownerType: 'direct',
        ownerId: directConversation.id,
        system: 'anvil',
        relationType: 'relatesTo',
        externalId: 'ANVIL-42',
        url: 'https://example.invalid/anvil/42/direct',
        title: 'Linked direct conversation'
      }
    ];

    for (const reference of referenceInputs) {
      await fetch(`${service.url}/api/external-references`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actorId: 'identity-jack',
          ...reference
        })
      });
    }

    const links = await fetch(
      `${service.url}/api/external-reference-links?actorId=identity-jack&system=anvil&externalId=ANVIL-42`
    ).then((response) => response.json());

    assert.equal(links.length, 4);
    const byOwnerType = new Map(links.map((link) => [link.owner.ownerType, link]));

    assert.equal(byOwnerType.get('message').route.channelId, 'channel-requests');
    assert.equal(byOwnerType.get('message').route.messageId, createdMessage.message.id);
    assert.equal(byOwnerType.get('message').route.scopeType, 'channel');
    assert.equal(byOwnerType.get('post').route.channelId, 'channel-report');
    assert.equal(byOwnerType.get('post').route.postId, post.post.id);
    assert.equal(byOwnerType.get('post').route.scopeType, 'post');
    assert.equal(byOwnerType.get('thread').route.channelId, 'channel-report');
    assert.equal(byOwnerType.get('thread').route.postId, post.post.id);
    assert.equal(byOwnerType.get('thread').route.threadId, thread.id);
    assert.equal(byOwnerType.get('thread').route.scopeType, 'thread');
    assert.equal(byOwnerType.get('direct').route.directConversationId, directConversation.id);
    assert.equal(byOwnerType.get('direct').route.scopeType, 'direct');
  });
});

test('reverse external reference lookup excludes unreadable linked contexts', async () => {
  await withService(async (service) => {
    const readable = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Readable linked message'
      })
    }).then((response) => response.json());

    const unreadable = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-hera',
        body: 'Unreadable linked message'
      })
    }).then((response) => response.json());

    for (const message of [readable.message, unreadable.message]) {
      await fetch(`${service.url}/api/external-references`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actorId: 'identity-jack',
          ownerType: 'message',
          ownerId: message.id,
          system: 'github',
          relationType: 'tracks',
          externalId: 'JKhyro/NEXUS#46',
          url: 'https://github.com/JKhyro/NEXUS/issues/46',
          title: 'Reverse linked-context lookup'
        })
      });
    }

    const links = await fetch(
      `${service.url}/api/external-reference-links?actorId=identity-yura&system=github&externalId=JKhyro%2FNEXUS%2346`
    ).then((response) => response.json());

    assert.equal(links.length, 1);
    assert.equal(links[0].owner.ownerType, 'message');
    assert.equal(links[0].owner.ownerId, readable.message.id);
    assert.equal(links[0].route.channelId, 'channel-requests');
    assert.equal(links.some((link) => link.owner.ownerId === unreadable.message.id), false);
  });
});

test('reverse external reference lookup includes scope and message coordination summaries', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Tracked request with coordination'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/external-references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        ownerType: 'message',
        ownerId: created.message.id,
        system: 'github',
        relationType: 'tracks',
        externalId: 'JKhyro/NEXUS#50',
        url: 'https://github.com/JKhyro/NEXUS/issues/50',
        title: 'Linked context coordination summary'
      })
    });

    await fetch(`${service.url}/api/relays`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        toScopeType: 'channel',
        toScopeId: 'channel-workflow',
        reason: 'Escalate tracked work for execution',
        messageId: created.message.id
      })
    });

    await fetch(`${service.url}/api/handoffs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        toIdentityId: 'identity-kira',
        rationale: 'Hand off tracked work for coordination',
        messageId: created.message.id
      })
    });

    const links = await fetch(
      `${service.url}/api/external-reference-links?actorId=identity-jack&system=github&externalId=JKhyro%2FNEXUS%2350`
    ).then((response) => response.json());

    assert.equal(links.length, 1);
    assert.deepEqual(links[0].coordination, {
      scope: {
        relayCount: 1,
        handoffCount: 1
      },
      message: {
        relayCount: 1,
        handoffCount: 1
      }
    });
  });
});

test('relays and handoffs can be listed for a readable scope', async () => {
  await withService(async (service) => {
    service.store.chatbase.relays.push(
      {
        id: 'relay-report-requests',
        fromScopeType: 'channel',
        fromScopeId: 'channel-report',
        toScopeType: 'channel',
        toScopeId: 'channel-requests',
        reason: 'Escalated for tracked action',
        occurredAt: '2026-03-18T00:00:00.000Z',
        source: { system: 'discord', externalChannelId: '1481840691066700038' }
      },
      {
        id: 'relay-general-workflow',
        fromScopeType: 'channel',
        fromScopeId: 'channel-general',
        toScopeType: 'channel',
        toScopeId: 'channel-workflow',
        reason: 'Unrelated relay',
        occurredAt: '2026-03-18T00:05:00.000Z'
      }
    );
    service.store.chatbase.handoffs.push(
      {
        id: 'handoff-requests-librarian',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        fromIdentityId: 'identity-kira',
        toIdentityId: 'identity-librarian',
        rationale: 'Needs curator review',
        createdAt: '2026-03-18T00:10:00.000Z'
      },
      {
        id: 'handoff-general-yura',
        scopeType: 'channel',
        scopeId: 'channel-general',
        fromIdentityId: 'identity-kira',
        toIdentityId: 'identity-yura',
        rationale: 'Unrelated handoff',
        createdAt: '2026-03-18T00:20:00.000Z'
      }
    );
    await service.store.saveChatbase();

    const relays = await fetch(`${service.url}/api/relays?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());
    const handoffs = await fetch(`${service.url}/api/handoffs?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());

    assert.equal(relays.length, 1);
    assert.equal(relays[0].id, 'relay-report-requests');
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].id, 'handoff-requests-librarian');
  });
});

test('relays and handoffs can be created through the shared service contract', async () => {
  await withService(async (service) => {
    const createdMessage = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Message-linked coordination source'
      })
    }).then((response) => response.json());

    const relay = await fetch(`${service.url}/api/relays`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        toScopeType: 'channel',
        toScopeId: 'channel-workflow',
        reason: 'Needs tracked execution follow-up',
        messageId: createdMessage.message.id
      })
    }).then((response) => response.json());

    const handoff = await fetch(`${service.url}/api/handoffs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        toIdentityId: 'identity-kira',
        rationale: 'Take the next turn on execution planning',
        messageId: createdMessage.message.id
      })
    }).then((response) => response.json());

    const relays = await fetch(`${service.url}/api/relays?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());
    const handoffs = await fetch(`${service.url}/api/handoffs?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());
    const fetchedMessage = await fetch(`${service.url}/api/message?actorId=identity-jack&messageId=${encodeURIComponent(createdMessage.message.id)}`).then((response) => response.json());

    assert.equal(fetchedMessage.id, createdMessage.message.id);
    assert(relays.some((entry) => entry.id === relay.id && entry.toScopeId === 'channel-workflow' && entry.messageId === createdMessage.message.id));
    assert(handoffs.some((entry) => entry.id === handoff.id && entry.toIdentityId === 'identity-kira' && entry.messageId === createdMessage.message.id));
  });
});

test('messages expose inline attachments through read and search flows', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-requests',
        body: 'Attachment-bearing message',
        attachments: [
          {
            name: 'trace.txt',
            mediaType: 'text/plain',
            url: 'https://example.invalid/trace.txt',
            bytes: 512
          }
        ]
      })
    }).then((response) => response.json());

    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=channel&scopeId=channel-requests`).then((response) => response.json());
    const searchResults = await fetch(`${service.url}/api/search?actorId=identity-jack&q=${encodeURIComponent('Attachment-bearing message')}`).then((response) => response.json());

    const message = messages.find((entry) => entry.id === created.message.id);
    const match = searchResults.find((entry) => entry.id === created.message.id);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].name, 'trace.txt');
    assert.equal(match.attachments.length, 1);
    assert.equal(match.attachments[0].url, 'https://example.invalid/trace.txt');
  });
});

test('forum posts can be created and read through the shared service contract', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Import fidelity check',
        body: 'This is the opening message for a report post.',
        attachments: [
          {
            name: 'report-screenshot.png',
            mediaType: 'image/png',
            url: 'https://example.invalid/report-screenshot.png',
            bytes: 2048
          }
        ]
      })
    }).then((response) => response.json());

    const posts = await fetch(`${service.url}/api/posts?actorId=identity-jack&channelId=channel-report`).then((response) => response.json());
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=post&scopeId=${created.post.id}`).then((response) => response.json());

    assert(posts.some((post) => post.id === created.post.id && post.title === 'Import fidelity check'));
    const openingMessage = messages.find((message) => message.body === 'This is the opening message for a report post.');
    assert(openingMessage);
    assert.equal(openingMessage.attachments.length, 1);
    assert.equal(openingMessage.attachments[0].name, 'report-screenshot.png');
  });
});

test('direct conversations can be created, listed, and messaged through the shared service contract', async () => {
  await withService(async (service) => {
    const created = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-kira',
        scopeType: 'direct',
        scopeId: created.id,
        body: 'Direct conversation test message'
      })
    });

    const conversations = await fetch(`${service.url}/api/direct-conversations?actorId=identity-kira`).then((response) => response.json());
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=direct&scopeId=${created.id}`).then((response) => response.json());

    assert(conversations.some((conversation) => conversation.id === created.id));
    assert(messages.some((message) => message.body === 'Direct conversation test message'));
  });
});

test('activity endpoint summarizes recent readable channel and direct activity', async () => {
  await withService(async (service) => {
    const directConversation = await fetch(`${service.url}/api/direct-conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        memberIdentityIds: ['identity-jack', 'identity-kira']
      })
    }).then((response) => response.json());

    const post = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Recent report post',
        body: 'Opening report message'
      })
    }).then((response) => response.json());

    const thread = await fetch(`${service.url}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        postId: post.post.id,
        title: 'Recent report thread'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-kira',
        scopeType: 'direct',
        scopeId: directConversation.id,
        body: 'Direct recent activity'
      })
    });

    const threadMessage = await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'thread',
        scopeId: thread.id,
        body: 'Thread recent activity'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'channel',
        scopeId: 'channel-workflow',
        body: 'Workflow recent activity'
      })
    });

    const activity = await fetch(`${service.url}/api/activity?actorId=identity-jack&workspaceId=workspace-internal-core`).then((response) => response.json());
    const reportActivity = activity.find((entry) => entry.scopeType === 'channel' && entry.scopeId === 'channel-report');
    const directActivity = activity.find((entry) => entry.scopeType === 'direct' && entry.scopeId === directConversation.id);
    const heraPrivate = activity.find((entry) => entry.scopeType === 'channel' && entry.scopeId === 'channel-hera');

    assert(reportActivity);
    assert.equal(reportActivity.threadId, thread.id);
    assert.equal(reportActivity.messageId, threadMessage.message.id);
    assert.equal(reportActivity.preview, 'Thread recent activity');
    assert(directActivity);
    assert.equal(directActivity.directConversationId, directConversation.id);
    assert.equal(directActivity.preview, 'Direct recent activity');
    assert.equal(heraPrivate, undefined);
  });
});

test('threads can be created and read through the shared service contract', async () => {
  await withService(async (service) => {
    const post = await fetch(`${service.url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        channelId: 'channel-report',
        title: 'Thread parent post',
        body: 'Opening post body'
      })
    }).then((response) => response.json());

    const thread = await fetch(`${service.url}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        postId: post.post.id,
        title: 'Follow-up thread'
      })
    }).then((response) => response.json());

    await fetch(`${service.url}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: 'identity-jack',
        scopeType: 'thread',
        scopeId: thread.id,
        body: 'Threaded follow-up message'
      })
    });

    const threads = await fetch(`${service.url}/api/threads?actorId=identity-jack&postId=${post.post.id}`).then((response) => response.json());
    const messages = await fetch(`${service.url}/api/messages?actorId=identity-jack&scopeType=thread&scopeId=${thread.id}`).then((response) => response.json());

    assert(threads.some((entry) => entry.id === thread.id && entry.title === 'Follow-up thread'));
    assert(messages.some((message) => message.body === 'Threaded follow-up message'));
  });
});

test('store factory defaults to JSON mode and validates library-postgres configuration', async () => {
  const jsonStore = createStore({
    storageMode: 'json',
    dataDir: 'runtime',
    bootstrapPath: 'config/internal-bootstrap.json'
  });
  assert.equal(jsonStore.constructor.name, 'NexusJsonStore');

  assert.throws(() => {
    createStore({
      storageMode: 'library-postgres',
      bootstrapPath: 'config/internal-bootstrap.json',
      libraryConnectionString: ''
    });
  }, /NEXUS_LIBRARY_CONNECTION_STRING/);
});

test('service config can load library-postgres settings from a local config file', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'nexus-config-'));
  const configPath = join(configDir, 'nexus.local.json');
  await writeFile(configPath, JSON.stringify({
    deploymentMode: 'hosted',
    host: '0.0.0.0',
    port: 45210,
    staticMode: 'disabled',
    publicOrigin: 'https://nexus.example.invalid',
    allowedOrigins: ['https://nexus.example.invalid', 'https://desktop.example.invalid'],
    storageMode: 'library-postgres',
    libraryConnectionString: 'postgresql://example:secret@127.0.0.1:5432/library',
    libraryChatbaseSchema: 'nexus_chatbase_cfg',
    libraryMetabaseSchema: 'nexus_metabase_cfg'
  }, null, 2));

  const resolved = resolveServiceConfig({ configPath, port: 0 });
  assert.equal(resolved.deploymentMode, 'hosted');
  assert.equal(resolved.host, '0.0.0.0');
  assert.equal(resolved.storageMode, 'library-postgres');
  assert.equal(resolved.staticMode, 'disabled');
  assert.equal(resolved.publicOrigin, 'https://nexus.example.invalid');
  assert.deepEqual(resolved.allowedOrigins, ['https://nexus.example.invalid', 'https://desktop.example.invalid']);
  assert.equal(resolved.libraryConnectionString, 'postgresql://example:secret@127.0.0.1:5432/library');
  assert.equal(resolved.libraryChatbaseSchema, 'nexus_chatbase_cfg');
  assert.equal(resolved.libraryMetabaseSchema, 'nexus_metabase_cfg');
});

test('service can boot in hosted mode with API-only serving and CORS', async () => {
  const hosted = await createNexusService({
    dataDir: await mkdtemp(join(tmpdir(), 'nexus-hosted-')),
    port: 0,
    storageMode: 'json',
    deploymentMode: 'hosted',
    host: '127.0.0.1',
    staticMode: 'disabled',
    publicOrigin: 'https://nexus.example.invalid',
    allowedOrigins: ['https://nexus.example.invalid']
  });

  await hosted.start();
  try {
    const healthResponse = await fetch(`${hosted.url}/api/health`, {
      headers: {
        origin: 'https://nexus.example.invalid'
      }
    });
    const health = await healthResponse.json();
    assert.equal(health.deploymentMode, 'hosted');
    assert.equal(health.staticMode, 'disabled');
    assert.equal(healthResponse.headers.get('access-control-allow-origin'), 'https://nexus.example.invalid');

    const options = await fetch(`${hosted.url}/api/health`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://nexus.example.invalid'
      }
    });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), 'https://nexus.example.invalid');

    const root = await fetch(`${hosted.url}/`);
    assert.equal(root.status, 404);
  }
  finally {
    await hosted.stop();
  }
});
