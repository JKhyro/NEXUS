import { createRuntimeManifestRegistry } from './runtime-manifest-registry.mjs';

function createRuntimeHealthSnapshot(config, runtimeState, store) {
  return {
    status: 'ok',
    contractVersion: runtimeState.contractVersion,
    mode: config.deploymentMode === 'hosted' ? 'hosted-capable' : 'desktop-local-first',
    deploymentMode: config.deploymentMode,
    staticMode: config.staticMode,
    publicOrigin: config.publicOrigin,
    allowedOrigins: config.allowedOrigins,
    storageMode: config.storageMode,
    storage: {
      metabasePath: store.metabasePath,
      chatbasePath: store.chatbasePath
    },
    runtime: {
      owner: runtimeState.owner,
      targetOwner: runtimeState.targetOwner,
      transitionSeam: runtimeState.transitionSeam,
      backingImplementation: runtimeState.backingImplementation,
      lifecycleState: runtimeState.lifecycleState,
      startedAt: runtimeState.startedAt,
      manifestRegistry: runtimeState.manifestRegistry
    }
  };
}

export function createInProcessRuntimeAdapter({ config, store, contractVersion }) {
  const manifestRegistry = createRuntimeManifestRegistry({ repoRoot: config.repoRoot });
  const runtimeState = {
    owner: 'node-transition-adapter',
    targetOwner: 'native-runtime-core',
    transitionSeam: 'service-runtime-boundary',
    backingImplementation: 'in-process-store',
    lifecycleState: 'created',
    startedAt: null,
    manifestRegistry: null,
    contractVersion
  };

  return {
    store,
    async start() {
      runtimeState.manifestRegistry = await manifestRegistry.getSummary();
      runtimeState.lifecycleState = 'running';
      runtimeState.startedAt = new Date().toISOString();
    },
    async stop() {
      runtimeState.lifecycleState = 'stopped';
      await store.close();
    },
    getHealthSnapshot() {
      return createRuntimeHealthSnapshot(config, runtimeState, store);
    },
    async activateRoute(routeEnvelope) {
      return manifestRegistry.activateRoute(routeEnvelope);
    },
    getBootstrapSummary() {
      return store.getBootstrapSummary();
    },
    listIdentities() {
      return store.listIdentities();
    },
    listWorkspaces(actorId) {
      return store.listWorkspaces(actorId);
    },
    listChannels(actorId, workspaceId) {
      return store.listChannels(actorId, workspaceId);
    },
    listDirectConversations(actorId) {
      return store.listDirectConversations(actorId);
    },
    listActivity(actorId, workspaceId) {
      return store.listActivity(actorId, workspaceId);
    },
    listPosts(actorId, channelId) {
      return store.listPosts(actorId, channelId);
    },
    listThreads(actorId, selection) {
      return store.listThreads(actorId, selection);
    },
    listMessages(actorId, scopeType, scopeId) {
      return store.listMessages(actorId, scopeType, scopeId);
    },
    getMessage(actorId, messageId) {
      return store.getMessage(actorId, messageId);
    },
    listRelays(actorId, scopeType, scopeId) {
      return store.listRelays(actorId, scopeType, scopeId);
    },
    listHandoffs(actorId, scopeType, scopeId) {
      return store.listHandoffs(actorId, scopeType, scopeId);
    },
    searchMessages(actorId, query) {
      return store.searchMessages(actorId, query);
    },
    listExternalReferences(actorId, ownerType, ownerId) {
      return store.listExternalReferences(actorId, ownerType, ownerId);
    },
    listExternalReferenceLinks(actorId, system, externalId) {
      return store.listExternalReferenceLinks(actorId, system, externalId);
    },
    createMessage(payload) {
      return store.createMessage(payload);
    },
    createPost(payload) {
      return store.createPost(payload);
    },
    createThread(payload) {
      return store.createThread(payload);
    },
    createDirectConversation(payload) {
      return store.createDirectConversation(payload);
    },
    createExternalReference(payload) {
      return store.createExternalReference(payload);
    },
    createRelay(payload) {
      return store.createRelay(payload);
    },
    createHandoff(payload) {
      return store.createHandoff(payload);
    },
    ingestDiscordEvent(payload) {
      return store.ingestDiscordEvent(payload);
    }
  };
}
