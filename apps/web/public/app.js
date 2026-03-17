const actorSelect = document.querySelector('#actor');
const workspaceSelect = document.querySelector('#workspace');
const channelsEl = document.querySelector('#channels');
const channelTitleEl = document.querySelector('#channel-title');
const channelDescriptionEl = document.querySelector('#channel-description');
const channelTopicEl = document.querySelector('#channel-topic');
const forumColumnEl = document.querySelector('#forum-column');
const postListEl = document.querySelector('#post-list');
const postComposerEl = document.querySelector('#post-composer');
const postTitleEl = document.querySelector('#post-title');
const postBodyEl = document.querySelector('#post-body');
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
  postsByChannelId: new Map(),
  postChannelIndex: new Map(),
  messages: [],
  selectedChannelId: null,
  selectedPostId: null,
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

function currentPosts() {
  return state.postsByChannelId.get(state.selectedChannelId) ?? [];
}

function currentPost() {
  return currentPosts().find((post) => post.id === state.selectedPostId) ?? null;
}

function currentScopeLabel() {
  const channel = currentChannel();
  const post = currentPost();
  if (!channel) {
    return 'No scope selected';
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

function summarizeTopic(topic) {
  if (!topic) {
    return 'No topic metadata is available for this lane yet.';
  }
  return topic;
}

function renderHealth() {
  healthEl.textContent = JSON.stringify(state.health ?? {}, null, 2);
}

function renderChannels() {
  channelsEl.innerHTML = '';
  for (const channel of state.channels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `channel-item${state.selectedChannelId === channel.id ? ' active' : ''}`;
    button.innerHTML = `
      <div class="channel-item-top">
        <strong>${escapeHtml(channel.name)}</strong>
        <span class="pill">${escapeHtml(channel.kind)}</span>
      </div>
      <div class="channel-item-copy">${escapeHtml(channel.description ?? '')}</div>
    `;
    button.addEventListener('click', async () => {
      state.selectedChannelId = channel.id;
      state.selectedPostId = null;
      await syncSelection();
    });
    channelsEl.appendChild(button);
  }
}

function renderPosts() {
  const channel = currentChannel();
  if (!channel || channel.kind !== 'forum') {
    forumColumnEl.classList.add('hidden');
    postListEl.innerHTML = '';
    return;
  }

  forumColumnEl.classList.remove('hidden');
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
      await syncSelection();
    });
    postListEl.appendChild(button);
  }

  if (posts.length === 0) {
    postListEl.innerHTML = '<div class="empty-state">No posts yet. Create the first one for this lane.</div>';
  }
}

function renderMessages() {
  messagesEl.innerHTML = '';
  if (!state.selectedScope) {
    messagesEl.innerHTML = '<div class="empty-state">Choose a channel to load messages.</div>';
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
  const channel = currentChannel();
  const post = currentPost();

  if (!channel) {
    scopeSummaryEl.className = 'summary-card empty';
    scopeSummaryEl.textContent = 'Choose a channel to inspect its scope, topic, and imported state.';
    return;
  }

  const summaryLines = [
    `<strong>Channel</strong><span>${escapeHtml(channel.name)}</span>`,
    `<strong>Kind</strong><span>${escapeHtml(channel.kind)}</span>`,
    `<strong>Scope</strong><span>${escapeHtml(state.selectedScope ? `${state.selectedScope.scopeType}:${state.selectedScope.scopeId}` : 'none')}</span>`,
    `<strong>Visible Posts</strong><span>${escapeHtml(channel.kind === 'forum' ? currentPosts().length : 0)}</span>`,
    `<strong>Visible Messages</strong><span>${escapeHtml(state.messages.length)}</span>`
  ];

  if (post?.source?.system === 'discord') {
    summaryLines.push(`<strong>Imported From</strong><span>${escapeHtml(`Discord forum thread ${post.source.externalChannelId}`)}</span>`);
  }

  scopeSummaryEl.className = 'summary-card';
  scopeSummaryEl.innerHTML = summaryLines.map((line) => `<div class="summary-row">${line}</div>`).join('');
}

function renderScopeHeader() {
  const channel = currentChannel();
  const post = currentPost();

  if (!channel) {
    channelTitleEl.textContent = 'Select a channel';
    channelDescriptionEl.textContent = 'Choose a visible lane to browse its native NEXUS records.';
    channelTopicEl.className = 'topic-card empty';
    channelTopicEl.textContent = 'Channel guidance will appear here.';
    scopeContextEl.className = 'scope-context empty';
    scopeContextEl.textContent = 'No scope selected.';
    return;
  }

  channelTitleEl.textContent = channel.name;
  channelDescriptionEl.textContent = channel.description ?? '';
  channelTopicEl.className = 'topic-card';
  channelTopicEl.textContent = summarizeTopic(channel.topic);

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
  const channel = currentChannel();
  const hasWritableScope = Boolean(state.selectedScope);
  const forumWithoutPost = channel?.kind === 'forum' && !currentPost();

  bodyEl.disabled = !hasWritableScope || forumWithoutPost;
  sendButtonEl.disabled = !hasWritableScope || forumWithoutPost;

  if (!channel) {
    composerHintEl.textContent = 'Select a channel to compose.';
    return;
  }

  if (channel.kind === 'forum' && !currentPost()) {
    composerHintEl.textContent = 'Forum messages belong inside a post. Select or create one first.';
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

    const targetChannelId = match.scopeType === 'channel'
      ? match.scopeId
      : (match.scopeType === 'post' ? state.postChannelIndex.get(match.scopeId) ?? match.source?.routedChannelId ?? null : null);
    if (!targetChannelId) {
      button.disabled = true;
    }
    else {
      button.addEventListener('click', async () => {
        state.selectedChannelId = targetChannelId;
        if (match.scopeType === 'post') {
          state.selectedPostId = match.scopeId;
        }
        else {
          state.selectedPostId = null;
        }
        await syncSelection();
      });
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

async function loadChannels() {
  state.channels = await getJson(`/api/channels?actorId=${encodeURIComponent(selectedActor())}&workspaceId=${encodeURIComponent(selectedWorkspace())}`);
  await hydrateForumIndex();

  if (!state.channels.some((channel) => channel.id === state.selectedChannelId)) {
    state.selectedChannelId = state.channels[0]?.id ?? null;
    state.selectedPostId = null;
  }
}

async function loadMessagesForScope(scopeType, scopeId) {
  state.messages = await getJson(`/api/messages?actorId=${encodeURIComponent(selectedActor())}&scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`);
}

async function syncSelection() {
  const channel = currentChannel();
  if (!channel) {
    state.selectedScope = null;
    state.messages = [];
    renderChannels();
    renderPosts();
    renderMessages();
    renderScopeHeader();
    renderScopeSummary();
    updateComposerState();
    return;
  }

  if (channel.kind === 'forum') {
    const posts = currentPosts();
    if (posts.length === 0) {
      state.selectedPostId = null;
      state.selectedScope = null;
      state.messages = [];
    }
    else {
      if (!posts.some((post) => post.id === state.selectedPostId)) {
        state.selectedPostId = posts[0].id;
      }
      state.selectedScope = {
        scopeType: 'post',
        scopeId: state.selectedPostId
      };
      await loadMessagesForScope('post', state.selectedPostId);
    }
  }
  else {
    state.selectedPostId = null;
    state.selectedScope = {
      scopeType: 'channel',
      scopeId: channel.id
    };
    await loadMessagesForScope('channel', channel.id);
  }

  renderChannels();
  renderPosts();
  renderMessages();
  renderScopeHeader();
  renderScopeSummary();
  updateComposerState();
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
  await loadHealth();
  await loadChannels();
  await syncSelection();
  await runSearch();
}

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
    state.selectedPostId = created.post.id;
    await syncSelection();
    setStatus(`Created post "${created.post.title}".`, 'success');
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
  state.selectedPostId = null;
  await loadWorkspaces();
  await refreshAll();
});

workspaceSelect.addEventListener('change', async () => {
  state.selectedChannelId = null;
  state.selectedPostId = null;
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
