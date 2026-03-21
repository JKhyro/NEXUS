import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_STARTUP_TIMEOUT_MS = 15000;
const DEFAULT_STARTUP_POLL_MS = 300;
const DEFAULT_STOP_TIMEOUT_MS = 5000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceUrl(host, port) {
  return `http://${host}:${port}`;
}

function describeExit(code, signal) {
  if (signal) {
    return `signal ${signal}`;
  }
  if (typeof code === 'number') {
    return `exit code ${code}`;
  }
  return 'unknown exit';
}

function createLifecycleError(message, metadata = {}) {
  const error = new Error(message);
  Object.assign(error, metadata);
  return error;
}

export function resolveNodeBinary({
  env = process.env,
  spawnSyncImpl = spawnSync
} = {}) {
  const candidates = [...new Set([
    env.NEXUS_NODE_BINARY,
    env.npm_node_execpath,
    'node'
  ].filter(Boolean))];
  const failures = [];

  for (const candidate of candidates) {
    const result = spawnSyncImpl(candidate, ['--version'], {
      stdio: 'pipe',
      encoding: 'utf8'
    });
    if (!result.error && result.status === 0) {
      return {
        command: candidate,
        version: (result.stdout || result.stderr || '').trim() || null
      };
    }

    failures.push(
      result.error?.message
        ? `${candidate} (${result.error.message})`
        : `${candidate} (${describeExit(result.status, null)})`
    );
  }

  throw createLifecycleError(
    `Unable to find a usable Node.js binary for the managed NEXUS service. Tried: ${failures.join(', ')}`,
    { code: 'NEXUS_NODE_BINARY_NOT_FOUND' }
  );
}

export async function probeManagedService(url, {
  fetchImpl = fetch
} = {}) {
  try {
    const response = await fetchImpl(`${url}/api/health`);
    return Boolean(response?.ok);
  }
  catch {
    return false;
  }
}

export async function waitForManagedService(url, {
  fetchImpl = fetch,
  timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
  intervalMs = DEFAULT_STARTUP_POLL_MS,
  delayImpl = delay,
  childProcess = null
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  let childFailure = null;
  const onExit = (code, signal) => {
    childFailure = createLifecycleError(
      `Managed NEXUS service exited before readiness (${describeExit(code, signal)}).`,
      { code: 'NEXUS_SERVICE_EARLY_EXIT' }
    );
  };
  const onError = (error) => {
    childFailure = createLifecycleError(
      `Managed NEXUS service failed before readiness: ${error.message}`,
      { code: 'NEXUS_SERVICE_SPAWN_ERROR', cause: error }
    );
  };

  if (childProcess?.once) {
    childProcess.once('exit', onExit);
    childProcess.once('error', onError);
  }

  try {
    while (Date.now() < deadline) {
      if (childFailure) {
        throw childFailure;
      }

      try {
        const response = await fetchImpl(`${url}/api/health`);
        if (response?.ok) {
          return;
        }
        lastError = createLifecycleError(
          `Health probe returned ${response?.status ?? 'unknown status'}.`,
          { code: 'NEXUS_SERVICE_HEALTH_NOT_READY' }
        );
      }
      catch (error) {
        lastError = error;
      }

      await delayImpl(intervalMs);
    }

    if (childFailure) {
      throw childFailure;
    }

    const timeoutMessage = lastError?.message
      ? `Timed out waiting for the local NEXUS service. Last error: ${lastError.message}`
      : 'Timed out waiting for the local NEXUS service.';
    throw createLifecycleError(timeoutMessage, {
      code: 'NEXUS_SERVICE_START_TIMEOUT',
      cause: lastError ?? undefined
    });
  }
  finally {
    if (childProcess?.off) {
      childProcess.off('exit', onExit);
      childProcess.off('error', onError);
    }
  }
}

async function closeLogStream(stream) {
  if (!stream) {
    return;
  }

  await new Promise((resolve) => {
    stream.end(resolve);
  });
}

async function stopOwnedChild(childProcess, {
  timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
  delayImpl = delay
} = {}) {
  if (!childProcess || childProcess.killed) {
    return;
  }

  let exited = false;
  const onExit = () => {
    exited = true;
  };
  childProcess.once?.('exit', onExit);

  try {
    childProcess.kill();

    const deadline = Date.now() + timeoutMs;
    while (!exited && Date.now() < deadline) {
      await delayImpl(50);
    }

    if (!exited && !childProcess.killed) {
      childProcess.kill('SIGKILL');
    }
  }
  finally {
    childProcess.off?.('exit', onExit);
  }
}

function normalizeFailure(error, logPath) {
  if (!error) {
    return null;
  }

  const inferredCode = error.code
    ?? (error.message?.includes('Node.js binary')
      ? 'NEXUS_NODE_BINARY_NOT_FOUND'
      : 'NEXUS_SERVICE_START_FAILED');

  return {
    message: error.message,
    code: inferredCode,
    at: new Date().toISOString(),
    logPath: logPath ?? null
  };
}

export function formatManagedServiceFailure(error, failure = null) {
  const details = [error?.message ?? 'NEXUS startup failed.'];
  const effectiveFailure = failure ?? null;

  if (effectiveFailure?.code) {
    details.push(`Code: ${effectiveFailure.code}`);
  }

  if (effectiveFailure?.logPath) {
    details.push(`Log: ${effectiveFailure.logPath}`);
  }

  return details.join('\n');
}

export function createManagedServiceController({
  getUserDataPath,
  repoRoot,
  serviceEntrypoint,
  serviceHost = '127.0.0.1',
  servicePort = '43100',
  env = process.env,
  mkdirImpl = mkdir,
  spawnImpl = spawn,
  resolveNodeBinaryImpl = resolveNodeBinary,
  probeManagedServiceImpl = probeManagedService,
  waitForManagedServiceImpl = waitForManagedService,
  createLogStreamImpl = (logPath) => createWriteStream(logPath, { flags: 'a' }),
  delayImpl = delay
}) {
  const url = serviceUrl(serviceHost, servicePort);
  let ownedChild = null;
  let ownedLogStream = null;
  let startPromise = null;
  let reusingExistingService = false;
  let lastLaunchFailure = null;

  function runtimeDir() {
    return join(getUserDataPath(), 'runtime');
  }

  function logPath() {
    return join(runtimeDir(), 'nexus-service.log');
  }

  function writeRuntimeLog(message) {
    if (!ownedLogStream?.writable) {
      return;
    }

    ownedLogStream.write(`[${new Date().toISOString()}] ${message}\n`);
  }

  function attachProcessLogging(childProcess) {
    childProcess.stdout?.on('data', (chunk) => {
      writeRuntimeLog(`[stdout] ${String(chunk).trimEnd()}`);
    });
    childProcess.stderr?.on('data', (chunk) => {
      writeRuntimeLog(`[stderr] ${String(chunk).trimEnd()}`);
    });
    childProcess.on?.('error', (error) => {
      writeRuntimeLog(`[error] ${error.message}`);
    });
    childProcess.on?.('exit', (code, signal) => {
      writeRuntimeLog(`[exit] ${describeExit(code, signal)}`);
      if (ownedChild === childProcess) {
        ownedChild = null;
      }
    });
  }

  async function ensureStarted() {
    if (ownedChild && !ownedChild.killed) {
      return {
        url,
        logPath: logPath(),
        reusedExistingService: false,
        pid: ownedChild.pid ?? null
      };
    }

    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      const userRuntimeDir = runtimeDir();
      const runtimeLogPath = logPath();
      await mkdirImpl(userRuntimeDir, { recursive: true });

      if (await probeManagedServiceImpl(url)) {
        reusingExistingService = true;
        lastLaunchFailure = null;
        return {
          url,
          logPath: runtimeLogPath,
          reusedExistingService: true,
          pid: null
        };
      }

      let childProcess = null;
      let logStream = null;

      try {
        const nodeBinary = resolveNodeBinaryImpl({ env });
        logStream = createLogStreamImpl(runtimeLogPath);
        ownedLogStream = logStream;
        writeRuntimeLog(`Launching managed NEXUS service with ${nodeBinary.command}${nodeBinary.version ? ` (${nodeBinary.version})` : ''}.`);
        childProcess = spawnImpl(nodeBinary.command, [serviceEntrypoint], {
          cwd: repoRoot,
          env: {
            ...env,
            NEXUS_DEPLOYMENT_MODE: 'local-managed',
            NEXUS_HOST: serviceHost,
            NEXUS_PORT: servicePort,
            NEXUS_STATIC_MODE: 'embedded',
            NEXUS_DATA_DIR: userRuntimeDir
          },
          stdio: ['ignore', 'pipe', 'pipe']
        });

        childProcess.unref?.();
        attachProcessLogging(childProcess);
        await waitForManagedServiceImpl(url, {
          childProcess,
          delayImpl
        });

        reusingExistingService = false;
        ownedChild = childProcess;
        lastLaunchFailure = null;
        writeRuntimeLog(`Managed NEXUS service is ready on ${url}.`);
        return {
          url,
          logPath: runtimeLogPath,
          reusedExistingService: false,
          pid: childProcess.pid ?? null
        };
      }
      catch (error) {
        lastLaunchFailure = normalizeFailure(error, runtimeLogPath);
        writeRuntimeLog(`Launch failed: ${error.message}`);
        await stopOwnedChild(childProcess, { delayImpl });
        ownedChild = null;
        await closeLogStream(logStream);
        ownedLogStream = null;
        throw error;
      }
    })();

    try {
      return await startPromise;
    }
    finally {
      startPromise = null;
    }
  }

  async function stop() {
    const childToStop = ownedChild;
    const logToClose = ownedLogStream;
    ownedChild = null;
    ownedLogStream = null;
    reusingExistingService = false;

    await stopOwnedChild(childToStop, { delayImpl });
    await closeLogStream(logToClose);
  }

  function getLastLaunchFailure() {
    return lastLaunchFailure;
  }

  function getStatus() {
    return {
      url,
      logPath: logPath(),
      hasOwnedChild: Boolean(ownedChild),
      reusedExistingService: reusingExistingService,
      lastLaunchFailure
    };
  }

  return {
    ensureStarted,
    stop,
    getLastLaunchFailure,
    getStatus
  };
}
