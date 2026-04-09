import {
  coordinationCountsForMessage as deriveCoordinationCountsForMessage,
  filterCoordinationRecords,
  normalizeCoordinationFocusMode
} from './coordination-focus.mjs';
import {
  buildSelectionRouteUrl,
  buildSelectionRouteHash,
  deriveBreadcrumbRoute,
  parseSelectionRouteHash
} from './selection-route.mjs';
import {
  buildLinkedContextSelection,
  groupLinkedContextResults,
  linkedContextOwnerTypeFilters,
  linkedContextOwnerTypeLabel,
  linkedContextSearchResults,
  normalizeLinkedContextOwnerTypeFilter,
  summarizeLinkedContextFilter,
  summarizeLinkedContextCoordination,
  summarizeLinkedContextPath
} from './linked-context.mjs';
import {
  canStepRouteHistory,
  createRouteHistoryState,
  pushRouteHistory,
  recentRouteHistory,
  selectRouteHistoryIndex,
  stepRouteHistory
} from './route-history.mjs';
import {
  projectPulseStatusMeta,
  summarizeProjectPulse
} from './project-progress.mjs';

const actorSelect = document.querySelector('#actor');
const workspaceSelect = document.querySelector('#workspace');
const channelsEl = document.querySelector('#channels');
const recentActivityEl = document.querySelector('#recent-activity');
const directConversationsEl = document.querySelector('#direct-conversations');
const directComposerEl = document.querySelector('#direct-composer');
const directMembersEl = document.querySelector('#direct-members');
const projectPulseSummaryEl = document.querySelector('#project-pulse-summary');
const projectPulseStatsEl = document.querySelector('#project-pulse-stats');
const projectPulseLanesEl = document.querySelector('#project-pulse-lanes');
const channelTitleEl = document.querySelector('#channel-title');
const channelDescriptionEl = document.querySelector('#channel-description');
const channelTopicEl = document.querySelector('#channel-topic');
const scopeShellEl = document.querySelector('#scope-shell');
const forumColumnEl = document.querySelector('#forum-column');
const postListEl = document.querySelector('#post-list');
const postComposerEl = document.querySelector('#post-composer');
const postTitleEl = document.querySelector('#post-title');
const postBodyEl = document.querySelector('#post-body');
const postAttachmentListEl = document.querySelector('#post-attachment-list');
const postAddAttachmentEl = document.querySelector('#post-add-attachment');
const threadColumnEl = document.querySelector('#thread-column');
const threadParentCopyEl = document.querySelector('#thread-parent-copy');
const threadListEl = document.querySelector('#thread-list');
const threadComposerEl = document.querySelector('#thread-composer');
const threadTitleEl = document.querySelector('#thread-title');
const scopeContextEl = document.querySelector('#scope-context');
const messagesEl = document.querySelector('#messages');
const composerEl = document.querySelector('#composer');
const bodyEl = document.querySelector('#message-body');
const messageAttachmentListEl = document.querySelector('#message-attachment-list');
const messageAddAttachmentEl = document.querySelector('#message-add-attachment');
const composerHintEl = document.querySelector('#composer-hint');
const sendButtonEl = document.querySelector('#send-button');
const refreshEl = document.querySelector('#refresh');
const healthEl = document.querySelector('#health');
const serviceHealthSummaryEl = document.querySelector('#service-health-summary');
const searchEl = document.querySelector('#search');
const searchResultsEl = document.querySelector('#search-results');
const scopeSummaryEl = document.querySelector('#scope-summary');
const breadcrumbCardCopyEl = document.querySelector('#breadcrumb-card-copy');
const routeBreadcrumbsEl = document.querySelector('#route-breadcrumbs');
const routeBackEl = document.querySelector('#route-back');
const routeForwardEl = document.querySelector('#route-forward');
const routeHistoryCopyEl = document.querySelector('#route-history-copy');
const routeHistoryListEl = document.querySelector('#route-history-list');
const copyScopeLinkEl = document.querySelector('#copy-scope-link');
const copyMessageLinkEl = document.querySelector('#copy-message-link');
const linkActionCopyEl = document.querySelector('#link-action-copy');
const scopeReferenceCopyEl = document.querySelector('#scope-reference-copy');
const scopeReferencesEl = document.querySelector('#scope-references');
const messageReferenceCopyEl = document.querySelector('#message-reference-copy');
const messageReferencesEl = document.querySelector('#message-references');
const linkedContextCopyEl = document.querySelector('#linked-context-copy');
const linkedContextFilterCopyEl = document.querySelector('#linked-context-filter-copy');
const linkedContextSearchEl = document.querySelector('#linked-context-search');
const linkedContextFilterControlsEl = document.querySelector('#linked-context-filter-controls');
const linkedContextResultsEl = document.querySelector('#linked-context-results');
const linkedContextFormEl = document.querySelector('#linked-context-form');
const linkedContextSystemEl = document.querySelector('#linked-context-system');
const linkedContextExternalIdEl = document.querySelector('#linked-context-external-id');
const linkedContextSubmitEl = document.querySelector('#linked-context-submit');
const coordinationFocusCopyEl = document.querySelector('#coordination-focus-copy');
const coordinationFocusScopeEl = document.querySelector('#coordination-focus-scope');
const coordinationFocusMessageEl = document.querySelector('#coordination-focus-message');
const relayCopyEl = document.querySelector('#relay-copy');
const relayListEl = document.querySelector('#relay-list');
const handoffCopyEl = document.querySelector('#handoff-copy');
const handoffListEl = document.querySelector('#handoff-list');
const relayComposerEl = document.querySelector('#relay-composer');
const relayTargetEl = document.querySelector('#relay-target');
const relayReasonEl = document.querySelector('#relay-reason');
const relaySubmitEl = document.querySelector('#relay-submit');
const handoffComposerEl = document.querySelector('#handoff-composer');
const handoffTargetEl = document.querySelector('#handoff-target');
const handoffRationaleEl = document.querySelector('#handoff-rationale');
const handoffSubmitEl = document.querySelector('#handoff-submit');
const referenceComposerEl = document.querySelector('#reference-composer');
const referenceOwnerEl = document.querySelector('#reference-owner');
const referenceSystemEl = document.querySelector('#reference-system');
const referenceRelationEl = document.querySelector('#reference-relation');
const referenceExternalIdEl = document.querySelector('#reference-external-id');
const referenceUrlEl = document.querySelector('#reference-url');
const referenceTitleEl = document.querySelector('#reference-title');
const referenceSubmitEl = document.querySelector('#reference-submit');
const statusEl = document.querySelector('#status');

const externalReferenceSystems = ['anvil', 'github', 'discord'];
const externalReferenceRelations = ['tracks', 'blocks', 'implements', 'reportedBy', 'relatesTo', 'mirrors'];

const state = {
  identities: [],
  identityMap: new Map(),
  channels: [],
  recentActivity: [],
  projectPulse: null,
  directConversations: [],
  postsByChannelId: new Map(),
  postChannelIndex: new Map(),
  threadsByParentKey: new Map(),
  threadParentIndex: new Map(),
  messages: [],
  scopeExternalReferences: [],
  messageExternalReferences: [],
  linkedContextResults: [],
  linkedContextQuery: null,
  linkedContextSearchQuery: '',
  linkedContextOwnerTypeFilter: 'all',
  relays: [],
  handoffs: [],
  selectedChannelId: null,
  selectedDirectConversationId: null,
  selectedPostId: null,
  selectedThreadId: null,
  selectedMessageId: null,
  coordinationFocusMode: 'scope',
  selectedScope: null,
  health: null,
  routeActivation: null,
  routeActivationError: null,
  routeHistory: createRouteHistoryState(12),
  routeHistorySuspended: false
};

let routeSyncSuspended = true;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function threadParentKey(scopeType, scopeId) {
  return `${scopeType}:${scopeId}`;
}

async function getJson(path) {
  const response = await fetch(path);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? `Request failed for ${path}`);
    error.code = typeof payload.code === 'string' ? payload.code : null;
    error.details = payload.details ?? null;
    throw error;
  }
  return payload;
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error ?? `Request failed for ${path}`);
    error.code = typeof result.code === 'string' ? result.code : null;
    error.details = result.details ?? null;
    throw error;
  }
  return result;
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function selectedActor() {
  return actorSelect.value;
}

function selectedWorkspace() {
  return workspaceSelect.value;
}

function currentChannel() {
  return state.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;
}

function currentDirectConversation() {
  return state.directConversations.find((conversation) => conversation.id === state.selectedDirectConversationId) ?? null;
}

function currentPosts() {
  return state.postsByChannelId.get(state.selectedChannelId) ?? [];
}

function currentPost() {
  return currentPosts().find((post) => post.id === state.selectedPostId) ?? null;
}

function currentThreadParent() {
  const channel = currentChannel();
  if (!channel) {
    return null;
  }

  if (channel.kind === 'forum') {
    const post = currentPost();
    if (!post) {
      return null;
    }
    return {
      scopeType: 'post',
      scopeId: post.id,
      channelId: channel.id,
      postId: post.id,
      label: post.title
    };
  }

  return {
    scopeType: 'channel',
    scopeId: channel.id,
    channelId: channel.id,
    postId: null,
    label: channel.name
  };
}

function currentThreads() {
  const parent = currentThreadParent();
  if (!parent) {
    return [];
  }
  return state.threadsByParentKey.get(threadParentKey(parent.scopeType, parent.scopeId)) ?? [];
}

function currentThread() {
  return currentThreads().find((thread) => thread.id === state.selectedThreadId) ?? null;
}

function currentMessage() {
  return state.messages.find((message) => message.id === state.selectedMessageId) ?? null;
}

function currentWorkspaceLabel() {
  return workspaceSelect.selectedOptions[0]?.textContent ?? selectedWorkspace();
}

function currentLinkedContextQuery() {
  return state.linkedContextQuery ?? null;
}

function currentLinkedContextSearchQuery() {
  return state.linkedContextSearchQuery ?? '';
}

function currentLinkedContextOwnerTypeFilter() {
  const normalized = normalizeLinkedContextOwnerTypeFilter(state.linkedContextOwnerTypeFilter, state.linkedContextResults);
  state.linkedContextOwnerTypeFilter = normalized;
  return normalized;
}

function setLinkedContextOwnerTypeFilter(filterValue) {
  state.linkedContextOwnerTypeFilter = normalizeLinkedContextOwnerTypeFilter(filterValue, state.linkedContextResults);
}

function setLinkedContextSearchQuery(query) {
  state.linkedContextSearchQuery = String(query ?? '');
  if (linkedContextSearchEl) {
    linkedContextSearchEl.value = state.linkedContextSearchQuery;
  }
}

function setLinkedContextQuery(query) {
  if (!query?.system || !query?.externalId) {
    state.linkedContextQuery = null;
    state.linkedContextOwnerTypeFilter = 'all';
    setLinkedContextSearchQuery('');
    linkedContextSystemEl.value = externalReferenceSystems[0] ?? '';
    linkedContextExternalIdEl.value = '';
    return;
  }

  state.linkedContextQuery = {
    system: query.system,
    externalId: query.externalId,
    title: query.title ?? ''
  };
  state.linkedContextOwnerTypeFilter = 'all';
  setLinkedContextSearchQuery('');
  linkedContextSystemEl.value = query.system;
  linkedContextExternalIdEl.value = query.externalId;
}

function filteredLinkedContextResults(results = state.linkedContextResults, searchQuery = currentLinkedContextSearchQuery()) {
  return linkedContextSearchResults(results, searchQuery);
}

function hasSelectionRoute(route) {
  return Boolean(
    route.actorId ||
    route.workspaceId ||
    route.directConversationId ||
    route.channelId ||
    route.postId ||
    route.threadId ||
    route.messageId
  );
}

function currentScopeLabel() {
  const directConversation = currentDirectConversation();
  const channel = currentChannel();
  const post = currentPost();
  const thread = currentThread();

  if (directConversation) {
    return directConversationLabel(directConversation);
  }

  if (!channel) {
    return 'No scope selected';
  }

  if (thread) {
    return `${channel.name} / ${thread.title}`;
  }

  if (channel.kind === 'forum' && post) {
    return `${channel.name} / ${post.title}`;
  }

  return channel.name;
}

function activityTimestampValue(value) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityForScope(scopeType, scopeId) {
  return state.recentActivity.find((entry) => entry.scopeType === scopeType && entry.scopeId === scopeId) ?? null;
}

function activityForChannel(channelId) {
  return activityForScope('channel', channelId);
}

function activityForDirectConversation(directConversationId) {
  return activityForScope('direct', directConversationId);
}

function compareActivitySummaries(left, right) {
  const byTime = activityTimestampValue(right?.recentAt) - activityTimestampValue(left?.recentAt);
  if (byTime !== 0) {
    return byTime;
  }

  return String(left?.label ?? '').localeCompare(String(right?.label ?? ''));
}

function activityLabel(entry) {
  if (!entry) {
    return 'Unknown activity';
  }

  if (entry.scopeType === 'direct') {
    const conversation = state.directConversations.find((candidate) => candidate.id === entry.directConversationId);
    return conversation ? directConversationLabel(conversation) : 'Direct conversation';
  }

  return entry.label ?? entry.scopeId;
}

function summarizeActivityPreview(entry) {
  if (!entry) {
    return 'No recent activity yet.';
  }

  if (entry.preview) {
    return entry.preview;
  }

  if (entry.scopeType === 'direct') {
    return 'Direct conversation started but no messages are visible yet.';
  }

  return 'No recent activity has been captured for this lane yet.';
}

function summarizeActivityMeta(entry) {
  if (!entry?.recentAt) {
    return 'No recent activity yet';
  }

  const parts = [formatTimestamp(entry.recentAt)];
  if (entry.previewAuthorIdentityId) {
    parts.unshift(actorName(entry.previewAuthorIdentityId));
  }
  if (entry.activityKind && entry.activityKind !== 'message') {
    parts.push(entry.activityKind.replaceAll('-', ' '));
  }
  return parts.join(' | ');
}

function setStatus(message, tone = 'info') {
  if (!message) {
    statusEl.className = 'status hidden';
    statusEl.textContent = '';
    return;
  }

  statusEl.className = `status ${tone}`;
  statusEl.textContent = message;
}

function currentSelectionRouteHash() {
  return buildSelectionRouteHash({
    actorId: selectedActor(),
    workspaceId: selectedWorkspace(),
    directConversationId: state.selectedDirectConversationId,
    channelId: state.selectedChannelId,
    postId: state.selectedPostId,
    threadId: state.selectedThreadId,
    messageId: state.selectedMessageId,
    coordinationFocusMode: currentCoordinationFocusMode()
  });
}

function currentScopeSelection() {
  return {
    actorId: selectedActor(),
    workspaceId: selectedWorkspace(),
    directConversationId: state.selectedDirectConversationId,
    channelId: state.selectedChannelId,
    postId: state.selectedPostId,
    threadId: state.selectedThreadId,
    coordinationFocusMode: 'scope'
  };
}

function currentMessageSelection() {
  return {
    ...currentScopeSelection(),
    messageId: state.selectedMessageId,
    coordinationFocusMode: currentCoordinationFocusMode()
  };
}

function currentRouteBreadcrumbs() {
  const directConversation = currentDirectConversation();
  const channel = currentChannel();
  const post = currentPost();
  const thread = currentThread();
  const message = currentMessage();
  const route = message ? currentMessageSelection() : currentScopeSelection();

  return deriveBreadcrumbRoute(route).map((crumb) => {
    if (crumb.level === 'workspace') {
      return { level: crumb.level, label: currentWorkspaceLabel() };
    }

    if (crumb.level === 'direct') {
      return { level: crumb.level, label: directConversation ? directConversationLabel(directConversation) : crumb.id };
    }

    if (crumb.level === 'channel') {
      return { level: crumb.level, label: channel?.name ?? crumb.id };
    }

    if (crumb.level === 'post') {
      return { level: crumb.level, label: post?.title ?? crumb.id };
    }

    if (crumb.level === 'thread') {
      return { level: crumb.level, label: thread?.title ?? crumb.id };
    }

    if (crumb.level === 'message') {
      return {
        level: crumb.level,
        label: message ? `Message by ${actorName(message.authorIdentityId)}` : crumb.id
      };
    }

    return { level: crumb.level, label: crumb.id };
  });
}

function renderBreadcrumbTrail() {
  const crumbs = currentRouteBreadcrumbs();
  if (crumbs.length === 0) {
    return `
      <span class="breadcrumb-chip breadcrumb-placeholder">Workspace</span>
      <span class="breadcrumb-separator" aria-hidden="true">/</span>
      <span class="breadcrumb-chip breadcrumb-placeholder">Scope</span>
      <span class="breadcrumb-separator" aria-hidden="true">/</span>
      <span class="breadcrumb-chip breadcrumb-placeholder">Message</span>
    `;
  }

  return crumbs.map((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    const label = escapeHtml(crumb.label);
    if (isLast) {
      return `<span class="breadcrumb-chip current" aria-current="page">${label}</span>`;
    }

    return `<button type="button" class="breadcrumb-chip breadcrumb-chip-button" data-breadcrumb-level="${escapeHtml(crumb.level)}">${label}</button>`;
  }).join('<span class="breadcrumb-separator" aria-hidden="true">/</span>');
}

function renderBreadcrumbs() {
  const message = currentMessage();
  if (!state.selectedScope && !state.selectedChannelId && !state.selectedDirectConversationId) {
    breadcrumbCardCopyEl.textContent = `Acting as ${actorName(selectedActor())}. Select a scope to make the current route legible and navigable.`;
  }
  else if (message) {
    breadcrumbCardCopyEl.textContent = `Acting as ${actorName(selectedActor())} in ${currentScopeLabel()}. The selected message is active in the route context.`;
  }
  else {
    breadcrumbCardCopyEl.textContent = `Acting as ${actorName(selectedActor())} in ${currentScopeLabel()}. Use the breadcrumbs to step back through broader readable context.`;
  }

  routeBreadcrumbsEl.innerHTML = renderBreadcrumbTrail();
}

function currentRouteHistoryLabel() {
  const message = currentMessage();
  const thread = currentThread();
  const post = currentPost();
  const directConversation = currentDirectConversation();
  const channel = currentChannel();

  if (message) {
    return `Message · ${actorName(message.authorIdentityId)} · ${currentScopeLabel()}`;
  }

  if (thread) {
    return `Thread · ${thread.title}`;
  }

  if (post) {
    return `Post · ${post.title}`;
  }

  if (directConversation) {
    return `Direct · ${directConversationLabel(directConversation)}`;
  }

  if (channel) {
    return `Channel · ${channel.name}`;
  }

  return `Workspace · ${currentWorkspaceLabel()}`;
}

function currentRouteHistoryEntry() {
  return {
    hash: currentSelectionRouteHash(),
    label: currentRouteHistoryLabel(),
    detail: `${actorName(selectedActor())} · ${currentWorkspaceLabel()}`,
    visitedAt: new Date().toISOString()
  };
}

function recordCurrentRouteHistory() {
  if (state.routeHistorySuspended) {
    return;
  }

  const next = recordRouteHistory(
    state.routeHistoryEntries,
    state.routeHistoryIndex,
    currentRouteHistoryEntry()
  );

  state.routeHistoryEntries = next.entries;
  state.routeHistoryIndex = next.index;
}

function renderRouteHistory() {
  const currentEntry = state.routeHistoryEntries[state.routeHistoryIndex] ?? null;

  routeBackEl.disabled = state.routeHistoryIndex <= 0;
  routeForwardEl.disabled = state.routeHistoryIndex < 0 || state.routeHistoryIndex >= state.routeHistoryEntries.length - 1;

  if (!currentEntry) {
    routeHistoryCopyEl.textContent = 'Recent readable route history will appear here as you navigate.';
    routeHistoryListEl.innerHTML = '<div class="muted">No recent route history yet.</div>';
    return;
  }

  routeHistoryCopyEl.textContent = 'Use back and forward to step through recent readable route context without leaving NEXUS.';

  const visibleEntries = recentRouteHistory({
    entries: state.routeHistoryEntries,
    index: state.routeHistoryIndex
  }, 6);
  routeHistoryListEl.innerHTML = visibleEntries.map((entry) => {
    const actualIndex = entry.index;
    const active = entry.isCurrent;
    return `
      <button type="button" class="route-history-entry${active ? ' active' : ''}" data-route-history-index="${actualIndex}">
        <span class="route-history-entry-label">${escapeHtml(entry.label)}</span>
        <span class="route-history-entry-meta">${escapeHtml(`${entry.detail} · ${formatTimestamp(entry.visitedAt)}`)}</span>
      </button>
    `;
  }).join('');
}

async function navigateRouteHistory(direction) {
  const next = stepRouteHistory(state.routeHistoryEntries, state.routeHistoryIndex, direction);
  if (!next.entry) {
    return;
  }

  state.routeHistoryIndex = next.index;
  state.routeHistorySuspended = true;
  try {
    await applySelectionRoute(parseSelectionRouteHash(next.entry.hash), { announceFailures: true });
  }
  finally {
    state.routeHistorySuspended = false;
    renderRouteHistory();
  }
}

async function navigateRouteHistoryIndex(index) {
  const next = selectRouteHistoryIndex({
    entries: state.routeHistoryEntries,
    index: state.routeHistoryIndex
  }, index);
  if (!next.entry) {
    return;
  }

  state.routeHistoryIndex = next.history.index;
  state.routeHistorySuspended = true;
  try {
    await applySelectionRoute(parseSelectionRouteHash(next.entry.hash), { announceFailures: true });
  }
  finally {
    state.routeHistorySuspended = false;
    renderRouteHistory();
  }
}

async function navigateBreadcrumb(level) {
  if (level === 'workspace') {
    state.selectedDirectConversationId = null;
    state.selectedChannelId = null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
    return;
  }

  const directConversation = currentDirectConversation();
  const channel = currentChannel();
  const post = currentPost();
  const thread = currentThread();

  if (level === 'direct' && directConversation) {
    state.selectedDirectConversationId = directConversation.id;
    state.selectedChannelId = null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
    return;
  }

  if (level === 'channel' && channel) {
    state.selectedDirectConversationId = null;
    state.selectedChannelId = channel.id;
    state.selectedPostId = null;
    state.selectedThreadId = null;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
    return;
  }

  if (level === 'post' && post) {
    state.selectedDirectConversationId = null;
    state.selectedChannelId = post.channelId;
    state.selectedPostId = post.id;
    state.selectedThreadId = null;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
    return;
  }

  if (level === 'thread' && thread) {
    const parent = state.threadParentIndex.get(thread.id) ?? null;
    if (!parent) {
      return;
    }

    state.selectedDirectConversationId = null;
    state.selectedChannelId = parent.channelId;
    state.selectedPostId = parent.postId ?? null;
    state.selectedThreadId = thread.id;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
  }
}

function syncSelectionRoute() {
  if (routeSyncSuspended) {
    return;
  }

  const nextHash = currentSelectionRouteHash();
  if (window.location.hash !== nextHash) {
    const url = new URL(window.location.href);
    url.hash = nextHash.startsWith('#') ? nextHash.slice(1) : nextHash;
    history.replaceState(null, '', url);
  }

  recordCurrentRouteHistory();
}

function renderLinkActions() {
  const hasScope = Boolean(state.selectedScope);
  const message = currentMessage();

  copyScopeLinkEl.disabled = !hasScope;
  copyMessageLinkEl.disabled = !message;

  if (!hasScope) {
    linkActionCopyEl.textContent = 'Select a readable scope to copy a NEXUS link.';
    return;
  }

  if (!message) {
    linkActionCopyEl.textContent = 'Copy the current scope link, or select a message to unlock a message-specific link.';
    return;
  }

  linkActionCopyEl.textContent = 'Copy either the current scope link or the selected-message context link.';
}

function actorName(identityId) {
  return state.identityMap.get(identityId)?.displayName ?? identityId;
}

function formatTimestamp(value) {
  if (!value) {
    return 'Unknown time';
  }
  return new Date(value).toLocaleString();
}

function formatBytes(bytes) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Size unknown';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function safeAttachmentHref(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  }
  catch {
    return null;
  }

  return null;
}

function attachmentMetaLine(attachment) {
  const parts = [];
  if (attachment.mediaType) {
    parts.push(attachment.mediaType);
  }
  parts.push(formatBytes(attachment.bytes));
  return parts.join(' | ');
}

function renderAttachmentMarkup(attachments = []) {
  if (!attachments.length) {
    return '';
  }

  return `
    <div class="attachment-list">
      ${attachments.map((attachment) => {
        const href = safeAttachmentHref(attachment.url);
        return `
          <div class="attachment-card">
            <div class="attachment-card-top">
              <strong>${escapeHtml(attachment.name ?? 'attachment')}</strong>
              <span class="pill attachment-pill">attachment</span>
            </div>
            <div class="attachment-card-meta">${escapeHtml(attachmentMetaLine(attachment))}</div>
            ${href
              ? `<a class="attachment-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open attachment</a>`
              : attachment.url
                ? `<div class="attachment-link muted">${escapeHtml(attachment.url)}</div>`
                : '<div class="attachment-link muted">No URL metadata</div>'}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderAttachmentSearchSummary(attachments = []) {
  if (!attachments.length) {
    return '';
  }

  const names = attachments.slice(0, 3).map((attachment) => attachment.name ?? 'attachment').join(', ');
  const remainder = attachments.length > 3 ? ` +${attachments.length - 3} more` : '';
  return `
    <div class="search-card-attachments">
      ${escapeHtml(`${attachments.length} attachment${attachments.length === 1 ? '' : 's'}: ${names}${remainder}`)}
    </div>
  `;
}

function syncAttachmentDraftPlaceholder(container) {
  const hasDrafts = Boolean(container.querySelector('.attachment-draft'));
  const placeholder = container.querySelector('.attachment-empty');
  if (!hasDrafts && !placeholder) {
    const empty = document.createElement('div');
    empty.className = 'attachment-empty';
    empty.textContent = 'No attachment metadata drafted yet.';
    container.appendChild(empty);
    return;
  }

  if (hasDrafts && placeholder) {
    placeholder.remove();
  }
}

function appendAttachmentDraft(container, draft = {}) {
  container.querySelector('.attachment-empty')?.remove();

  const row = document.createElement('div');
  row.className = 'attachment-draft';
  row.innerHTML = `
    <input class="attachment-name" type="text" placeholder="Attachment name" value="${escapeHtml(draft.name ?? '')}">
    <input class="attachment-media-type" type="text" placeholder="Media type" value="${escapeHtml(draft.mediaType ?? '')}">
    <input class="attachment-url" type="text" placeholder="https://example.invalid/file" value="${escapeHtml(draft.url ?? '')}">
    <input class="attachment-bytes" type="number" min="0" step="1" placeholder="Bytes" value="${draft.bytes ?? ''}">
    <button type="button" class="attachment-remove">Remove</button>
  `;
  row.querySelector('.attachment-remove').addEventListener('click', () => {
    row.remove();
    syncAttachmentDraftPlaceholder(container);
  });
  container.appendChild(row);
}

function collectAttachmentDrafts(container) {
  return Array.from(container.querySelectorAll('.attachment-draft')).map((row) => {
    const name = row.querySelector('.attachment-name')?.value.trim() ?? '';
    const mediaType = row.querySelector('.attachment-media-type')?.value.trim() ?? '';
    const url = row.querySelector('.attachment-url')?.value.trim() ?? '';
    const bytesRaw = row.querySelector('.attachment-bytes')?.value.trim() ?? '';
    const bytes = Number.parseInt(bytesRaw, 10);
    const hasValue = Boolean(name || mediaType || url || bytesRaw);
    if (!hasValue) {
      return null;
    }

    return {
      name: name || 'attachment',
      mediaType: mediaType || 'application/octet-stream',
      url,
      bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0
    };
  }).filter(Boolean);
}

function clearAttachmentDrafts(container) {
  container.innerHTML = '';
  syncAttachmentDraftPlaceholder(container);
}

function referenceOwnerValue(ownerType, ownerId) {
  return `${ownerType}:${ownerId}`;
}

function parseReferenceOwnerValue(value) {
  const separator = value.indexOf(':');
  if (separator === -1) {
    return null;
  }

  return {
    ownerType: value.slice(0, separator),
    ownerId: value.slice(separator + 1)
  };
}

function currentReferenceOwners() {
  const owners = [];
  if (state.selectedScope) {
    owners.push({
      value: referenceOwnerValue(state.selectedScope.scopeType, state.selectedScope.scopeId),
      label: `Current scope (${currentScopeLabel()})`
    });
  }

  const message = currentMessage();
  if (message) {
    owners.push({
      value: referenceOwnerValue('message', message.id),
      label: `Selected message (${actorName(message.authorIdentityId)})`
    });
  }

  return owners;
}

function currentCoordinationTargets() {
  const targets = new Map();
  if (state.selectedScope) {
    targets.set(referenceOwnerValue(state.selectedScope.scopeType, state.selectedScope.scopeId), {
      value: referenceOwnerValue(state.selectedScope.scopeType, state.selectedScope.scopeId),
      label: `Current scope (${currentScopeLabel()})`
    });
  }

  for (const channel of state.channels) {
    const value = referenceOwnerValue('channel', channel.id);
    if (targets.has(value)) {
      continue;
    }
    targets.set(value, {
      value,
      label: `Channel (${channel.name})`
    });
  }

  for (const directConversation of state.directConversations) {
    const value = referenceOwnerValue('direct', directConversation.id);
    if (targets.has(value)) {
      continue;
    }
    targets.set(value, {
      value,
      label: `Direct (${directConversationLabel(directConversation)})`
    });
  }

  return [...targets.values()];
}

function renderReferenceOwnerOptions() {
  const previousValue = referenceOwnerEl.value;
  const owners = currentReferenceOwners();
  referenceOwnerEl.innerHTML = '';

  for (const owner of owners) {
    const option = document.createElement('option');
    option.value = owner.value;
    option.textContent = owner.label;
    referenceOwnerEl.appendChild(option);
  }

  if (!owners.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No selectable owner';
    referenceOwnerEl.appendChild(option);
  }

  referenceOwnerEl.value = owners.some((owner) => owner.value === previousValue)
    ? previousValue
    : owners[0]?.value ?? '';
  referenceOwnerEl.disabled = owners.length === 0;
  referenceSubmitEl.disabled = owners.length === 0;
}

function renderCoordinationComposerOptions() {
  const previousRelayTarget = relayTargetEl.value;
  const previousHandoffTarget = handoffTargetEl.value;
  const targets = currentCoordinationTargets();
  relayTargetEl.innerHTML = '';

  for (const target of targets) {
    const option = document.createElement('option');
    option.value = target.value;
    option.textContent = target.label;
    relayTargetEl.appendChild(option);
  }

  if (!targets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No relay target';
    relayTargetEl.appendChild(option);
  }

  const handoffTargets = state.identities.filter((identity) => identity.id !== selectedActor());
  handoffTargetEl.innerHTML = '';
  for (const identity of handoffTargets) {
    const option = document.createElement('option');
    option.value = identity.id;
    option.textContent = `${identity.displayName} (${identity.kind})`;
    handoffTargetEl.appendChild(option);
  }

  if (!handoffTargets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No handoff target';
    handoffTargetEl.appendChild(option);
  }

  const canCoordinate = Boolean(state.selectedScope);
  relayTargetEl.value = targets.some((target) => target.value === previousRelayTarget)
    ? previousRelayTarget
    : targets[0]?.value ?? '';
  handoffTargetEl.value = handoffTargets.some((identity) => identity.id === previousHandoffTarget)
    ? previousHandoffTarget
    : handoffTargets[0]?.id ?? '';

  relayTargetEl.disabled = !canCoordinate || targets.length === 0;
  relayReasonEl.disabled = !canCoordinate;
  relaySubmitEl.disabled = !canCoordinate || targets.length === 0;
  handoffTargetEl.disabled = !canCoordinate || handoffTargets.length === 0;
  handoffRationaleEl.disabled = !canCoordinate;
  handoffSubmitEl.disabled = !canCoordinate || handoffTargets.length === 0;
}

function renderReferenceCards(container, references, emptyText, options = {}) {
  container.innerHTML = '';
  if (!references.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  for (const reference of references) {
    const card = document.createElement('article');
    card.className = 'reference-card';
    const href = safeAttachmentHref(reference.url);
    card.innerHTML = `
      <div class="reference-card-top">
        <strong>${escapeHtml(reference.title)}</strong>
        <span class="pill">${escapeHtml(reference.system)}</span>
      </div>
      <div class="reference-card-meta">${escapeHtml(reference.relationType)} | ${escapeHtml(reference.externalId)}</div>
      ${href
        ? `<a class="reference-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(reference.url)}</a>`
        : `<div class="reference-link muted">${escapeHtml(reference.url)}</div>`}
      ${options.onLookup
        ? '<div class="record-action-row"><button type="button" class="ghost-button reference-lookup">Find linked context</button></div>'
        : ''}
      <div class="reference-card-meta">Created by ${escapeHtml(actorName(reference.createdByIdentityId))} | ${escapeHtml(formatTimestamp(reference.createdAt))}</div>
    `;

    if (options.onLookup) {
      card.querySelector('.reference-lookup')?.addEventListener('click', () => {
        options.onLookup(reference);
      });
    }

    container.appendChild(card);
  }
}

function linkedContextOwnerMeta(result) {
  const route = result?.route ?? {};
  if (route.directConversationId) {
    return route.messageId
      ? `Direct conversation | linked message ${route.messageId}`
      : 'Direct conversation';
  }

  const parts = [];
  if (route.workspaceId) {
    parts.push(`Workspace ${route.workspaceId}`);
  }
  if (route.channelId) {
    parts.push(`Channel ${route.channelId}`);
  }
  if (route.postId) {
    parts.push(`Post ${route.postId}`);
  }
  if (route.threadId) {
    parts.push(`Thread ${route.threadId}`);
  }
  if (route.messageId) {
    parts.push(`Message ${route.messageId}`);
  }
  return parts.join(' | ') || 'No linked NEXUS route metadata';
}

function renderLinkedContextCards(container, results, emptyText) {
  container.innerHTML = '';
  const groups = groupLinkedContextResults(results, currentLinkedContextOwnerTypeFilter());
  if (!groups.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'linked-context-group';
    section.innerHTML = `
      <div class="linked-context-group-header">
        <strong>${escapeHtml(group.label)}</strong>
        <span class="linked-context-group-count">${escapeHtml(`${group.results.length} result${group.results.length === 1 ? '' : 's'}`)}</span>
      </div>
    `;

    const list = document.createElement('div');
    list.className = 'reference-list';

    for (const result of group.results) {
      const card = document.createElement('article');
      card.className = 'reference-card';
      const selection = buildLinkedContextSelection(result, selectedActor());
      card.innerHTML = `
        <div class="reference-card-top">
          <strong>${escapeHtml(result.owner?.label ?? `${result.reference?.ownerType ?? 'owner'}:${result.reference?.ownerId ?? 'unknown'}`)}</strong>
          <span class="pill">${escapeHtml(result.reference?.system ?? 'xref')}</span>
        </div>
        <div class="reference-card-meta">${escapeHtml(`${result.reference?.relationType ?? 'relatesTo'} | ${result.reference?.externalId ?? ''}`)}</div>
        <div class="reference-card-meta">${escapeHtml(linkedContextOwnerMeta(result))}</div>
        <div class="reference-card-meta">${escapeHtml(summarizeLinkedContextPath(result))}</div>
        <div class="reference-card-meta">${escapeHtml(summarizeLinkedContextCoordination(result))}</div>
        ${selection
          ? '<div class="record-action-row"><button type="button" class="ghost-button linked-context-jump">Open linked context</button></div>'
          : ''}
        <div class="reference-card-meta">${escapeHtml(formatTimestamp(result.reference?.createdAt))}</div>
      `;

      if (selection) {
        card.querySelector('.linked-context-jump')?.addEventListener('click', () => {
          applySelectionRoute(selection, { announceFailures: true }).then(() => {
            setStatus(`Opened linked NEXUS context for ${result.reference?.system ?? 'external'}:${result.reference?.externalId ?? ''}.`, 'success');
          }).catch((error) => {
            setStatus(error.message, 'error');
          });
        });
      }

      list.appendChild(card);
    }

    section.appendChild(list);
    container.appendChild(section);
  }
}

function clearReferenceComposer() {
  referenceExternalIdEl.value = '';
  referenceUrlEl.value = '';
  referenceTitleEl.value = '';
}

function updateLinkedContextComposerState() {
  linkedContextSubmitEl.disabled = !linkedContextSystemEl.value || !linkedContextExternalIdEl.value.trim();
}

function summarizeLinkedContextLookup(linkedQuery, visibleResults, searchQuery, activeFilter) {
  const search = String(searchQuery ?? '').trim();
  const count = visibleResults.length;
  const ownerTypeCount = Math.max(linkedContextOwnerTypeFilters(visibleResults).length - 1, 0);
  const activeLabel = activeFilter === 'all' ? 'all readable linked results' : linkedContextOwnerTypeLabel(activeFilter).toLowerCase();
  const countLabel = `${count} readable linked result${count === 1 ? '' : 's'}`;

  if (!search) {
    return `${linkedQuery.system.toUpperCase()} ${linkedQuery.externalId} | ${countLabel}`;
  }

  if (count === 0) {
    return `${linkedQuery.system.toUpperCase()} ${linkedQuery.externalId} | No readable linked results match "${search}" for ${activeLabel}.`;
  }

  if (activeFilter === 'all') {
    return `${linkedQuery.system.toUpperCase()} ${linkedQuery.externalId} | Showing ${countLabel} matching "${search}" across ${ownerTypeCount} owner type${ownerTypeCount === 1 ? '' : 's'}.`;
  }

  return `${linkedQuery.system.toUpperCase()} ${linkedQuery.externalId} | Showing ${countLabel} matching "${search}" for ${activeLabel}.`;
}

function renderLinkedContextFilterControls(visibleResults = state.linkedContextResults) {
  const query = currentLinkedContextQuery();
  const activeFilter = currentLinkedContextOwnerTypeFilter();
  const filterOptions = linkedContextOwnerTypeFilters(visibleResults)
    .filter((option) => option.value === 'all' || option.count > 0);
  const activeOption = filterOptions.find((option) => option.value === activeFilter)
    ?? (activeFilter === 'all'
      ? filterOptions[0]
      : {
        value: activeFilter,
        label: linkedContextOwnerTypeLabel(activeFilter),
        count: 0
      });

  linkedContextFilterControlsEl.innerHTML = '';

  if (!query) {
    linkedContextFilterCopyEl.textContent = 'Owner-type grouping and filters unlock after you run a linked-context lookup.';
  }
  else {
    const search = currentLinkedContextSearchQuery().trim();
    if (search) {
      linkedContextFilterCopyEl.textContent = summarizeLinkedContextLookup(query, visibleResults, search, activeFilter);
    }
    else {
      linkedContextFilterCopyEl.textContent = summarizeLinkedContextFilter(visibleResults, activeFilter);
    }
  }

  const optionsToRender = filterOptions.length > 0
    ? filterOptions
    : [{ value: 'all', label: 'All readable', count: 0 }];

  if (activeOption && !optionsToRender.some((option) => option.value === activeOption.value)) {
    optionsToRender.push(activeOption);
  }

  for (const option of optionsToRender) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ghost-button linked-context-filter-button${activeFilter === option.value ? ' active' : ''}`;
    button.textContent = `${option.label} (${option.count})`;
    button.disabled = !query || option.count === 0;
    button.addEventListener('click', () => {
      setLinkedContextOwnerTypeFilter(option.value);
      renderExternalReferences();
    });
    linkedContextFilterControlsEl.appendChild(button);
  }
}

function summarizeLinkedContextEmptyState(linkedQuery, visibleResults, searchQuery, activeFilter) {
  const search = String(searchQuery ?? '').trim();
  if (search) {
    if (visibleResults.length === 0) {
      if (activeFilter === 'all') {
        return `No readable linked context matches "${search}". Clear the search to restore all owner types.`;
      }
      return `No readable linked context matches "${search}" for ${linkedContextOwnerTypeLabel(activeFilter).toLowerCase()}. Clear the search or switch owner types.`;
    }

    return `Search is currently narrowing the linked-context results for "${search}".`;
  }

  return linkedQuery
    ? 'No readable NEXUS context is currently linked to that external item for this actor.'
    : 'Choose a system and external ID to find linked NEXUS context.';
}

function coordinationCountsForMessage(messageId) {
  return deriveCoordinationCountsForMessage(state.relays, state.handoffs, messageId);
}

function currentCoordinationFocusMode() {
  const mode = normalizeCoordinationFocusMode(state.coordinationFocusMode, state.selectedMessageId);
  state.coordinationFocusMode = mode;
  return mode;
}

function filteredCoordinationRecords(records) {
  return filterCoordinationRecords(records, currentCoordinationFocusMode(), state.selectedMessageId);
}

function renderMessageCoordinationBadges(messageId) {
  const counts = coordinationCountsForMessage(messageId);
  const badges = [];
  if (counts.relayCount > 0) {
    badges.push(`<span class="pill coordination-badge relay-badge">${escapeHtml(`${counts.relayCount} relay${counts.relayCount === 1 ? '' : 's'}`)}</span>`);
  }
  if (counts.handoffCount > 0) {
    badges.push(`<span class="pill coordination-badge handoff-badge">${escapeHtml(`${counts.handoffCount} handoff${counts.handoffCount === 1 ? '' : 's'}`)}</span>`);
  }

  if (badges.length === 0) {
    return '';
  }

  return `<div class="message-coordination-row">${badges.join('')}</div>`;
}

function scopeLabelFromParts(scopeType, scopeId) {
  if (!scopeType || !scopeId) {
    return 'Unknown scope';
  }

  if (scopeType === 'channel') {
    const channel = state.channels.find((entry) => entry.id === scopeId);
    return channel ? channel.name : `${scopeType}:${scopeId}`;
  }

  if (scopeType === 'post') {
    const channelId = state.postChannelIndex.get(scopeId);
    const post = channelId ? (state.postsByChannelId.get(channelId) ?? []).find((entry) => entry.id === scopeId) : null;
    return post ? `Post: ${post.title}` : `${scopeType}:${scopeId}`;
  }

  if (scopeType === 'thread') {
    const parent = state.threadParentIndex.get(scopeId);
    const threadList = parent ? (state.threadsByParentKey.get(threadParentKey(parent.parentScopeType, parent.parentScopeId)) ?? []) : [];
    const thread = threadList.find((entry) => entry.id === scopeId);
    return thread ? `Thread: ${thread.title}` : `${scopeType}:${scopeId}`;
  }

  if (scopeType === 'direct') {
    const conversation = state.directConversations.find((entry) => entry.id === scopeId);
    return conversation ? `Direct: ${directConversationLabel(conversation)}` : `${scopeType}:${scopeId}`;
  }

  return `${scopeType}:${scopeId}`;
}

function relayPrimaryLine(relay) {
  const from = scopeLabelFromParts(
    relay.fromScopeType ?? relay.sourceScopeType ?? relay.fromScope?.scopeType ?? relay.source?.scopeType,
    relay.fromScopeId ?? relay.sourceScopeId ?? relay.fromScope?.scopeId ?? relay.source?.scopeId
  );
  const to = scopeLabelFromParts(
    relay.toScopeType ?? relay.targetScopeType ?? relay.toScope?.scopeType ?? relay.target?.scopeType,
    relay.toScopeId ?? relay.targetScopeId ?? relay.toScope?.scopeId ?? relay.target?.scopeId
  );
  return `${from} -> ${to}`;
}

function handoffPrimaryLine(handoff) {
  const from = actorName(handoff.fromIdentityId ?? handoff.sourceIdentityId ?? handoff.source?.identityId) || 'Unknown source';
  const to = actorName(handoff.toIdentityId ?? handoff.targetIdentityId ?? handoff.target?.identityId) || 'Unknown target';
  return `${from} -> ${to}`;
}

function recordScopeLine(record) {
  return scopeLabelFromParts(
    record.scopeType ?? record.sourceScopeType ?? record.fromScopeType ?? record.scope?.scopeType ?? record.scope?.type,
    record.scopeId ?? record.sourceScopeId ?? record.fromScopeId ?? record.scope?.scopeId ?? record.scope?.id
  );
}

async function navigateToMessage(messageId) {
  if (!messageId) {
    throw new Error('No related message is available for this record.');
  }

  const message = await getJson(`/api/message?actorId=${encodeURIComponent(selectedActor())}&messageId=${encodeURIComponent(messageId)}`);
  state.selectedMessageId = message.id;

  if (message.scopeType === 'channel') {
    state.selectedDirectConversationId = null;
    state.selectedChannelId = message.scopeId;
    state.selectedPostId = null;
    state.selectedThreadId = null;
  }
  else if (message.scopeType === 'post') {
    const channelId = state.postChannelIndex.get(message.scopeId) ?? message.source?.routedChannelId ?? null;
    if (!channelId) {
      throw new Error('The related post is not available in the current channel index.');
    }
    state.selectedDirectConversationId = null;
    state.selectedChannelId = channelId;
    state.selectedPostId = message.scopeId;
    state.selectedThreadId = null;
  }
  else if (message.scopeType === 'thread') {
    const parent = state.threadParentIndex.get(message.scopeId) ?? null;
    if (!parent) {
      throw new Error('The related thread is not available in the current thread index.');
    }
    state.selectedDirectConversationId = null;
    state.selectedChannelId = parent.channelId;
    state.selectedPostId = parent.postId ?? null;
    state.selectedThreadId = message.scopeId;
  }
  else if (message.scopeType === 'direct') {
    state.selectedDirectConversationId = message.scopeId;
    state.selectedChannelId = null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
  }
  else {
    throw new Error(`Unsupported related message scope: ${message.scopeType}`);
  }

  await syncSelection();
  if (!state.messages.some((entry) => entry.id === message.id)) {
    throw new Error('The related message could not be loaded in the selected scope.');
  }

  state.selectedMessageId = message.id;
  await loadExternalReferences();
  renderAll();
}

async function navigateToActivitySummary(entry) {
  if (!entry) {
    return;
  }

  if (entry.messageId) {
    await navigateToMessage(entry.messageId);
    return;
  }

  if (entry.scopeType === 'direct' && entry.directConversationId) {
    state.selectedDirectConversationId = entry.directConversationId;
    state.selectedChannelId = null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
    return;
  }

  if (entry.channelId) {
    state.selectedDirectConversationId = null;
    state.selectedChannelId = entry.channelId;
    state.selectedPostId = entry.postId ?? null;
    state.selectedThreadId = entry.threadId ?? null;
    state.selectedMessageId = null;
    state.coordinationFocusMode = 'scope';
    await syncSelection();
  }
}

function renderRecordCards(container, records, type, emptyText) {
  container.innerHTML = '';
  if (!records.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  for (const record of records) {
    const card = document.createElement('article');
    card.className = 'reference-card';
    const primary = type === 'relay' ? relayPrimaryLine(record) : handoffPrimaryLine(record);
    const rationale = record.reason ?? record.rationale ?? record.summary ?? record.note ?? 'No rationale metadata';
    const createdAt = record.occurredAt ?? record.createdAt ?? record.updatedAt ?? null;
    card.innerHTML = `
      <div class="reference-card-top">
        <strong>${escapeHtml(primary)}</strong>
        <span class="pill">${escapeHtml(type)}</span>
      </div>
      <div class="reference-card-meta">${escapeHtml(recordScopeLine(record))}</div>
      <div class="reference-card-meta">${escapeHtml(rationale)}</div>
      ${record.messageId
        ? `<div class="record-action-row"><button type="button" class="ghost-button record-jump">Jump to related message</button></div>`
        : ''}
      <details class="record-details">
        <summary>Raw record</summary>
        <pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre>
      </details>
      <div class="reference-card-meta">${escapeHtml(formatTimestamp(createdAt))}</div>
    `;

    if (record.messageId) {
      card.querySelector('.record-jump')?.addEventListener('click', () => {
        navigateToMessage(record.messageId).then(() => {
          setStatus('Jumped to the related message.', 'success');
        }).catch((error) => {
          setStatus(error.message, 'error');
        });
      });
    }

    container.appendChild(card);
  }
}

function directConversationLabel(conversation) {
  const otherMembers = conversation.memberIdentityIds.filter((identityId) => identityId !== selectedActor());
  const names = (otherMembers.length > 0 ? otherMembers : conversation.memberIdentityIds).map((identityId) => actorName(identityId));
  return names.join(', ');
}

function directConversationMembers(conversation) {
  return conversation.memberIdentityIds.map((identityId) => actorName(identityId)).join(', ');
}

function summarizeTopic(channel) {
  if (channel?.topic) {
    return channel.topic;
  }
  if (currentDirectConversation()) {
    return 'Direct conversations are private to their members and do not inherit channel routing or public lane policy.';
  }
  return 'No topic metadata is available for this lane yet.';
}

function summarizeServiceOrigin(health) {
  if (health?.publicOrigin) {
    return health.publicOrigin;
  }
  return health?.mode === 'hosted-capable'
    ? 'Hosted origin not declared'
    : 'Local desktop origin';
}

function summarizeServiceStorage(health) {
  if (health?.storageMode === 'library-postgres') {
    return 'LIBRARY Postgres';
  }
  if (health?.storageMode === 'json') {
    return 'JSON bootstrap';
  }
  return 'Storage mode unavailable';
}

function summarizeActiveRouteActivations(health) {
  const count = Number(health?.runtime?.activeRouteActivationCount ?? 0);
  return `${count} active`;
}

function summarizeLastRuntimeActivation(health) {
  const lastActivatedAt = health?.runtime?.lastActivatedAt ?? null;
  if (!lastActivatedAt) {
    return 'No active runtime route yet';
  }

  return `Last activated ${formatTimestamp(lastActivatedAt)}`;
}

function summarizeRuntimeCommandCount(health) {
  return String(health?.runtime?.commandDispatchCount ?? 0);
}

function summarizeLastRuntimeCommand(health) {
  const lastCommand = health?.runtime?.lastCommand ?? null;
  if (!lastCommand?.commandType) {
    return 'No runtime command dispatched yet';
  }

  return `${lastCommand.commandType} at ${formatTimestamp(lastCommand.completedAt ?? lastCommand.dispatchedAt)}`;
}

function summarizeRuntimeCrashCount(health) {
  return String(health?.runtime?.crashCount ?? 0);
}

function summarizeLastRuntimeCrash(health) {
  const lastCrash = health?.runtime?.lastCrash ?? null;
  if (!lastCrash?.slotId) {
    return 'No runtime helper crash recorded yet';
  }

  return `${lastCrash.slotId} ${lastCrash.recoveryAction ?? 'reported'} at ${formatTimestamp(lastCrash.crashedAt)}`;
}

function summarizeRuntimeLifecycleRequestCount(health) {
  return String(health?.runtime?.lifecycleRequestCount ?? 0);
}

function summarizeLastRuntimeLifecycleRequest(health) {
  const lastLifecycleRequest = health?.runtime?.lastLifecycleRequest ?? null;
  if (!lastLifecycleRequest?.requestType) {
    return 'No runtime lifecycle request recorded yet';
  }

  return `${lastLifecycleRequest.requestType} at ${formatTimestamp(lastLifecycleRequest.requestedAt)}`;
}

function summarizeRuntimeActivationAcceptance(health) {
  return health?.runtime?.acceptingRouteActivations === false
    ? 'Route activation paused'
    : 'Route activation accepting';
}

function currentRouteActivationRequest() {
  const directConversation = currentDirectConversation();
  if (directConversation) {
    return {
      actorId: selectedActor(),
      workspaceId: selectedWorkspace(),
      surfaceKind: 'direct',
      scopeId: directConversation.id,
      selectedMessageId: state.selectedMessageId ?? undefined,
      surfacePackageId: 'nexus.surface.direct',
      routeCapabilities: [
        'conversation.read',
        'message.compose',
        'route.selection'
      ],
      helperSlotRequests: [
        {
          slotId: 'participant-card',
          preferredHelperPackageId: 'symbiosis.helper.review'
        }
      ]
    };
  }

  const thread = currentThread();
  if (thread) {
    return {
      actorId: selectedActor(),
      workspaceId: selectedWorkspace(),
      surfaceKind: 'thread',
      scopeId: thread.id,
      selectedMessageId: state.selectedMessageId ?? undefined,
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
    };
  }

  const channel = currentChannel();
  if (!channel) {
    return null;
  }

  if (channel.kind === 'forum') {
    return {
      actorId: selectedActor(),
      workspaceId: selectedWorkspace(),
      surfaceKind: 'forum',
      scopeId: channel.id,
      selectedMessageId: state.selectedMessageId ?? undefined,
      surfacePackageId: 'nexus.surface.forum',
      routeCapabilities: [
        'conversation.read',
        'message.compose',
        'route.selection'
      ],
      helperSlotRequests: [
        {
          slotId: 'forum-insights',
          preferredHelperPackageId: 'symbiosis.helper.review'
        }
      ]
    };
  }

  return {
    actorId: selectedActor(),
    workspaceId: selectedWorkspace(),
    surfaceKind: 'channel',
    scopeId: channel.id,
    selectedMessageId: state.selectedMessageId ?? undefined,
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
  };
}

function summarizeRouteActivationHelpers(activation) {
  if (!Array.isArray(activation?.helperSlots) || activation.helperSlots.length === 0) {
    return 'No helper slots requested';
  }

  return activation.helperSlots.map((slot) => {
    const helperLabel = slot.helper?.displayName ?? slot.helper?.packageId ?? 'No helper bound';
    return `${slot.slotId}: ${slot.status}${slot.status === 'bound' ? ` (${helperLabel})` : ''}`;
  }).join(' | ');
}

function summarizeRouteActivationDiagnostics(activation) {
  if (!Array.isArray(activation?.diagnostics) || activation.diagnostics.length === 0) {
    return 'No activation diagnostics';
  }

  return activation.diagnostics.map((entry) => entry.code ?? entry.message ?? 'diagnostic').join(', ');
}

function summarizeSupervisorTone(supervisor) {
  if (supervisor?.readiness === 'ready') {
    return 'success';
  }
  if (supervisor?.readiness === 'degraded') {
    return 'error';
  }
  return 'watching';
}

function summarizeSupervisorLabel(supervisor) {
  if (!supervisor?.readiness) {
    return 'Supervisor unknown';
  }
  return `Supervisor ${supervisor.readiness}`;
}

function summarizeSupervisorEvent(supervisor) {
  const recentEvent = Array.isArray(supervisor?.recentEvents)
    ? supervisor.recentEvents[supervisor.recentEvents.length - 1]
    : null;

  if (!recentEvent?.type) {
    return 'No supervisor events recorded yet';
  }

  return `${recentEvent.type.replaceAll('-', ' ')} at ${formatTimestamp(recentEvent.at)}`;
}

function summarizeSupervisorFailure(supervisor) {
  if (!supervisor?.lastFailure) {
    return 'No startup failure recorded';
  }

  return `${supervisor.lastFailure.code}: ${supervisor.lastFailure.message}`;
}

function renderProjectPulseArtifact(artifact) {
  const label = escapeHtml(artifact?.label ?? artifact?.path ?? artifact?.href ?? 'Artifact');
  const path = artifact?.path ? `<code class="project-pulse-artifact-path">${escapeHtml(artifact.path)}</code>` : '';
  const note = artifact?.note ? `<div class="project-pulse-artifact-note">${escapeHtml(artifact.note)}</div>` : '';
  const heading = artifact?.href
    ? `<a class="project-pulse-artifact-link" href="${escapeHtml(artifact.href)}" target="_blank" rel="noreferrer">${label}</a>`
    : `<span class="project-pulse-artifact-label">${label}</span>`;

  return `
    <div class="project-pulse-artifact">
      ${heading}
      ${path}
      ${note}
    </div>
  `;
}

function renderProjectPulseArtifacts(artifacts) {
  if (!artifacts?.length) {
    return '';
  }

  return `
    <div class="project-pulse-artifacts">
      <span class="eyebrow">Artifacts</span>
      <div class="project-pulse-artifact-list">
        ${artifacts.map((artifact) => renderProjectPulseArtifact(artifact)).join('')}
      </div>
    </div>
  `;
}

function renderProjectPulse() {
  if (!state.projectPulse?.lanes?.length) {
    projectPulseSummaryEl.className = 'project-pulse-summary-card summary-card empty';
    projectPulseSummaryEl.textContent = state.projectPulse?.error
      ? `Project pulse is unavailable: ${state.projectPulse.error}`
      : 'Current NEXUS execution lanes will appear here after refresh.';
    projectPulseStatsEl.innerHTML = '';
    projectPulseLanesEl.innerHTML = '';
    return;
  }

  const summary = summarizeProjectPulse(state.projectPulse);
  const lanes = summary.lanes;
  const focusLane = summary.focusLane;
  const focusMeta = projectPulseStatusMeta(focusLane?.status);
  const focusLabel = focusLane
    ? `${focusLane.kind} ${focusLane.ref} - ${focusLane.title}`
    : summary.title;

  projectPulseSummaryEl.className = 'project-pulse-summary-card summary-card';
  projectPulseSummaryEl.innerHTML = `
    <div class="project-pulse-summary-top">
      <span class="pill pulse-pill pulse-pill-${focusMeta.tone}">${escapeHtml(focusMeta.label)}</span>
      <span class="project-pulse-stamp">${escapeHtml(summary.capturedAtLabel)}</span>
    </div>
    <strong class="project-pulse-focus">${escapeHtml(focusLabel)}</strong>
    <p class="project-pulse-copy">${escapeHtml(summary.summary || focusLane?.summary || 'No project pulse summary is recorded yet.')}</p>
    <div class="project-pulse-next">
      <span class="eyebrow">Next</span>
      <p>${escapeHtml(summary.nextAction || 'No next action is recorded yet.')}</p>
    </div>
    ${renderProjectPulseArtifacts(summary.focusArtifacts)}
    <div class="project-pulse-source">${escapeHtml(summary.source || 'Local project pulse snapshot')}</div>
  `;

  const stats = [
    { label: 'Done', value: summary.counts.done, tone: 'done' },
    { label: 'Execute now', value: summary.counts.executeNow, tone: 'execute-now' },
    { label: 'In progress', value: summary.counts.inProgress, tone: 'in-progress' },
    { label: 'Queued', value: summary.counts.queued, tone: 'queued' },
    { label: 'Parked', value: summary.counts.parked, tone: 'parked' }
  ];

  projectPulseStatsEl.innerHTML = stats.map((stat) => `
    <div class="project-pulse-stat project-pulse-stat-${stat.tone}">
      <span class="project-pulse-stat-value">${escapeHtml(stat.value)}</span>
      <span class="project-pulse-stat-label">${escapeHtml(stat.label)}</span>
    </div>
  `).join('');

  projectPulseLanesEl.innerHTML = lanes.map((lane) => {
    const meta = projectPulseStatusMeta(lane.status);
    const isFocus = lane === focusLane;
    return `
      <article class="project-pulse-lane${isFocus ? ' focus' : ''}">
        <div class="project-pulse-lane-top">
          <div class="project-pulse-lane-heading">
            <span class="pill pulse-pill pulse-pill-${meta.tone}">${escapeHtml(meta.label)}</span>
            <span class="project-pulse-lane-ref">${escapeHtml(`${lane.kind} ${lane.ref}`)}</span>
          </div>
          ${isFocus ? '<span class="project-pulse-current">Current focus</span>' : ''}
        </div>
        <strong>${escapeHtml(lane.title)}</strong>
        <p class="project-pulse-lane-copy">${escapeHtml(lane.summary ?? '')}</p>
        <div class="project-pulse-lane-next">${escapeHtml(lane.nextAction ?? '')}</div>
        ${renderProjectPulseArtifacts(lane.artifacts)}
      </article>
    `;
  }).join('');
}

function renderHealth() {
  if (!state.health) {
    serviceHealthSummaryEl.className = 'service-health-summary summary-card empty';
    serviceHealthSummaryEl.textContent = 'Runtime health will appear here after refresh.';
    healthEl.textContent = '{}';
    return;
  }

  const readinessTone = state.health.status === 'ok' ? 'success' : 'error';
  const readinessLabel = state.health.status === 'ok' ? 'Ready' : 'Needs attention';
  const runtime = state.health.runtime ?? {};
  const supervisor = runtime.supervisor ?? null;
  const supervisorTone = summarizeSupervisorTone(supervisor);
  serviceHealthSummaryEl.className = 'service-health-summary summary-card';
  serviceHealthSummaryEl.innerHTML = `
    <div class="service-health-top">
      <span class="pill pulse-pill pulse-pill-${readinessTone}">${escapeHtml(readinessLabel)}</span>
      <span class="pill pulse-pill pulse-pill-${supervisorTone}">${escapeHtml(summarizeSupervisorLabel(supervisor))}</span>
      <span class="project-pulse-stamp">${escapeHtml(state.health.contractVersion ?? 'Contract version unavailable')}</span>
    </div>
    <p class="service-health-copy">Current desktop baseline is running in <strong>${escapeHtml(state.health.mode ?? 'unknown mode')}</strong> with <strong>${escapeHtml(summarizeServiceStorage(state.health))}</strong> storage, the runtime seam is currently <strong>${escapeHtml(runtime.readiness ?? 'unknown')}</strong>, and the supervisor owns <strong>${escapeHtml(summarizeActiveRouteActivations(state.health))}</strong>.</p>
    <div class="service-health-grid">
      <div class="service-health-metric">
        <span class="eyebrow">Deployment</span>
        <strong>${escapeHtml(state.health.deploymentMode ?? 'unknown')}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Static</span>
        <strong>${escapeHtml(state.health.staticMode ?? 'unknown')}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Origin</span>
        <strong>${escapeHtml(summarizeServiceOrigin(state.health))}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Runtime</span>
        <strong>${escapeHtml(runtime.lifecycleState ?? 'unknown')}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Startup attempts</span>
        <strong>${escapeHtml(String(supervisor?.startupAttemptCount ?? 0))}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Active routes</span>
        <strong>${escapeHtml(summarizeActiveRouteActivations(state.health))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Last activation</span>
        <strong>${escapeHtml(summarizeLastRuntimeActivation(state.health))}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Commands</span>
        <strong>${escapeHtml(summarizeRuntimeCommandCount(state.health))}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Lifecycle requests</span>
        <strong>${escapeHtml(summarizeRuntimeLifecycleRequestCount(state.health))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Last command</span>
        <strong>${escapeHtml(summarizeLastRuntimeCommand(state.health))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Last lifecycle</span>
        <strong>${escapeHtml(summarizeLastRuntimeLifecycleRequest(state.health))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Activation gate</span>
        <strong>${escapeHtml(summarizeRuntimeActivationAcceptance(state.health))}</strong>
      </div>
      <div class="service-health-metric">
        <span class="eyebrow">Crashes</span>
        <strong>${escapeHtml(summarizeRuntimeCrashCount(state.health))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Last crash</span>
        <strong>${escapeHtml(summarizeLastRuntimeCrash(state.health))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Supervisor event</span>
        <strong>${escapeHtml(summarizeSupervisorEvent(supervisor))}</strong>
      </div>
      <div class="service-health-metric service-health-metric-wide">
        <span class="eyebrow">Failure state</span>
        <strong>${escapeHtml(summarizeSupervisorFailure(supervisor))}</strong>
      </div>
    </div>
  `;
  healthEl.textContent = JSON.stringify(state.health ?? {}, null, 2);
}

function renderRecentActivity() {
  recentActivityEl.innerHTML = '';
  const recent = state.recentActivity.filter((entry) => entry.recentAt).slice(0, 8);

  if (recent.length === 0) {
    recentActivityEl.innerHTML = '<div class="empty-state">No recent readable activity yet.</div>';
    return;
  }

  for (const entry of recent) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-card';
    button.innerHTML = `
      <div class="recent-card-top">
        <strong>${escapeHtml(activityLabel(entry))}</strong>
        <span class="pill">${escapeHtml(entry.kind)}</span>
      </div>
      <div class="scope-activity-preview">${escapeHtml(summarizeActivityPreview(entry))}</div>
      <div class="scope-activity-meta">${escapeHtml(summarizeActivityMeta(entry))}</div>
    `;
    button.addEventListener('click', () => {
      navigateToActivitySummary(entry).catch((error) => {
        setStatus(error.message, 'error');
      });
    });
    recentActivityEl.appendChild(button);
  }
}

function renderScopeShell() {
  const showForum = Boolean(currentChannel()?.kind === 'forum');
  const showThreads = Boolean(!currentDirectConversation() && currentThreadParent());

  forumColumnEl.classList.toggle('hidden', !showForum);
  threadColumnEl.classList.toggle('hidden', !showThreads);
  scopeShellEl.classList.toggle('with-forum', showForum);
  scopeShellEl.classList.toggle('with-threads', showThreads);
}

function renderChannels() {
  channelsEl.innerHTML = '';
  const channels = [...state.channels].sort((left, right) => {
    return compareActivitySummaries(activityForChannel(left.id) ?? { label: left.name }, activityForChannel(right.id) ?? { label: right.name });
  });

  for (const channel of channels) {
    const activity = activityForChannel(channel.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `channel-item${state.selectedChannelId === channel.id && !state.selectedDirectConversationId ? ' active' : ''}`;
    button.innerHTML = `
      <div class="channel-item-top">
        <strong>${escapeHtml(channel.name)}</strong>
        <span class="pill">${escapeHtml(channel.kind)}</span>
      </div>
      <div class="channel-item-copy">${escapeHtml(channel.description ?? '')}</div>
      <div class="scope-activity-preview">${escapeHtml(summarizeActivityPreview(activity))}</div>
      <div class="scope-activity-meta">${escapeHtml(summarizeActivityMeta(activity))}</div>
    `;
    button.addEventListener('click', async () => {
      state.selectedDirectConversationId = null;
      state.selectedChannelId = channel.id;
      state.selectedPostId = null;
      state.selectedThreadId = null;
      await syncSelection();
    });
    channelsEl.appendChild(button);
  }
}

function renderDirectComposerOptions() {
  const previousSelection = new Set(Array.from(directMembersEl.selectedOptions).map((option) => option.value));
  directMembersEl.innerHTML = '';

  for (const identity of state.identities) {
    if (identity.id === selectedActor()) {
      continue;
    }

    const option = document.createElement('option');
    option.value = identity.id;
    option.textContent = `${identity.displayName} (${identity.kind})`;
    option.selected = previousSelection.has(identity.id);
    directMembersEl.appendChild(option);
  }
}

function renderDirectConversations() {
  directConversationsEl.innerHTML = '';
  const conversations = [...state.directConversations].sort((left, right) => {
    return compareActivitySummaries(
      activityForDirectConversation(left.id) ?? { label: directConversationLabel(left) },
      activityForDirectConversation(right.id) ?? { label: directConversationLabel(right) }
    );
  });

  for (const conversation of conversations) {
    const activity = activityForDirectConversation(conversation.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `direct-card${state.selectedDirectConversationId === conversation.id ? ' active' : ''}`;
    button.innerHTML = `
      <div class="direct-card-top">
        <strong>${escapeHtml(directConversationLabel(conversation))}</strong>
        <span class="pill">direct</span>
      </div>
      <div class="direct-card-copy">${escapeHtml(directConversationMembers(conversation))}</div>
      <div class="scope-activity-preview">${escapeHtml(summarizeActivityPreview(activity))}</div>
      <div class="direct-card-meta">${escapeHtml(summarizeActivityMeta(activity) || formatTimestamp(conversation.createdAt))}</div>
    `;
    button.addEventListener('click', async () => {
      state.selectedDirectConversationId = conversation.id;
      state.selectedChannelId = null;
      state.selectedPostId = null;
      state.selectedThreadId = null;
      await syncSelection();
    });
    directConversationsEl.appendChild(button);
  }

  if (state.directConversations.length === 0) {
    directConversationsEl.innerHTML = '<div class="empty-state">No direct conversations are visible for this actor yet.</div>';
  }
}

function renderPosts() {
  const channel = currentChannel();
  if (!channel || channel.kind !== 'forum') {
    postListEl.innerHTML = '';
    return;
  }

  postListEl.innerHTML = '';
  const posts = [...currentPosts()].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  for (const post of posts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `post-card${state.selectedPostId === post.id ? ' active' : ''}`;
    button.innerHTML = `
      <div class="post-card-title">${escapeHtml(post.title)}</div>
      <div class="post-card-meta">${escapeHtml(actorName(post.createdByIdentityId))} | ${escapeHtml(formatTimestamp(post.createdAt))}</div>
    `;
    button.addEventListener('click', async () => {
      state.selectedPostId = post.id;
      state.selectedThreadId = null;
      await syncSelection();
    });
    postListEl.appendChild(button);
  }

  if (posts.length === 0) {
    postListEl.innerHTML = '<div class="empty-state">No posts yet. Create the first one for this lane.</div>';
  }
}

function renderThreads() {
  const parent = currentThreadParent();
  if (!parent) {
    threadListEl.innerHTML = '';
    threadParentCopyEl.textContent = 'Threads for the current parent scope will appear here.';
    return;
  }

  threadParentCopyEl.textContent = parent.scopeType === 'post'
    ? `Threads for post: ${parent.label}`
    : `Threads for channel: ${parent.label}`;

  const threads = [...currentThreads()].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  threadListEl.innerHTML = '';
  for (const thread of threads) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `thread-card${state.selectedThreadId === thread.id ? ' active' : ''}`;
    button.innerHTML = `
      <div class="thread-card-title">${escapeHtml(thread.title)}</div>
      <div class="thread-card-meta">${escapeHtml(actorName(thread.createdByIdentityId))} | ${escapeHtml(formatTimestamp(thread.createdAt))}</div>
    `;
    button.addEventListener('click', async () => {
      state.selectedThreadId = thread.id;
      await syncSelection();
    });
    threadListEl.appendChild(button);
  }

  if (threads.length === 0) {
    threadListEl.innerHTML = '<div class="empty-state">No threads yet. Create one when the parent scope needs a narrower track.</div>';
  }
}

function renderMessages() {
  messagesEl.innerHTML = '';
  if (!state.selectedScope) {
    messagesEl.innerHTML = '<div class="empty-state">Choose a channel or direct conversation to load messages.</div>';
    return;
  }

  if (state.messages.length === 0) {
    messagesEl.innerHTML = '<div class="empty-state">No messages in this scope yet.</div>';
    return;
  }

  for (const message of state.messages) {
    const article = document.createElement('article');
    article.className = `message-card${state.selectedMessageId === message.id ? ' active' : ''}`;
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-pressed', state.selectedMessageId === message.id ? 'true' : 'false');
    article.setAttribute('aria-label', `Select message from ${actorName(message.authorIdentityId)} at ${formatTimestamp(message.createdAt)}`);
    const sourceSystem = message.source?.system ?? 'nexus';
    const sourcedFromDiscord = sourceSystem === 'discord';
    article.innerHTML = `
      <div class="message-card-top">
        <div>
          <div class="message-author">${escapeHtml(actorName(message.authorIdentityId))}</div>
          <div class="message-meta">${escapeHtml(formatTimestamp(message.createdAt))} | ${escapeHtml(state.selectedScope.scopeType)}</div>
        </div>
        <span class="pill${sourcedFromDiscord ? ' discord' : ''}">${escapeHtml(sourceSystem)}</span>
      </div>
      <div class="message-body">${message.body ? escapeHtml(message.body) : '<span class="muted">Empty message body.</span>'}</div>
      ${renderMessageCoordinationBadges(message.id)}
      ${renderAttachmentMarkup(message.attachments)}
    `;
    const selectMessage = async () => {
      state.selectedMessageId = message.id;
      await loadExternalReferences();
      renderAll();
    };
    article.addEventListener('click', () => {
      selectMessage().catch((error) => {
        setStatus(error.message, 'error');
      });
    });
    article.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      selectMessage().catch((error) => {
        setStatus(error.message, 'error');
      });
    });
    messagesEl.appendChild(article);
  }
}

function renderExternalReferences() {
  const message = currentMessage();
  const linkedQuery = currentLinkedContextQuery();
  const searchQuery = currentLinkedContextSearchQuery();
  const visibleLinkedContextResults = filteredLinkedContextResults();
  const activeFilter = currentLinkedContextOwnerTypeFilter();
  scopeReferenceCopyEl.textContent = state.selectedScope
    ? `${currentScopeLabel()} | ${state.scopeExternalReferences.length} reference${state.scopeExternalReferences.length === 1 ? '' : 's'}`
    : 'Select a scope to load its references.';
  messageReferenceCopyEl.textContent = message
    ? `${actorName(message.authorIdentityId)} | ${state.messageExternalReferences.length} reference${state.messageExternalReferences.length === 1 ? '' : 's'}`
    : 'Select a message to inspect message-level references.';
  linkedContextCopyEl.textContent = linkedQuery
    ? summarizeLinkedContextLookup(linkedQuery, visibleLinkedContextResults, searchQuery, activeFilter)
    : 'Run a read-only reverse lookup to find readable NEXUS context linked to an external item.';

  renderReferenceCards(
    scopeReferencesEl,
    state.scopeExternalReferences,
    'No external references are attached to the current scope yet.',
    {
      onLookup(reference) {
        setLinkedContextQuery({
          system: reference.system,
          externalId: reference.externalId,
          title: reference.title
        });
        reloadLinkedContextLookup().then(() => {
          renderAll();
          setStatus(`Loaded linked NEXUS context for ${reference.system}:${reference.externalId}.`, 'success');
        }).catch((error) => {
          setStatus(error.message, 'error');
        });
      }
    }
  );
  renderReferenceCards(
    messageReferencesEl,
    state.messageExternalReferences,
    'No external references are attached to the selected message yet.',
    {
      onLookup(reference) {
        setLinkedContextQuery({
          system: reference.system,
          externalId: reference.externalId,
          title: reference.title
        });
        reloadLinkedContextLookup().then(() => {
          renderAll();
          setStatus(`Loaded linked NEXUS context for ${reference.system}:${reference.externalId}.`, 'success');
        }).catch((error) => {
          setStatus(error.message, 'error');
        });
      }
    }
  );
  renderLinkedContextFilterControls(visibleLinkedContextResults);
  renderLinkedContextCards(
    linkedContextResultsEl,
    visibleLinkedContextResults,
    summarizeLinkedContextEmptyState(linkedQuery, visibleLinkedContextResults, searchQuery, activeFilter)
  );
  renderReferenceOwnerOptions();
  updateLinkedContextComposerState();
}

function renderCoordinationRecords() {
  const message = currentMessage();
  const focusMode = currentCoordinationFocusMode();
  const focusedRelays = filteredCoordinationRecords(state.relays);
  const focusedHandoffs = filteredCoordinationRecords(state.handoffs);

  coordinationFocusScopeEl.classList.toggle('active', focusMode === 'scope');
  coordinationFocusMessageEl.classList.toggle('active', focusMode === 'message');
  coordinationFocusMessageEl.disabled = !message;

  if (!state.selectedScope) {
    coordinationFocusCopyEl.textContent = 'Select a scope to inspect relay and handoff records.';
    relayCopyEl.textContent = 'Select a scope to inspect relay records.';
    handoffCopyEl.textContent = 'Select a scope to inspect handoff records.';
    renderRecordCards(relayListEl, state.relays, 'relay', 'No relays touch the current scope yet.');
    renderRecordCards(handoffListEl, state.handoffs, 'handoff', 'No handoffs touch the current scope yet.');
    renderCoordinationComposerOptions();
    return;
  }

  if (message) {
    coordinationFocusCopyEl.textContent = focusMode === 'message'
      ? `Focused on the selected message from ${actorName(message.authorIdentityId)}. New relays and handoffs will attach to this message.`
      : `Showing all coordination in ${currentScopeLabel()}. Switch to Selected message to focus on the active message. New relays and handoffs will still attach to it.`;
  }
  else {
    coordinationFocusCopyEl.textContent = `Showing all coordination in ${currentScopeLabel()}. Select a message to unlock selected-message focus.`;
  }

  if (focusMode === 'message' && message) {
    relayCopyEl.textContent = `${actorName(message.authorIdentityId)} | ${focusedRelays.length} relay${focusedRelays.length === 1 ? '' : 's'} for selected message`;
    handoffCopyEl.textContent = `${actorName(message.authorIdentityId)} | ${focusedHandoffs.length} handoff${focusedHandoffs.length === 1 ? '' : 's'} for selected message`;
    renderRecordCards(
      relayListEl,
      focusedRelays,
      'relay',
      'No relays touch the selected message yet. Switch back to Scope to review all coordination in this lane.'
    );
    renderRecordCards(
      handoffListEl,
      focusedHandoffs,
      'handoff',
      'No handoffs touch the selected message yet. Switch back to Scope to review all coordination in this lane.'
    );
  }
  else {
    relayCopyEl.textContent = `${currentScopeLabel()} | ${state.relays.length} relay${state.relays.length === 1 ? '' : 's'} in scope`;
    handoffCopyEl.textContent = `${currentScopeLabel()} | ${state.handoffs.length} handoff${state.handoffs.length === 1 ? '' : 's'} in scope`;
    renderRecordCards(relayListEl, state.relays, 'relay', 'No relays touch the current scope yet.');
    renderRecordCards(handoffListEl, state.handoffs, 'handoff', 'No handoffs touch the current scope yet.');
  }

  renderCoordinationComposerOptions();
}

function renderScopeSummary() {
  const directConversation = currentDirectConversation();
  const channel = currentChannel();
  const post = currentPost();
  const thread = currentThread();

  if (!directConversation && !channel) {
    scopeSummaryEl.className = 'summary-card empty';
    scopeSummaryEl.textContent = 'Choose a channel or direct conversation to inspect its scope, topic, and imported state.';
    return;
  }

  const summaryLines = [];

  if (directConversation) {
    summaryLines.push(`<strong>Conversation</strong><span>${escapeHtml(directConversationLabel(directConversation))}</span>`);
    summaryLines.push(`<strong>Members</strong><span>${escapeHtml(directConversationMembers(directConversation))}</span>`);
    summaryLines.push(`<strong>Scope</strong><span>${escapeHtml(state.selectedScope ? `${state.selectedScope.scopeType}:${state.selectedScope.scopeId}` : 'none')}</span>`);
    summaryLines.push(`<strong>Visible Messages</strong><span>${escapeHtml(state.messages.length)}</span>`);
    summaryLines.push(`<strong>Scope References</strong><span>${escapeHtml(state.scopeExternalReferences.length)}</span>`);
    summaryLines.push(`<strong>Scope Relays</strong><span>${escapeHtml(state.relays.length)}</span>`);
    summaryLines.push(`<strong>Scope Handoffs</strong><span>${escapeHtml(state.handoffs.length)}</span>`);
  }
  else {
    summaryLines.push(`<strong>Channel</strong><span>${escapeHtml(channel.name)}</span>`);
    summaryLines.push(`<strong>Kind</strong><span>${escapeHtml(channel.kind)}</span>`);
    summaryLines.push(`<strong>Scope</strong><span>${escapeHtml(state.selectedScope ? `${state.selectedScope.scopeType}:${state.selectedScope.scopeId}` : 'none')}</span>`);
    summaryLines.push(`<strong>Visible Posts</strong><span>${escapeHtml(channel.kind === 'forum' ? currentPosts().length : 0)}</span>`);
    summaryLines.push(`<strong>Visible Threads</strong><span>${escapeHtml(currentThreads().length)}</span>`);
    summaryLines.push(`<strong>Visible Messages</strong><span>${escapeHtml(state.messages.length)}</span>`);
    summaryLines.push(`<strong>Scope References</strong><span>${escapeHtml(state.scopeExternalReferences.length)}</span>`);
    summaryLines.push(`<strong>Scope Relays</strong><span>${escapeHtml(state.relays.length)}</span>`);
    summaryLines.push(`<strong>Scope Handoffs</strong><span>${escapeHtml(state.handoffs.length)}</span>`);

    if (post?.source?.system === 'discord') {
      summaryLines.push(`<strong>Imported From</strong><span>${escapeHtml(`Discord forum thread ${post.source.externalChannelId}`)}</span>`);
    }

    if (thread) {
      summaryLines.push(`<strong>Thread</strong><span>${escapeHtml(thread.title)}</span>`);
    }
  }

  if (currentMessage()) {
    const coordination = coordinationCountsForMessage(currentMessage().id);
    summaryLines.push(`<strong>Selected Message</strong><span>${escapeHtml(actorName(currentMessage().authorIdentityId))}</span>`);
    summaryLines.push(`<strong>Message References</strong><span>${escapeHtml(state.messageExternalReferences.length)}</span>`);
    summaryLines.push(`<strong>Message Relays</strong><span>${escapeHtml(coordination.relayCount)}</span>`);
    summaryLines.push(`<strong>Message Handoffs</strong><span>${escapeHtml(coordination.handoffCount)}</span>`);
  }

  if (state.routeActivation) {
    summaryLines.push(`<strong>Surface Program</strong><span>${escapeHtml(`${state.routeActivation.surface.displayName} (${state.routeActivation.surface.packageId})`)}</span>`);
    summaryLines.push(`<strong>Helper Slots</strong><span>${escapeHtml(summarizeRouteActivationHelpers(state.routeActivation))}</span>`);
    summaryLines.push(`<strong>Activation Diagnostics</strong><span>${escapeHtml(summarizeRouteActivationDiagnostics(state.routeActivation))}</span>`);
  }
  else if (state.routeActivationError) {
    summaryLines.push(`<strong>Surface Program</strong><span>${escapeHtml(`Activation blocked (${state.routeActivationError.code ?? 'route-activation-error'})`)}</span>`);
    summaryLines.push(`<strong>Activation Diagnostics</strong><span>${escapeHtml(state.routeActivationError.message)}</span>`);
    if (state.routeActivationError.details?.supervisor?.readiness) {
      summaryLines.push(`<strong>Runtime Seam</strong><span>${escapeHtml(`${state.routeActivationError.details.supervisor.readiness} / ${state.routeActivationError.details.supervisor.lifecycleState ?? 'unknown'}`)}</span>`);
    }
  }

  scopeSummaryEl.className = 'summary-card';
  scopeSummaryEl.innerHTML = summaryLines.map((line) => `<div class="summary-row">${line}</div>`).join('');
}

function renderScopeHeader() {
  const directConversation = currentDirectConversation();
  const channel = currentChannel();
  const post = currentPost();
  const thread = currentThread();

  if (directConversation) {
    channelTitleEl.textContent = directConversationLabel(directConversation);
    channelDescriptionEl.textContent = 'Private direct conversation across first-class NEXUS identities.';
    channelTopicEl.className = 'topic-card';
    channelTopicEl.textContent = summarizeTopic(null);
    scopeContextEl.className = 'scope-context';
    scopeContextEl.innerHTML = `
      <div class="eyebrow">Direct conversation</div>
      <strong>${escapeHtml(directConversationLabel(directConversation))}</strong>
      <span>${escapeHtml(directConversationMembers(directConversation))}</span>
    `;
    return;
  }

  if (!channel) {
    channelTitleEl.textContent = 'Select a channel';
    channelDescriptionEl.textContent = 'Choose a visible lane or direct conversation to browse native NEXUS records.';
    channelTopicEl.className = 'topic-card empty';
    channelTopicEl.textContent = 'Channel guidance will appear here.';
    scopeContextEl.className = 'scope-context empty';
    scopeContextEl.textContent = 'No scope selected.';
    return;
  }

  channelTitleEl.textContent = channel.name;
  channelDescriptionEl.textContent = channel.description ?? '';
  channelTopicEl.className = 'topic-card';
  channelTopicEl.textContent = summarizeTopic(channel);

  if (thread) {
    scopeContextEl.className = 'scope-context';
    scopeContextEl.innerHTML = `
      <div class="eyebrow">Thread</div>
      <strong>${escapeHtml(thread.title)}</strong>
      <span>${escapeHtml(actorName(thread.createdByIdentityId))} | ${escapeHtml(formatTimestamp(thread.createdAt))}</span>
    `;
    return;
  }

  if (channel.kind === 'forum' && post) {
    scopeContextEl.className = 'scope-context';
    scopeContextEl.innerHTML = `
      <div class="eyebrow">Post</div>
      <strong>${escapeHtml(post.title)}</strong>
      <span>${escapeHtml(actorName(post.createdByIdentityId))} | ${escapeHtml(formatTimestamp(post.createdAt))}</span>
    `;
    return;
  }

  if (channel.kind === 'forum') {
    scopeContextEl.className = 'scope-context empty';
    scopeContextEl.textContent = 'Select an existing post or create a new one to start the conversation.';
    return;
  }

  scopeContextEl.className = 'scope-context';
  scopeContextEl.innerHTML = `
    <div class="eyebrow">Channel</div>
    <strong>${escapeHtml(channel.name)}</strong>
    <span>${escapeHtml(channel.kind)} lane</span>
  `;
}

routeBreadcrumbsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-breadcrumb-level]');
  if (!button || button.disabled) {
    return;
  }

  event.preventDefault();
  navigateBreadcrumb(button.dataset.breadcrumbLevel).catch((error) => {
    setStatus(error.message, 'error');
  });
});

routeBackEl.addEventListener('click', () => {
  navigateRouteHistory(-1).catch((error) => {
    setStatus(error.message, 'error');
  });
});

routeForwardEl.addEventListener('click', () => {
  navigateRouteHistory(1).catch((error) => {
    setStatus(error.message, 'error');
  });
});

routeHistoryListEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-route-history-index]');
  if (!button || button.disabled) {
    return;
  }

  event.preventDefault();
  navigateRouteHistoryIndex(Number(button.dataset.routeHistoryIndex)).catch((error) => {
    setStatus(error.message, 'error');
  });
});

function updateComposerState() {
  const directConversation = currentDirectConversation();
  const channel = currentChannel();
  const hasWritableScope = Boolean(state.selectedScope);
  const forumWithoutPost = Boolean(channel?.kind === 'forum' && !currentPost() && !currentThread());
  const threadParent = currentThreadParent();

  bodyEl.disabled = !hasWritableScope || forumWithoutPost;
  sendButtonEl.disabled = !hasWritableScope || forumWithoutPost;

  threadTitleEl.disabled = !threadParent;
  threadComposerEl.querySelector('button').disabled = !threadParent;
  referenceOwnerEl.disabled = !currentReferenceOwners().length;
  referenceSystemEl.disabled = !currentReferenceOwners().length;
  referenceRelationEl.disabled = !currentReferenceOwners().length;
  referenceExternalIdEl.disabled = !currentReferenceOwners().length;
  referenceUrlEl.disabled = !currentReferenceOwners().length;
  referenceTitleEl.disabled = !currentReferenceOwners().length;
  referenceSubmitEl.disabled = !currentReferenceOwners().length;

  if (!channel && !directConversation) {
    composerHintEl.textContent = 'Select a channel or direct conversation to compose.';
    return;
  }

  if (channel?.kind === 'forum' && !currentPost() && !currentThread()) {
    composerHintEl.textContent = 'Forum messages belong inside a post or a thread under a post. Select or create one first.';
    return;
  }

  composerHintEl.textContent = `Sending as ${actorName(selectedActor())} into ${currentScopeLabel()}.`;
}

function renderSearchResults(results = []) {
  searchResultsEl.innerHTML = '';
  if (!results.length && searchEl.value.trim()) {
    searchResultsEl.innerHTML = '<div class="empty-state">No visible matches for this query.</div>';
    return;
  }

  for (const match of results) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-card';
    const sourceSystem = match.source?.system ?? 'nexus';
    button.innerHTML = `
      <div class="search-card-top">
        <strong>${escapeHtml(actorName(match.authorIdentityId))}</strong>
        <span class="pill${sourceSystem === 'discord' ? ' discord' : ''}">${escapeHtml(sourceSystem)}</span>
      </div>
      <div class="search-card-body">${escapeHtml(match.body)}</div>
      ${renderAttachmentSearchSummary(match.attachments)}
      <div class="search-card-meta">${escapeHtml(match.scopeType)}:${escapeHtml(match.scopeId)} | ${escapeHtml(formatTimestamp(match.createdAt))}</div>
    `;

    let canNavigate = false;

    if (match.scopeType === 'channel') {
      canNavigate = true;
      button.addEventListener('click', async () => {
        state.selectedDirectConversationId = null;
        state.selectedChannelId = match.scopeId;
        state.selectedPostId = null;
        state.selectedThreadId = null;
        await syncSelection();
      });
    }
    else if (match.scopeType === 'post') {
      const targetChannelId = state.postChannelIndex.get(match.scopeId) ?? match.source?.routedChannelId ?? null;
      if (targetChannelId) {
        canNavigate = true;
        button.addEventListener('click', async () => {
          state.selectedDirectConversationId = null;
          state.selectedChannelId = targetChannelId;
          state.selectedPostId = match.scopeId;
          state.selectedThreadId = null;
          await syncSelection();
        });
      }
    }
    else if (match.scopeType === 'thread') {
      const threadParent = state.threadParentIndex.get(match.scopeId) ?? null;
      if (threadParent) {
        canNavigate = true;
        button.addEventListener('click', async () => {
          state.selectedDirectConversationId = null;
          state.selectedChannelId = threadParent.channelId;
          state.selectedPostId = threadParent.postId ?? null;
          state.selectedThreadId = match.scopeId;
          await syncSelection();
        });
      }
    }
    else if (match.scopeType === 'direct') {
      canNavigate = state.directConversations.some((conversation) => conversation.id === match.scopeId);
      if (canNavigate) {
        button.addEventListener('click', async () => {
          state.selectedDirectConversationId = match.scopeId;
          state.selectedChannelId = null;
          state.selectedPostId = null;
          state.selectedThreadId = null;
          await syncSelection();
        });
      }
    }

    if (!canNavigate) {
      button.disabled = true;
    }

    searchResultsEl.appendChild(button);
  }
}

async function loadHealth() {
  state.health = await getJson('/api/health');
  renderHealth();
}

async function loadProjectPulse() {
  try {
    state.projectPulse = await getJson('/project-progress.json');
  }
  catch (error) {
    state.projectPulse = {
      error: error.message,
      lanes: []
    };
  }
}

async function loadIdentities() {
  state.identities = await getJson('/api/identities');
  state.identityMap = new Map(state.identities.map((identity) => [identity.id, identity]));

  actorSelect.innerHTML = '';
  for (const identity of state.identities) {
    const option = document.createElement('option');
    option.value = identity.id;
    option.textContent = identity.displayName;
    actorSelect.appendChild(option);
  }
  actorSelect.value = actorSelect.querySelector('option[value="identity-jack"]') ? 'identity-jack' : actorSelect.value;
  renderDirectComposerOptions();
}

async function loadWorkspaces() {
  const workspaces = await getJson(`/api/workspaces?actorId=${encodeURIComponent(selectedActor())}`);
  workspaceSelect.innerHTML = '';
  for (const workspace of workspaces) {
    const option = document.createElement('option');
    option.value = workspace.id;
    option.textContent = workspace.name;
    workspaceSelect.appendChild(option);
  }
}

async function loadDirectConversations() {
  state.directConversations = await getJson(`/api/direct-conversations?actorId=${encodeURIComponent(selectedActor())}`);
  if (!state.directConversations.some((conversation) => conversation.id === state.selectedDirectConversationId)) {
    state.selectedDirectConversationId = null;
  }
}

async function loadRecentActivity() {
  if (!selectedWorkspace()) {
    state.recentActivity = [];
    return;
  }

  state.recentActivity = await getJson(
    `/api/activity?actorId=${encodeURIComponent(selectedActor())}&workspaceId=${encodeURIComponent(selectedWorkspace())}`
  );
}

async function hydrateForumIndex() {
  state.postsByChannelId.clear();
  state.postChannelIndex.clear();

  const forumChannels = state.channels.filter((channel) => channel.kind === 'forum');
  const postLists = await Promise.all(forumChannels.map((channel) => {
    return getJson(`/api/posts?actorId=${encodeURIComponent(selectedActor())}&channelId=${encodeURIComponent(channel.id)}`);
  }));

  forumChannels.forEach((channel, index) => {
    const posts = [...postLists[index]].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    state.postsByChannelId.set(channel.id, posts);
    for (const post of posts) {
      state.postChannelIndex.set(post.id, channel.id);
    }
  });
}

async function hydrateThreadIndex() {
  state.threadsByParentKey.clear();
  state.threadParentIndex.clear();

  const threadedChannels = state.channels.filter((channel) => channel.kind !== 'forum');
  const channelThreadLists = await Promise.all(threadedChannels.map((channel) => {
    return getJson(`/api/threads?actorId=${encodeURIComponent(selectedActor())}&channelId=${encodeURIComponent(channel.id)}`);
  }));

  threadedChannels.forEach((channel, index) => {
    const threads = [...channelThreadLists[index]].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    state.threadsByParentKey.set(threadParentKey('channel', channel.id), threads);
    for (const thread of threads) {
      state.threadParentIndex.set(thread.id, {
        channelId: channel.id,
        postId: null,
        parentScopeType: 'channel',
        parentScopeId: channel.id
      });
    }
  });

  const posts = Array.from(state.postsByChannelId.values()).flat();
  const postThreadLists = await Promise.all(posts.map((post) => {
    return getJson(`/api/threads?actorId=${encodeURIComponent(selectedActor())}&postId=${encodeURIComponent(post.id)}`);
  }));

  posts.forEach((post, index) => {
    const threads = [...postThreadLists[index]].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    state.threadsByParentKey.set(threadParentKey('post', post.id), threads);
    for (const thread of threads) {
      state.threadParentIndex.set(thread.id, {
        channelId: post.channelId,
        postId: post.id,
        parentScopeType: 'post',
        parentScopeId: post.id
      });
    }
  });
}

async function loadChannels() {
  state.channels = await getJson(`/api/channels?actorId=${encodeURIComponent(selectedActor())}&workspaceId=${encodeURIComponent(selectedWorkspace())}`);
  await hydrateForumIndex();
  await hydrateThreadIndex();

  if (!state.selectedDirectConversationId && !state.channels.some((channel) => channel.id === state.selectedChannelId)) {
    state.selectedChannelId = state.channels[0]?.id ?? null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
  }
}

async function loadMessagesForScope(scopeType, scopeId) {
  state.messages = await getJson(`/api/messages?actorId=${encodeURIComponent(selectedActor())}&scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`);
}

async function loadRouteActivation() {
  const request = currentRouteActivationRequest();
  if (!request) {
    state.routeActivation = null;
    state.routeActivationError = null;
    return;
  }

  try {
    state.routeActivation = await postJson('/api/runtime/route-activations', request);
    state.routeActivationError = null;
  }
  catch (error) {
    state.routeActivation = null;
    state.routeActivationError = {
      message: error.message,
      code: error.code,
      details: error.details
    };
  }
}

async function loadExternalReferences() {
  if (state.selectedScope) {
    state.scopeExternalReferences = await getJson(
      `/api/external-references?actorId=${encodeURIComponent(selectedActor())}&ownerType=${encodeURIComponent(state.selectedScope.scopeType)}&ownerId=${encodeURIComponent(state.selectedScope.scopeId)}`
    );
  }
  else {
    state.scopeExternalReferences = [];
  }

  const message = currentMessage();
  if (message) {
    state.messageExternalReferences = await getJson(
      `/api/external-references?actorId=${encodeURIComponent(selectedActor())}&ownerType=message&ownerId=${encodeURIComponent(message.id)}`
    );
  }
  else {
    state.messageExternalReferences = [];
  }
}

async function reloadLinkedContextLookup() {
  const query = currentLinkedContextQuery();
  if (!query) {
    state.linkedContextResults = [];
    state.linkedContextOwnerTypeFilter = 'all';
    return;
  }

  state.linkedContextResults = await getJson(
    `/api/external-reference-links?actorId=${encodeURIComponent(selectedActor())}&system=${encodeURIComponent(query.system)}&externalId=${encodeURIComponent(query.externalId)}`
  );
  state.linkedContextOwnerTypeFilter = normalizeLinkedContextOwnerTypeFilter(state.linkedContextOwnerTypeFilter, state.linkedContextResults);
}

async function loadCoordinationRecords() {
  if (!state.selectedScope) {
    state.relays = [];
    state.handoffs = [];
    return;
  }

  state.relays = await getJson(
    `/api/relays?actorId=${encodeURIComponent(selectedActor())}&scopeType=${encodeURIComponent(state.selectedScope.scopeType)}&scopeId=${encodeURIComponent(state.selectedScope.scopeId)}`
  );
  state.handoffs = await getJson(
    `/api/handoffs?actorId=${encodeURIComponent(selectedActor())}&scopeType=${encodeURIComponent(state.selectedScope.scopeType)}&scopeId=${encodeURIComponent(state.selectedScope.scopeId)}`
  );
}

function renderAll() {
  renderProjectPulse();
  renderHealth();
  renderScopeShell();
  renderRecentActivity();
  renderChannels();
  renderDirectConversations();
  renderPosts();
  renderThreads();
  renderMessages();
  renderExternalReferences();
  renderCoordinationRecords();
  renderBreadcrumbs();
  renderRouteHistory();
  renderScopeHeader();
  renderScopeSummary();
  renderLinkActions();
  updateComposerState();
  syncSelectionRoute();
}

async function applySelectionRoute(route, options = {}) {
  const announceFailures = options.announceFailures ?? false;
  const previousRouteSyncState = routeSyncSuspended;
  routeSyncSuspended = true;

  try {
    const validActorIds = new Set(state.identities.map((identity) => identity.id));
    if (route.actorId && validActorIds.has(route.actorId) && selectedActor() !== route.actorId) {
      actorSelect.value = route.actorId;
      state.selectedChannelId = null;
      state.selectedDirectConversationId = null;
      state.selectedPostId = null;
      state.selectedThreadId = null;
      state.selectedMessageId = null;
      await loadWorkspaces();
    }

    const validWorkspaceIds = new Set(Array.from(workspaceSelect.options).map((option) => option.value));
    if (route.workspaceId && validWorkspaceIds.has(route.workspaceId)) {
      workspaceSelect.value = route.workspaceId;
    }

    await refreshAll();

    if (route.directConversationId) {
      const conversation = state.directConversations.find((entry) => entry.id === route.directConversationId);
      if (conversation) {
        state.selectedDirectConversationId = conversation.id;
        state.selectedChannelId = null;
        state.selectedPostId = null;
        state.selectedThreadId = null;
      }
    }
    else {
      let routeChannelId = route.channelId;
      let routePostId = route.postId;
      let routeThreadId = route.threadId;

      if (!routeChannelId && routePostId) {
        routeChannelId = state.postChannelIndex.get(routePostId) ?? null;
      }

      if (!routeChannelId && routeThreadId) {
        const parent = state.threadParentIndex.get(routeThreadId) ?? null;
        routeChannelId = parent?.channelId ?? null;
        if (!routePostId) {
          routePostId = parent?.postId ?? null;
        }
      }

      if (routeChannelId && state.channels.some((channel) => channel.id === routeChannelId)) {
        state.selectedDirectConversationId = null;
        state.selectedChannelId = routeChannelId;

        if (routePostId && state.postChannelIndex.get(routePostId) === routeChannelId) {
          state.selectedPostId = routePostId;
        }
        else {
          state.selectedPostId = null;
        }

        const threadParent = routeThreadId ? state.threadParentIndex.get(routeThreadId) ?? null : null;
        if (
          routeThreadId &&
          threadParent &&
          threadParent.channelId === routeChannelId &&
          ((threadParent.postId ?? null) === (state.selectedPostId ?? null))
        ) {
          state.selectedThreadId = routeThreadId;
        }
        else {
          state.selectedThreadId = null;
        }
      }
    }

    await syncSelection();

    if (route.messageId) {
      if (state.messages.some((message) => message.id === route.messageId)) {
        state.selectedMessageId = route.messageId;
        await loadExternalReferences();
        renderAll();
      }
      else {
        try {
          await navigateToMessage(route.messageId);
        }
        catch (error) {
          if (announceFailures) {
            setStatus('The deep-linked message is unavailable for the current actor.', 'info');
          }
        }
      }
    }

    state.coordinationFocusMode = route.coordinationFocusMode === 'message' && state.selectedMessageId
      ? 'message'
      : 'scope';
    renderAll();
  }
  finally {
    routeSyncSuspended = previousRouteSyncState;
  }

  syncSelectionRoute();
}

async function syncSelection() {
  const directConversation = currentDirectConversation();
  if (directConversation) {
    state.selectedChannelId = null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
    state.selectedScope = {
      scopeType: 'direct',
      scopeId: directConversation.id
    };
    await loadMessagesForScope('direct', directConversation.id);
    if (!state.messages.some((message) => message.id === state.selectedMessageId)) {
      state.selectedMessageId = null;
    }
    await loadRouteActivation();
    await loadExternalReferences();
    await loadCoordinationRecords();
    await loadRecentActivity();
    renderAll();
    return;
  }

  const channel = currentChannel();
  if (!channel) {
    state.selectedScope = null;
    state.messages = [];
    state.selectedMessageId = null;
    await loadRouteActivation();
    await loadExternalReferences();
    await loadCoordinationRecords();
    await loadRecentActivity();
    renderAll();
    return;
  }

  if (channel.kind === 'forum') {
    const posts = currentPosts();
    if (posts.length === 0) {
      state.selectedPostId = null;
      state.selectedThreadId = null;
      state.selectedScope = null;
      state.messages = [];
      state.selectedMessageId = null;
      await loadRouteActivation();
    }
    else {
      if (!posts.some((post) => post.id === state.selectedPostId)) {
        state.selectedPostId = posts[0].id;
      }

      const threads = currentThreads();
      if (!threads.some((thread) => thread.id === state.selectedThreadId)) {
        state.selectedThreadId = null;
      }

      if (state.selectedThreadId) {
        state.selectedScope = {
          scopeType: 'thread',
          scopeId: state.selectedThreadId
        };
        await loadMessagesForScope('thread', state.selectedThreadId);
      }
      else {
        state.selectedScope = {
          scopeType: 'post',
          scopeId: state.selectedPostId
        };
        await loadMessagesForScope('post', state.selectedPostId);
      }
      if (!state.messages.some((message) => message.id === state.selectedMessageId)) {
        state.selectedMessageId = null;
      }
      await loadRouteActivation();
    }
  }
  else {
    const threads = currentThreads();
    if (!threads.some((thread) => thread.id === state.selectedThreadId)) {
      state.selectedThreadId = null;
    }

    if (state.selectedThreadId) {
      state.selectedScope = {
        scopeType: 'thread',
        scopeId: state.selectedThreadId
      };
      await loadMessagesForScope('thread', state.selectedThreadId);
    }
    else {
      state.selectedScope = {
        scopeType: 'channel',
        scopeId: channel.id
      };
      await loadMessagesForScope('channel', channel.id);
    }
    if (!state.messages.some((message) => message.id === state.selectedMessageId)) {
      state.selectedMessageId = null;
    }
    await loadRouteActivation();
  }

  if (!state.messages.some((message) => message.id === state.selectedMessageId)) {
    state.selectedMessageId = null;
  }
  await loadExternalReferences();
  await loadCoordinationRecords();
  await loadRecentActivity();
  renderAll();
}

async function runSearch() {
  const query = searchEl.value.trim();
  if (!query) {
    renderSearchResults([]);
    return;
  }

  const results = await getJson(`/api/search?actorId=${encodeURIComponent(selectedActor())}&q=${encodeURIComponent(query)}`);
  renderSearchResults(results);
}

async function refreshAll() {
  setStatus('');
  renderDirectComposerOptions();
  await loadHealth();
  await loadProjectPulse();
  await loadDirectConversations();
  await loadChannels();
  await syncSelection();
  await reloadLinkedContextLookup();
  await runSearch();
  renderAll();
}

directComposerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const memberIdentityIds = Array.from(directMembersEl.selectedOptions).map((option) => option.value);
  if (memberIdentityIds.length === 0) {
    setStatus('Choose at least one other identity for a direct conversation.', 'error');
    return;
  }

  try {
    const directConversation = await postJson('/api/direct-conversations', {
      actorId: selectedActor(),
      memberIdentityIds: [selectedActor(), ...memberIdentityIds]
    });
    await loadDirectConversations();
    state.selectedDirectConversationId = directConversation.id;
    state.selectedChannelId = null;
    state.selectedPostId = null;
    state.selectedThreadId = null;
    Array.from(directMembersEl.options).forEach((option) => {
      option.selected = false;
    });
    await syncSelection();
    setStatus(`Created direct conversation with ${directConversationLabel(directConversation)}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

postComposerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const channel = currentChannel();
  if (!channel || channel.kind !== 'forum') {
    return;
  }

  const title = postTitleEl.value.trim();
  const body = postBodyEl.value.trim();
  if (!title || !body) {
    setStatus('A forum post needs both a title and an opening message.', 'error');
    return;
  }

  try {
    const attachments = collectAttachmentDrafts(postAttachmentListEl);
    const created = await postJson('/api/posts', {
      actorId: selectedActor(),
      channelId: channel.id,
      title,
      body,
      attachments
    });
    postTitleEl.value = '';
    postBodyEl.value = '';
    clearAttachmentDrafts(postAttachmentListEl);
    await hydrateForumIndex();
    await hydrateThreadIndex();
    state.selectedPostId = created.post.id;
    state.selectedThreadId = null;
    await syncSelection();
    setStatus(`Created post "${created.post.title}".`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

threadComposerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const parent = currentThreadParent();
  const title = threadTitleEl.value.trim();

  if (!parent) {
    setStatus('Choose a channel or post before creating a thread.', 'error');
    return;
  }

  if (!title) {
    setStatus('A thread needs a title.', 'error');
    return;
  }

  try {
    const thread = await postJson('/api/threads', {
      actorId: selectedActor(),
      channelId: parent.scopeType === 'channel' ? parent.scopeId : undefined,
      postId: parent.scopeType === 'post' ? parent.scopeId : undefined,
      title
    });
    threadTitleEl.value = '';
    await hydrateThreadIndex();
    state.selectedThreadId = thread.id;
    await syncSelection();
    setStatus(`Created thread "${thread.title}".`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

composerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedScope || !bodyEl.value.trim()) {
    return;
  }

  try {
    const attachments = collectAttachmentDrafts(messageAttachmentListEl);
    await postJson('/api/messages', {
      actorId: selectedActor(),
      scopeType: state.selectedScope.scopeType,
      scopeId: state.selectedScope.scopeId,
      body: bodyEl.value.trim(),
      attachments
    });
    bodyEl.value = '';
    clearAttachmentDrafts(messageAttachmentListEl);
    await syncSelection();
    setStatus(`Sent message into ${currentScopeLabel()}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

actorSelect.addEventListener('change', async () => {
  state.selectedChannelId = null;
  state.selectedDirectConversationId = null;
  state.selectedPostId = null;
  state.selectedThreadId = null;
  state.selectedMessageId = null;
  await loadWorkspaces();
  await refreshAll();
});

workspaceSelect.addEventListener('change', async () => {
  state.selectedChannelId = null;
  state.selectedDirectConversationId = null;
  state.selectedPostId = null;
  state.selectedThreadId = null;
  state.selectedMessageId = null;
  await refreshAll();
});

refreshEl.addEventListener('click', () => {
  refreshAll().catch((error) => {
    setStatus(error.message, 'error');
  });
});

postAddAttachmentEl.addEventListener('click', () => {
  appendAttachmentDraft(postAttachmentListEl);
});

messageAddAttachmentEl.addEventListener('click', () => {
  appendAttachmentDraft(messageAttachmentListEl);
});

searchEl.addEventListener('input', () => {
  runSearch().catch((error) => {
    setStatus(error.message, 'error');
  });
});

linkedContextSystemEl.addEventListener('change', () => {
  updateLinkedContextComposerState();
});

linkedContextExternalIdEl.addEventListener('input', () => {
  updateLinkedContextComposerState();
});

coordinationFocusScopeEl.addEventListener('click', () => {
  state.coordinationFocusMode = 'scope';
  renderAll();
});

coordinationFocusMessageEl.addEventListener('click', () => {
  if (!state.selectedMessageId) {
    return;
  }

  state.coordinationFocusMode = 'message';
  renderAll();
});

linkedContextFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const system = linkedContextSystemEl.value;
  const externalId = linkedContextExternalIdEl.value.trim();

  if (!system || !externalId) {
    setStatus('Choose a system and external ID before running a linked-context lookup.', 'error');
    return;
  }

  try {
    setLinkedContextQuery({ system, externalId });
    await reloadLinkedContextLookup();
    renderAll();
    setStatus(`Loaded linked NEXUS context for ${system}:${externalId}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

linkedContextSearchEl.addEventListener('input', () => {
  setLinkedContextSearchQuery(linkedContextSearchEl.value);
  renderExternalReferences();
});

referenceComposerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const owner = parseReferenceOwnerValue(referenceOwnerEl.value);
  if (!owner) {
    setStatus('Select a scope or message before creating an external reference.', 'error');
    return;
  }

  if (!referenceExternalIdEl.value.trim() || !referenceUrlEl.value.trim() || !referenceTitleEl.value.trim()) {
    setStatus('External references need an external ID, URL, and title.', 'error');
    return;
  }

  try {
    const createdSystem = referenceSystemEl.value;
    const createdExternalId = referenceExternalIdEl.value.trim();
    await postJson('/api/external-references', {
      actorId: selectedActor(),
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      system: createdSystem,
      relationType: referenceRelationEl.value,
      externalId: createdExternalId,
      url: referenceUrlEl.value.trim(),
      title: referenceTitleEl.value.trim()
    });
    clearReferenceComposer();
    await loadExternalReferences();
    const activeQuery = currentLinkedContextQuery();
    if (activeQuery && activeQuery.system === createdSystem && activeQuery.externalId === createdExternalId) {
      await reloadLinkedContextLookup();
    }
    renderAll();
    setStatus(`Created external reference on ${owner.ownerType}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

relayComposerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedScope) {
    setStatus('Select a scope before creating a relay.', 'error');
    return;
  }

  const target = parseReferenceOwnerValue(relayTargetEl.value);
  if (!target) {
    setStatus('Choose a relay target.', 'error');
    return;
  }

  if (!relayReasonEl.value.trim()) {
    setStatus('Relays need a reason.', 'error');
    return;
  }

  try {
    const message = currentMessage();
    await postJson('/api/relays', {
      actorId: selectedActor(),
      scopeType: state.selectedScope.scopeType,
      scopeId: state.selectedScope.scopeId,
      toScopeType: target.ownerType,
      toScopeId: target.ownerId,
      reason: relayReasonEl.value.trim(),
      messageId: message?.id
    });
    relayReasonEl.value = '';
    await loadCoordinationRecords();
    renderAll();
    setStatus(`Created relay from ${currentScopeLabel()}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

handoffComposerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedScope) {
    setStatus('Select a scope before creating a handoff.', 'error');
    return;
  }

  if (!handoffTargetEl.value) {
    setStatus('Choose a handoff target identity.', 'error');
    return;
  }

  if (!handoffRationaleEl.value.trim()) {
    setStatus('Handoffs need a rationale.', 'error');
    return;
  }

  try {
    const message = currentMessage();
    await postJson('/api/handoffs', {
      actorId: selectedActor(),
      scopeType: state.selectedScope.scopeType,
      scopeId: state.selectedScope.scopeId,
      toIdentityId: handoffTargetEl.value,
      rationale: handoffRationaleEl.value.trim(),
      messageId: message?.id
    });
    handoffRationaleEl.value = '';
    await loadCoordinationRecords();
    renderAll();
    setStatus(`Created handoff in ${currentScopeLabel()}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

copyScopeLinkEl.addEventListener('click', async () => {
  if (!state.selectedScope) {
    setStatus('Select a readable scope before copying a link.', 'error');
    return;
  }

  try {
    await writeClipboardText(buildSelectionRouteUrl(window.location.href, currentScopeSelection()));
    setStatus(`Copied a link to ${currentScopeLabel()}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

copyMessageLinkEl.addEventListener('click', async () => {
  const message = currentMessage();
  if (!message) {
    setStatus('Select a message before copying a message-specific link.', 'error');
    return;
  }

  try {
    await writeClipboardText(buildSelectionRouteUrl(window.location.href, currentMessageSelection()));
    setStatus(`Copied a link to the selected message from ${actorName(message.authorIdentityId)}.`, 'success');
  }
  catch (error) {
    setStatus(error.message, 'error');
  }
});

syncAttachmentDraftPlaceholder(postAttachmentListEl);
syncAttachmentDraftPlaceholder(messageAttachmentListEl);
for (const system of externalReferenceSystems) {
  const option = document.createElement('option');
  option.value = system;
  option.textContent = system.toUpperCase();
  referenceSystemEl.appendChild(option);

  const linkedOption = document.createElement('option');
  linkedOption.value = system;
  linkedOption.textContent = system.toUpperCase();
  linkedContextSystemEl.appendChild(linkedOption);
}
for (const relation of externalReferenceRelations) {
  const option = document.createElement('option');
  option.value = relation;
  option.textContent = relation;
  referenceRelationEl.appendChild(option);
}
setLinkedContextQuery(null);
setLinkedContextSearchQuery('');
const initialRoute = parseSelectionRouteHash(window.location.hash);
await loadIdentities();
await loadWorkspaces();
await refreshAll();
if (hasSelectionRoute(initialRoute)) {
  await applySelectionRoute(initialRoute);
}
routeSyncSuspended = false;
syncSelectionRoute();

window.addEventListener('hashchange', () => {
  applySelectionRoute(parseSelectionRouteHash(window.location.hash), { announceFailures: true }).catch((error) => {
    setStatus(error.message, 'error');
  });
});
