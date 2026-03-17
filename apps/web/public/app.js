const actorSelect = document.querySelector('#actor');
const workspaceSelect = document.querySelector('#workspace');
const channelsEl = document.querySelector('#channels');
const directConversationsEl = document.querySelector('#direct-conversations');
const directComposerEl = document.querySelector('#direct-composer');
const directMembersEl = document.querySelector('#direct-members');
const channelTitleEl = document.querySelector('#channel-title');
const channelDescriptionEl = document.querySelector('#channel-description');
const channelTopicEl = document.querySelector('#channel-topic');
const scopeShellEl = document.querySelector('#scope-shell');
const forumColumnEl = document.querySelector('#forum-column');
const postListEl = document.querySelector('#post-list');
const postComposerEl = document.querySelector('#post-composer');
const postTitleEl = document.querySelector('#post-title');
const postBodyEl = document.querySelector('#post-body');
const threadColumnEl = document.querySelector('#thread-column');
const threadParentCopyEl = document.querySelector('#thread-parent-copy');
const threadListEl = document.querySelector('#thread-list');
const threadComposerEl = document.querySelector('#thread-composer');
const threadTitleEl = document.querySelector('#thread-title');
const scopeContextEl = document.querySelector('#scope-context');
const messagesEl = document.querySelector('#messages');
const composerEl = document.querySelector('#composer');
const bodyEl = document.querySelector('#message-body');
const composerHintEl = document.querySelector('#composer-hint');
const sendButtonEl = document.querySelector('#send-button');
const refreshEl = document.querySelector('#refresh');
const healthEl = document.querySelector('#health');
const searchEl = document.querySelector('#search');
const searchResultsEl = document.querySelector('#search-results');
const scopeSummaryEl = document.querySelector('#scope-summary');
const statusEl = document.querySelector('#status');

const state = {
  identities: [],
  identityMap: new Map(),
  channels: [],
  directConversations: [],
  postsByChannelId: new Map(),
  postChannelIndex: new Map(),
  threadsByParentKey: new Map(),
  threadParentIndex: new Map(),
  messages: [],
  selectedChannelId: null,
  selectedDirectConversationId: null,
  selectedPostId: null,
  selectedThreadId: null,
  selectedScope: null,
  health: null
};

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
    throw new Error(payload.error ?? `Request failed for ${path}`);
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
    throw new Error(result.error ?? `Request failed for ${path}`);
  }
  return result;
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

function setStatus(message, tone = 'info') {
  if (!message) {
    statusEl.className = 'status hidden';
    statusEl.textContent = '';
    return;
  }

  statusEl.className = `status ${tone}`;
  statusEl.textContent = message;
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

function renderHealth() {
  healthEl.textContent = JSON.stringify(state.health ?? {}, null, 2);
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
  for (const channel of state.channels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `channel-item${state.selectedChannelId === channel.id && !state.selectedDirectConversationId ? ' active' : ''}`;
    button.innerHTML = `
      <div class="channel-item-top">
        <strong>${escapeHtml(channel.name)}</strong>
        <span class="pill">${escapeHtml(channel.kind)}</span>
      </div>
      <div class="channel-item-copy">${escapeHtml(channel.description ?? '')}</div>
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
  for (const conversation of state.directConversations) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `direct-card${state.selectedDirectConversationId === conversation.id ? ' active' : ''}`;
    button.innerHTML = `
      <div class="direct-card-top">
        <strong>${escapeHtml(directConversationLabel(conversation))}</strong>
        <span class="pill">direct</span>
      </div>
      <div class="direct-card-copy">${escapeHtml(directConversationMembers(conversation))}</div>
      <div class="direct-card-meta">${escapeHtml(formatTimestamp(conversation.createdAt))}</div>
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
    article.className = 'message-card';
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
    `;
    messagesEl.appendChild(article);
  }
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
  }
  else {
    summaryLines.push(`<strong>Channel</strong><span>${escapeHtml(channel.name)}</span>`);
    summaryLines.push(`<strong>Kind</strong><span>${escapeHtml(channel.kind)}</span>`);
    summaryLines.push(`<strong>Scope</strong><span>${escapeHtml(state.selectedScope ? `${state.selectedScope.scopeType}:${state.selectedScope.scopeId}` : 'none')}</span>`);
    summaryLines.push(`<strong>Visible Posts</strong><span>${escapeHtml(channel.kind === 'forum' ? currentPosts().length : 0)}</span>`);
    summaryLines.push(`<strong>Visible Threads</strong><span>${escapeHtml(currentThreads().length)}</span>`);
    summaryLines.push(`<strong>Visible Messages</strong><span>${escapeHtml(state.messages.length)}</span>`);

    if (post?.source?.system === 'discord') {
      summaryLines.push(`<strong>Imported From</strong><span>${escapeHtml(`Discord forum thread ${post.source.externalChannelId}`)}</span>`);
    }

    if (thread) {
      summaryLines.push(`<strong>Thread</strong><span>${escapeHtml(thread.title)}</span>`);
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

function renderAll() {
  renderScopeShell();
  renderChannels();
  renderDirectConversations();
  renderPosts();
  renderThreads();
  renderMessages();
  renderScopeHeader();
  renderScopeSummary();
  updateComposerState();
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
    renderAll();
    return;
  }

  const channel = currentChannel();
  if (!channel) {
    state.selectedScope = null;
    state.messages = [];
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
  }

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
  await loadDirectConversations();
  await loadChannels();
  await syncSelection();
  await runSearch();
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
    const created = await postJson('/api/posts', {
      actorId: selectedActor(),
      channelId: channel.id,
      title,
      body
    });
    postTitleEl.value = '';
    postBodyEl.value = '';
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
    await postJson('/api/messages', {
      actorId: selectedActor(),
      scopeType: state.selectedScope.scopeType,
      scopeId: state.selectedScope.scopeId,
      body: bodyEl.value.trim()
    });
    bodyEl.value = '';
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
  await loadWorkspaces();
  await refreshAll();
});

workspaceSelect.addEventListener('change', async () => {
  state.selectedChannelId = null;
  state.selectedPostId = null;
  state.selectedThreadId = null;
  await refreshAll();
});

refreshEl.addEventListener('click', () => {
  refreshAll().catch((error) => {
    setStatus(error.message, 'error');
  });
});

searchEl.addEventListener('input', () => {
  runSearch().catch((error) => {
    setStatus(error.message, 'error');
  });
});

await loadIdentities();
await loadWorkspaces();
await refreshAll();
