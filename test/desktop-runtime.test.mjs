import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  createManagedServiceController,
  formatManagedServiceFailure,
  resolveNodeBinary
} from '../apps/desktop/src/service-runtime.mjs';

function createFakeChild(pid = 43210) {
  const child = new EventEmitter();
  child.pid = pid;
  child.killed = false;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.unrefCalled = false;
  child.unref = () => {
    child.unrefCalled = true;
  };
  child.kill = () => {
    child.killed = true;
    child.emit('exit', 0, null);
    return true;
  };
  return child;
}

function createFakeLogStream() {
  return {
    writable: true,
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk));
      return true;
    },
    end(callback) {
      this.writable = false;
      callback?.();
    }
  };
}

test('resolveNodeBinary accepts an explicit usable binary', () => {
  const result = resolveNodeBinary({
    env: {
      NEXUS_NODE_BINARY: 'custom-node'
    },
    spawnSyncImpl: () => ({
      status: 0,
      stdout: 'v22.0.0'
    })
  });

  assert.equal(result.command, 'custom-node');
  assert.equal(result.version, 'v22.0.0');
});

test('managed service startup succeeds once and does not double-spawn', async () => {
  const child = createFakeChild();
  let spawnCalls = 0;
  const controller = createManagedServiceController({
    getUserDataPath: () => 'C:\\temp\\nexus-user',
    repoRoot: 'C:\\repo',
    serviceEntrypoint: 'C:\\repo\\apps\\service\\src\\server.mjs',
    mkdirImpl: async () => {},
    resolveNodeBinaryImpl: () => ({ command: 'node', version: 'v22.0.0' }),
    probeManagedServiceImpl: async () => false,
    waitForManagedServiceImpl: async () => {},
    createLogStreamImpl: () => createFakeLogStream(),
    spawnImpl: () => {
      spawnCalls += 1;
      return child;
    }
  });

  const first = await controller.ensureStarted();
  const second = await controller.ensureStarted();

  assert.equal(spawnCalls, 1);
  assert.equal(first.reusedExistingService, false);
  assert.equal(second.pid, child.pid);
  assert.equal(child.unrefCalled, true);
});

test('managed service can reuse an already-running local service without spawning', async () => {
  let spawnCalls = 0;
  let stopCalls = 0;
  const controller = createManagedServiceController({
    getUserDataPath: () => 'C:\\temp\\nexus-user',
    repoRoot: 'C:\\repo',
    serviceEntrypoint: 'C:\\repo\\apps\\service\\src\\server.mjs',
    mkdirImpl: async () => {},
    resolveNodeBinaryImpl: () => ({ command: 'node', version: 'v22.0.0' }),
    probeManagedServiceImpl: async () => true,
    waitForManagedServiceImpl: async () => {},
    createLogStreamImpl: () => createFakeLogStream(),
    spawnImpl: () => {
      spawnCalls += 1;
      return createFakeChild();
    },
    delayImpl: async () => {
      stopCalls += 1;
    }
  });

  const service = await controller.ensureStarted();
  await controller.stop();

  assert.equal(service.reusedExistingService, true);
  assert.equal(spawnCalls, 0);
  assert.equal(stopCalls, 0);
});

test('startup timeout kills the owned child and records the last failure', async () => {
  const child = createFakeChild();
  const controller = createManagedServiceController({
    getUserDataPath: () => 'C:\\temp\\nexus-user',
    repoRoot: 'C:\\repo',
    serviceEntrypoint: 'C:\\repo\\apps\\service\\src\\server.mjs',
    mkdirImpl: async () => {},
    resolveNodeBinaryImpl: () => ({ command: 'node', version: 'v22.0.0' }),
    probeManagedServiceImpl: async () => false,
    waitForManagedServiceImpl: async () => {
      throw Object.assign(new Error('Timed out waiting for the local NEXUS service.'), {
        code: 'NEXUS_SERVICE_START_TIMEOUT'
      });
    },
    createLogStreamImpl: () => createFakeLogStream(),
    spawnImpl: () => child,
    delayImpl: async () => {}
  });

  await assert.rejects(
    controller.ensureStarted(),
    /Timed out waiting for the local NEXUS service/
  );

  assert.equal(child.killed, true);
  assert.equal(controller.getLastLaunchFailure()?.code, 'NEXUS_SERVICE_START_TIMEOUT');
});

test('missing node binary is surfaced before spawn', async () => {
  let spawnCalls = 0;
  const controller = createManagedServiceController({
    getUserDataPath: () => 'C:\\temp\\nexus-user',
    repoRoot: 'C:\\repo',
    serviceEntrypoint: 'C:\\repo\\apps\\service\\src\\server.mjs',
    mkdirImpl: async () => {},
    resolveNodeBinaryImpl: () => {
      throw Object.assign(
        new Error('Unable to find a usable Node.js binary for the managed NEXUS service.'),
        { code: 'NEXUS_NODE_BINARY_NOT_FOUND' }
      );
    },
    probeManagedServiceImpl: async () => false,
    waitForManagedServiceImpl: async () => {},
    createLogStreamImpl: () => createFakeLogStream(),
    spawnImpl: () => {
      spawnCalls += 1;
      return createFakeChild();
    }
  });

  await assert.rejects(
    controller.ensureStarted(),
    /Unable to find a usable Node.js binary/
  );

  assert.equal(spawnCalls, 0);
  assert.equal(controller.getLastLaunchFailure()?.code, 'NEXUS_NODE_BINARY_NOT_FOUND');
});

test('stop shuts down the owned child and closes the runtime log', async () => {
  const child = createFakeChild();
  const logStream = createFakeLogStream();
  const controller = createManagedServiceController({
    getUserDataPath: () => 'C:\\temp\\nexus-user',
    repoRoot: 'C:\\repo',
    serviceEntrypoint: 'C:\\repo\\apps\\service\\src\\server.mjs',
    mkdirImpl: async () => {},
    resolveNodeBinaryImpl: () => ({ command: 'node', version: 'v22.0.0' }),
    probeManagedServiceImpl: async () => false,
    waitForManagedServiceImpl: async () => {},
    createLogStreamImpl: () => logStream,
    spawnImpl: () => child,
    delayImpl: async () => {}
  });

  await controller.ensureStarted();
  await controller.stop();

  assert.equal(child.killed, true);
  assert.equal(logStream.writable, false);
});

test('formatManagedServiceFailure includes log-path context when available', () => {
  const output = formatManagedServiceFailure(
    new Error('Managed NEXUS service failed before readiness.'),
    {
      code: 'NEXUS_SERVICE_EARLY_EXIT',
      logPath: 'C:\\temp\\nexus-service.log'
    }
  );

  assert.match(output, /NEXUS_SERVICE_EARLY_EXIT/);
  assert.match(output, /nexus-service\.log/);
});
