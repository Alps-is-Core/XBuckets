// X Buckets — Popup Script
// Bucket management UI

const EMOJIS = [
  '📂','🏠','📈','💰','🎨','🍕','✈️','📚',
  '🎮','🎵','💡','🔥','⚡','💎','🌟','🎯',
  '🛒','👗','🏋️','🐕','📷','🌍','🎬','💻',
  '🧠','❤️','🎁','🔖','📌','🗂️','💼','🏷️'
];

let selectedEmoji = '📂';
let buckets = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupEmojiPicker();
  setupCreateBucket();
  setupExport();
  setupSidePanel();
  await loadBuckets();
}

// ── Emoji Picker ──

function setupEmojiPicker() {
  const btn = document.getElementById('xb-emoji-btn');
  const grid = document.getElementById('xb-emoji-grid');

  // Populate grid
  grid.innerHTML = EMOJIS.map(e =>
    `<button class="xb-emoji-option" data-emoji="${e}">${e}</button>`
  ).join('');

  btn.addEventListener('click', () => {
    grid.classList.toggle('xb-hidden');
  });

  grid.addEventListener('click', (e) => {
    const option = e.target.closest('.xb-emoji-option');
    if (!option) return;
    selectedEmoji = option.dataset.emoji;
    btn.textContent = selectedEmoji;
    grid.classList.add('xb-hidden');
  });
}

// ── Create Bucket ──

function setupCreateBucket() {
  const nameInput = document.getElementById('xb-bucket-name');
  const colorInput = document.getElementById('xb-bucket-color');
  const createBtn = document.getElementById('xb-create-btn');

  const doCreate = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.style.borderColor = '#E0245E';
      setTimeout(() => nameInput.style.borderColor = '', 1000);
      return;
    }

    const resp = await chrome.runtime.sendMessage({
      action: 'createBucket',
      bucket: {
        name,
        color: colorInput.value,
        icon: selectedEmoji
      }
    });

    if (resp.success) {
      nameInput.value = '';
      selectedEmoji = '📂';
      document.getElementById('xb-emoji-btn').textContent = '📂';
      await loadBuckets();
    }
  };

  createBtn.addEventListener('click', doCreate);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCreate();
  });
}

// ── Load & Render Buckets ──

async function loadBuckets() {
  buckets = await chrome.runtime.sendMessage({ action: 'getBuckets' }) || [];
  renderBuckets();
  updateStats();
}

function renderBuckets() {
  const list = document.getElementById('xb-bucket-list');

  if (buckets.length === 0) {
    list.innerHTML = `
      <div class="xb-empty">
        <div class="xb-empty-icon">🪣</div>
        <div class="xb-empty-title">No buckets yet</div>
        <div class="xb-empty-desc">Create a bucket above, then long-press<br>any post or message on X to save it!</div>
      </div>
    `;
    return;
  }

  list.innerHTML = buckets.map((b, i) => `
    <div class="xb-bucket-item" data-id="${b.id}" style="animation-delay: ${i * 0.05}s">
      <div class="xb-bucket-item-icon" style="background: ${b.color}20">${b.icon}</div>
      <div class="xb-bucket-item-info">
        <div class="xb-bucket-item-name">${escapeHtml(b.name)}</div>
        <div class="xb-bucket-item-meta">${b.items?.length || 0} items</div>
      </div>
      <div class="xb-bucket-actions">
        <button class="xb-bucket-action-btn xb-edit" data-action="rename" data-id="${b.id}" title="Rename">✏️</button>
        <button class="xb-bucket-action-btn" data-action="delete" data-id="${b.id}" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');

  // Event delegation for actions
  list.querySelectorAll('.xb-bucket-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'delete') deleteBucket(id);
      if (action === 'rename') renameBucket(id);
    });
  });
}

async function deleteBucket(id) {
  const bucket = buckets.find(b => b.id === id);
  if (!bucket) return;
  if (!confirm(`Delete "${bucket.name}" and all its items?`)) return;
  await chrome.runtime.sendMessage({ action: 'deleteBucket', bucketId: id });
  await loadBuckets();
}

async function renameBucket(id) {
  const bucket = buckets.find(b => b.id === id);
  if (!bucket) return;
  const newName = prompt('Rename bucket:', bucket.name);
  if (!newName || newName.trim() === bucket.name) return;
  await chrome.runtime.sendMessage({
    action: 'renameBucket',
    bucketId: id,
    newName: newName.trim()
  });
  await loadBuckets();
}

function updateStats() {
  const totalItems = buckets.reduce((sum, b) => sum + (b.items?.length || 0), 0);
  document.getElementById('xb-stats').textContent =
    `${buckets.length} bucket${buckets.length !== 1 ? 's' : ''} · ${totalItems} item${totalItems !== 1 ? 's' : ''}`;
}

// ── Side Panel ──

function setupSidePanel() {
  document.getElementById('xb-open-panel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
        // Fallback: open side panel page in new tab
        chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html') });
      });
    }
  });
}

// ── Export ──

function setupExport() {
  document.getElementById('xb-export-btn').addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({ action: 'exportData' });
    if (resp.success) {
      const blob = new Blob([resp.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xbuckets_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });
}

// ── Utility ──

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
