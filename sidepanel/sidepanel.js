// X Buckets — Side Panel Script
// Full bucket browsing experience

let buckets = [];
let activeBucketId = 'all';
let searchQuery = '';
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadBuckets();
  setupSearch();
  setupTabs();

  // Listen for updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'bucketsUpdated') {
      buckets = msg.buckets;
      renderTabs();
      renderItems();
    }
  });
}

async function loadBuckets() {
  try {
    buckets = await chrome.runtime.sendMessage({ action: 'getBuckets' }) || [];
  } catch { buckets = []; }
  renderTabs();
  renderItems();
}

// ── Tabs ──

function setupTabs() {
  document.getElementById('xb-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.xb-tab');
    if (!tab) return;
    activeBucketId = tab.dataset.bucket;
    document.querySelectorAll('.xb-tab').forEach(t => t.classList.remove('xb-tab-active'));
    tab.classList.add('xb-tab-active');
    renderItems();
  });
}

function renderTabs() {
  const container = document.getElementById('xb-tabs');
  const totalItems = buckets.reduce((s, b) => s + (b.items?.length || 0), 0);

  container.innerHTML = `
    <button class="xb-tab ${activeBucketId === 'all' ? 'xb-tab-active' : ''}" data-bucket="all">
      All (${totalItems})
    </button>
    ${buckets.map(b => `
      <button class="xb-tab ${activeBucketId === b.id ? 'xb-tab-active' : ''}" data-bucket="${b.id}">
        ${b.icon} ${escapeHtml(b.name)} (${b.items?.length || 0})
      </button>
    `).join('')}
  `;
}

// ── Search ──

function setupSearch() {
  document.getElementById('xb-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderItems();
    }, 250);
  });
}

// ── Items ──

function renderItems() {
  const content = document.getElementById('xb-content');
  let items = [];

  if (activeBucketId === 'all') {
    buckets.forEach(b => {
      (b.items || []).forEach(item => {
        items.push({ ...item, bucketName: b.name, bucketId: b.id, bucketColor: b.color });
      });
    });
  } else {
    const bucket = buckets.find(b => b.id === activeBucketId);
    if (bucket) {
      items = (bucket.items || []).map(item => ({
        ...item, bucketName: bucket.name, bucketId: bucket.id, bucketColor: bucket.color
      }));
    }
  }

  // Filter by search
  if (searchQuery) {
    items = items.filter(item => {
      const text = [item.textContent, item.authorName, item.authorHandle, item.url]
        .filter(Boolean).join(' ').toLowerCase();
      return text.includes(searchQuery);
    });
  }

  // Sort by savedAt (newest first)
  items.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  if (items.length === 0) {
    content.innerHTML = `
      <div class="xb-empty-state">
        <div class="xb-empty-state-icon">${searchQuery ? '🔍' : '🪣'}</div>
        <div class="xb-empty-state-title">${searchQuery ? 'No results' : 'Nothing saved yet'}</div>
        <div class="xb-empty-state-desc">
          ${searchQuery
            ? 'Try a different search term'
            : 'Long-press any post or message on X.com<br>and drag it into a bucket!'}
        </div>
      </div>
    `;
    return;
  }

  content.innerHTML = items.map((item, i) => `
    <div class="xb-item-card" data-url="${escapeHtml(item.url || '')}" style="animation-delay: ${i * 0.04}s">
      <button class="xb-item-delete" data-bucket-id="${item.bucketId}" data-item-id="${item.id}" title="Remove">✕</button>
      <div class="xb-item-header">
        <span class="xb-item-type ${item.type === 'xchat_message' ? 'xb-type-message' : ''}">
          ${item.type === 'tweet' ? '𝕏 Post' : '💬 Message'}
        </span>
        ${item.authorName ? `<span class="xb-item-author">${escapeHtml(item.authorName)}</span>` : ''}
        ${item.authorHandle ? `<span class="xb-item-author">@${escapeHtml(item.authorHandle)}</span>` : ''}
      </div>
      <div class="xb-item-text">${escapeHtml(item.textContent || '')}</div>
      ${renderMedia(item.media)}
      <div class="xb-item-footer">
        <span class="xb-item-time">${formatDate(item.savedAt)}</span>
        <span class="xb-item-bucket-tag" style="background: ${item.bucketColor}20; color: ${item.bucketColor}">
          ${escapeHtml(item.bucketName)}
        </span>
      </div>
    </div>
  `).join('');

  // Click to open
  content.querySelectorAll('.xb-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.xb-item-delete')) return;
      const url = card.dataset.url;
      if (url) window.open(url, '_blank');
    });
  });

  // Delete buttons
  content.querySelectorAll('.xb-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const bucketId = btn.dataset.bucketId;
      const itemId = btn.dataset.itemId;
      await chrome.runtime.sendMessage({
        action: 'removeItemFromBucket',
        bucketId, itemId
      });
      await loadBuckets();
    });
  });
}

function renderMedia(media) {
  if (!media || media.length === 0) return '';
  return `<div class="xb-item-media">
    ${media.slice(0, 2).map(m =>
      m.type === 'image'
        ? `<img src="${m.url}" alt="${m.alt || ''}" loading="lazy" />`
        : `<div style="padding:20px;text-align:center;background:rgba(255,255,255,0.04);border-radius:10px;width:100%">🎬 Video</div>`
    ).join('')}
  </div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
