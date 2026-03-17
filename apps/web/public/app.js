const actorSelect = document.querySelector('#actor');
const workspaceSelect = document.querySelector('#workspace');
const channelsEl = document.querySelector('#channels');
const channelTitleEl = document.querySelector('#channel-title');
const messagesEl = document.querySelector('#messages');
const composerEl = document.querySelector('#composer');
const bodyEl = document.querySelector('#message-body');
const refreshEl = document.querySelector('#refresh');
const healthEl = document.querySelector('#health');
const searchEl = document.querySelector('#search');
const searchResultsEl = document.querySelector('#search-results');

let currentScope = null;

async function getJson(path) {
  const response = await fetch(path);
  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function selectedActor() {
  return actorSelect.value;
}

function selectedWorkspace() {
  return workspaceSelect.value;
}

function renderMessages(messages) {
  messagesEl.innerHTML = '';
  for (const message of messages) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
      <div class="message-meta">${message.authorIdentityId} • ${new Date(message.createdAt).toLocaleString()}</div>
      <div>${message.body}</div>
    `;
    messagesEl.appendChild(div);
  }
}

function renderChannels(channels) {
  channelsEl.innerHTML = '';
  for (const channel of channels) {
    const wrapper = document.createElement('div');
    wrapper.className = `channel-item${currentScope?.scopeId === channel.id ? ' active' : ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<strong>${channel.name}</strong><div class="message-meta">${channel.kind} • ${channel.description}</div>`;
    button.addEventListener('click', async () => {
      currentScope = { scopeType: 'channel', scopeId: channel.id, title: channel.name };
      channelTitleEl.textContent = channel.name;
      const messages = await getJson(`/api/messages?actorId=${encodeURIComponent(selectedActor())}&scopeType=channel&scopeId=${encodeURIComponent(channel.id)}`);
      renderMessages(messages);
      renderChannels(channels);
    });
    wrapper.appendChild(button);
    channelsEl.appendChild(wrapper);
  }
}

async function loadHealth() {
  healthEl.textContent = JSON.stringify(await getJson('/api/health'), null, 2);
}

async function loadIdentities() {
  const identities = await getJson('/api/identities');
  actorSelect.innerHTML = '';
  for (const identity of identities) {
    const option = document.createElement('option');
    option.value = identity.id;
    option.textContent = identity.displayName;
    actorSelect.appendChild(option);
  }
  actorSelect.value = 'identity-jack';
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

async function loadChannels() {
  const channels = await getJson(`/api/channels?actorId=${encodeURIComponent(selectedActor())}&workspaceId=${encodeURIComponent(selectedWorkspace())}`);
  renderChannels(channels);
  if (!currentScope && channels[0]) {
    currentScope = { scopeType: 'channel', scopeId: channels[0].id, title: channels[0].name };
    channelTitleEl.textContent = channels[0].name;
    renderMessages(await getJson(`/api/messages?actorId=${encodeURIComponent(selectedActor())}&scopeType=channel&scopeId=${encodeURIComponent(channels[0].id)}`));
  }
}

async function runSearch() {
  const q = searchEl.value.trim();
  if (!q) {
    searchResultsEl.innerHTML = '';
    return;
  }
  const matches = await getJson(`/api/search?actorId=${encodeURIComponent(selectedActor())}&q=${encodeURIComponent(q)}`);
  searchResultsEl.innerHTML = '';
  for (const match of matches) {
    const div = document.createElement('div');
    div.className = 'search-item';
    div.innerHTML = `
      <div class="search-meta">${match.scopeType}:${match.scopeId}</div>
      <div>${match.body}</div>
    `;
    searchResultsEl.appendChild(div);
  }
}

composerEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentScope || !bodyEl.value.trim()) {
    return;
  }
  await postJson('/api/messages', {
    actorId: selectedActor(),
    scopeType: currentScope.scopeType,
    scopeId: currentScope.scopeId,
    body: bodyEl.value.trim()
  });
  bodyEl.value = '';
  renderMessages(await getJson(`/api/messages?actorId=${encodeURIComponent(selectedActor())}&scopeType=${encodeURIComponent(currentScope.scopeType)}&scopeId=${encodeURIComponent(currentScope.scopeId)}`));
});

actorSelect.addEventListener('change', async () => {
  currentScope = null;
  await loadWorkspaces();
  await loadChannels();
  await runSearch();
});

workspaceSelect.addEventListener('change', async () => {
  currentScope = null;
  await loadChannels();
});

refreshEl.addEventListener('click', async () => {
  await loadHealth();
  await loadChannels();
  await runSearch();
});

searchEl.addEventListener('input', () => {
  runSearch().catch(console.error);
});

await loadIdentities();
await loadWorkspaces();
await loadHealth();
await loadChannels();
