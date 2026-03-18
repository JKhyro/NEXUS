import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTRACT_VERSION } from '../../../packages/contracts/src/index.mjs';
import { resolveServiceConfig } from './lib/config.mjs';
import { createStore } from './lib/store-factory.mjs';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function resolveCorsOrigin(request, config) {
  const requestOrigin = request.headers.origin;
  if (!requestOrigin) {
    return null;
  }

  const allowedOrigins = new Set(config.allowedOrigins ?? []);
  if (config.publicOrigin) {
    allowedOrigins.add(config.publicOrigin);
  }

  if (allowedOrigins.has('*')) {
    return '*';
  }

  if (allowedOrigins.has(requestOrigin)) {
    return requestOrigin;
  }

  return null;
}

function buildResponseHeaders(request, config, headers = {}) {
  const finalHeaders = { ...headers };
  const corsOrigin = resolveCorsOrigin(request, config);
  if (corsOrigin) {
    finalHeaders['access-control-allow-origin'] = corsOrigin;
    finalHeaders['access-control-allow-methods'] = 'GET,POST,OPTIONS';
    finalHeaders['access-control-allow-headers'] = 'content-type';
  }

  return finalHeaders;
}

function sendJson(request, response, config, statusCode, payload) {
  response.writeHead(statusCode, buildResponseHeaders(request, config, {
    'content-type': 'application/json; charset=utf-8'
  }));
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(request, staticDir, pathname, response, config) {
  const resolved = pathname === '/' ? '/index.html' : pathname;
  const filePath = join(staticDir, resolved);
  const body = await readFile(filePath);
  response.writeHead(200, buildResponseHeaders(request, config, {
    'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream'
  }));
  response.end(body);
}

async function routeApi(request, response, store, config) {
  const url = new URL(request.url, `http://${request.headers.host ?? `${config.host}:${config.port}`}`);
  const actorId = url.searchParams.get('actorId');

  if (request.method === 'OPTIONS') {
    response.writeHead(204, buildResponseHeaders(request, config));
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(request, response, config, 200, {
      status: 'ok',
      contractVersion: CONTRACT_VERSION,
      mode: config.deploymentMode === 'hosted' ? 'hosted-capable' : 'desktop-local-first',
      deploymentMode: config.deploymentMode,
      staticMode: config.staticMode,
      publicOrigin: config.publicOrigin,
      allowedOrigins: config.allowedOrigins,
      storageMode: config.storageMode,
      storage: {
        metabasePath: store.metabasePath,
        chatbasePath: store.chatbasePath
      }
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    return sendJson(request, response, config, 200, store.getBootstrapSummary());
  }

  if (request.method === 'GET' && url.pathname === '/api/identities') {
    return sendJson(request, response, config, 200, store.listIdentities());
  }

  if (request.method === 'GET' && url.pathname === '/api/workspaces') {
    return sendJson(request, response, config, 200, store.listWorkspaces(actorId));
  }

  if (request.method === 'GET' && url.pathname === '/api/channels') {
    return sendJson(request, response, config, 200, store.listChannels(actorId, url.searchParams.get('workspaceId')));
  }

  if (request.method === 'GET' && url.pathname === '/api/direct-conversations') {
    return sendJson(request, response, config, 200, store.listDirectConversations(actorId));
  }

  if (request.method === 'GET' && url.pathname === '/api/activity') {
    return sendJson(request, response, config, 200, store.listActivity(
      actorId,
      url.searchParams.get('workspaceId')
    ));
  }

  if (request.method === 'GET' && url.pathname === '/api/posts') {
    return sendJson(request, response, config, 200, store.listPosts(actorId, url.searchParams.get('channelId')));
  }

  if (request.method === 'GET' && url.pathname === '/api/threads') {
    return sendJson(request, response, config, 200, store.listThreads(actorId, {
      channelId: url.searchParams.get('channelId'),
      postId: url.searchParams.get('postId')
    }));
  }

  if (request.method === 'GET' && url.pathname === '/api/messages') {
    return sendJson(request, response, config, 200, store.listMessages(
      actorId,
      url.searchParams.get('scopeType'),
      url.searchParams.get('scopeId')
    ));
  }

  if (request.method === 'GET' && url.pathname === '/api/message') {
    return sendJson(request, response, config, 200, store.getMessage(
      actorId,
      url.searchParams.get('messageId')
    ));
  }

  if (request.method === 'GET' && url.pathname === '/api/relays') {
    return sendJson(request, response, config, 200, store.listRelays(
      actorId,
      url.searchParams.get('scopeType'),
      url.searchParams.get('scopeId')
    ));
  }

  if (request.method === 'GET' && url.pathname === '/api/handoffs') {
    return sendJson(request, response, config, 200, store.listHandoffs(
      actorId,
      url.searchParams.get('scopeType'),
      url.searchParams.get('scopeId')
    ));
  }

  if (request.method === 'GET' && url.pathname === '/api/search') {
    return sendJson(request, response, config, 200, store.searchMessages(actorId, url.searchParams.get('q') ?? ''));
  }

  if (request.method === 'GET' && url.pathname === '/api/external-references') {
    return sendJson(request, response, config, 200, store.listExternalReferences(
      actorId,
      url.searchParams.get('ownerType'),
      url.searchParams.get('ownerId')
    ));
  }

  if (request.method === 'POST' && url.pathname === '/api/messages') {
    return sendJson(request, response, config, 201, await store.createMessage(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/posts') {
    return sendJson(request, response, config, 201, await store.createPost(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/threads') {
    return sendJson(request, response, config, 201, await store.createThread(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/direct-conversations') {
    return sendJson(request, response, config, 201, await store.createDirectConversation(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/external-references') {
    return sendJson(request, response, config, 201, await store.createExternalReference(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/relays') {
    return sendJson(request, response, config, 201, await store.createRelay(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/handoffs') {
    return sendJson(request, response, config, 201, await store.createHandoff(await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/adapters/discord/events') {
    return sendJson(request, response, config, 201, await store.ingestDiscordEvent(await readBody(request)));
  }

  return sendJson(request, response, config, 404, { error: 'Not found.' });
}

export async function createNexusService(overrides = {}) {
  const config = resolveServiceConfig(overrides);
  const store = createStore(config);
  await store.init();

  const server = http.createServer(async (request, response) => {
    try {
      if (request.url?.startsWith('/api/')) {
        await routeApi(request, response, store, config);
        return;
      }

      if (config.staticMode === 'disabled') {
        sendJson(request, response, config, 404, { error: 'Static client surface is disabled for this service mode.' });
        return;
      }

      await serveStatic(request, config.staticDir, new URL(request.url, `http://${config.host}:${config.port}`).pathname, response, config);
    }
    catch (error) {
      sendJson(request, response, config, 500, { error: error.message });
    }
  });

  return {
    config,
    store,
    server,
    url: null,
    async start() {
      await new Promise((resolve) => server.listen(config.port, config.host, resolve));
      const address = server.address();
      this.url = `http://${config.host}:${address.port}`;
      return this.url;
    },
    async stop() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await store.close();
    }
  };
}

async function startFromCli() {
  const service = await createNexusService();
  const url = await service.start();
  console.log(`NEXUS service listening on ${url}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startFromCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
