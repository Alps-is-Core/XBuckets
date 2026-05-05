// X Buckets — Background Service Worker
// Handles storage operations, side panel, and messaging

// Open side panel when extension icon is clicked (optional behavior)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getBuckets':
      getBuckets().then(sendResponse);
      return true;

    case 'createBucket':
      createBucket(message.bucket).then(sendResponse);
      return true;

    case 'deleteBucket':
      deleteBucket(message.bucketId).then(sendResponse);
      return true;

    case 'renameBucket':
      renameBucket(message.bucketId, message.newName).then(sendResponse);
      return true;

    case 'addItemToBucket':
      addItemToBucket(message.bucketId, message.item).then(sendResponse);
      return true;

    case 'removeItemFromBucket':
      removeItemFromBucket(message.bucketId, message.itemId).then(sendResponse);
      return true;

    case 'searchItems':
      searchItems(message.query).then(sendResponse);
      return true;

    case 'openSidePanel':
      if (sender.tab) {
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      }
      sendResponse({ success: true });
      return true;

    case 'exportData':
      exportData().then(sendResponse);
      return true;
  }
});

// ── Storage Helpers ──

async function getBuckets() {
  const data = await chrome.storage.local.get('buckets');
  return data.buckets || [];
}

async function saveBuckets(buckets) {
  await chrome.storage.local.set({ buckets });
  // Notify all listeners about the change
  chrome.runtime.sendMessage({ action: 'bucketsUpdated', buckets }).catch(() => {});
}

async function createBucket(bucket) {
  const buckets = await getBuckets();
  const newBucket = {
    id: 'bucket_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name: bucket.name,
    color: bucket.color || getRandomColor(),
    icon: bucket.icon || '📂',
    items: [],
    createdAt: new Date().toISOString()
  };
  buckets.push(newBucket);
  await saveBuckets(buckets);
  return { success: true, bucket: newBucket };
}

async function deleteBucket(bucketId) {
  let buckets = await getBuckets();
  buckets = buckets.filter(b => b.id !== bucketId);
  await saveBuckets(buckets);
  return { success: true };
}

async function renameBucket(bucketId, newName) {
  const buckets = await getBuckets();
  const bucket = buckets.find(b => b.id === bucketId);
  if (bucket) {
    bucket.name = newName;
    await saveBuckets(buckets);
    return { success: true };
  }
  return { success: false, error: 'Bucket not found' };
}

async function addItemToBucket(bucketId, item) {
  const buckets = await getBuckets();
  const bucket = buckets.find(b => b.id === bucketId);
  if (!bucket) return { success: false, error: 'Bucket not found' };

  // Check for duplicate
  const isDuplicate = bucket.items.some(existing =>
    existing.url === item.url && existing.type === item.type
  );
  if (isDuplicate) return { success: false, error: 'Item already in bucket' };

  const newItem = {
    id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    ...item,
    savedAt: new Date().toISOString()
  };
  bucket.items.unshift(newItem); // Newest first
  await saveBuckets(buckets);
  return { success: true, item: newItem };
}

async function removeItemFromBucket(bucketId, itemId) {
  const buckets = await getBuckets();
  const bucket = buckets.find(b => b.id === bucketId);
  if (bucket) {
    bucket.items = bucket.items.filter(i => i.id !== itemId);
    await saveBuckets(buckets);
    return { success: true };
  }
  return { success: false, error: 'Bucket not found' };
}

async function searchItems(query) {
  const buckets = await getBuckets();
  const q = query.toLowerCase();
  const results = [];
  for (const bucket of buckets) {
    for (const item of bucket.items) {
      const searchableText = [
        item.textContent,
        item.authorName,
        item.authorHandle,
        item.url
      ].filter(Boolean).join(' ').toLowerCase();

      if (searchableText.includes(q)) {
        results.push({ ...item, bucketName: bucket.name, bucketId: bucket.id });
      }
    }
  }
  return results;
}

async function exportData() {
  const buckets = await getBuckets();
  return { success: true, data: JSON.stringify(buckets, null, 2) };
}

// ── Utility ──

function getRandomColor() {
  const colors = [
    '#1DA1F2', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD', '#01A3A4',
    '#F368E0', '#FF6348', '#7BED9F', '#70A1FF', '#FFA502'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
