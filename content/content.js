// X Buckets — Main Content Script v2
// Edge-based bucket UI — buckets appear on left, right, bottom edges of screen

const XBucketsUI = {
  overlay: null,
  buckets: [],
  isVisible: false,
  edgeBucketEls: [],

  async init() {
    this.buckets = await this.loadBuckets();
    this.createOverlay();
    window.XBucketsDragHandler.init();

    // Listen for bucket updates from popup
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'bucketsUpdated') {
        this.buckets = msg.buckets;
      }
    });

    // Re-fetch buckets periodically (in case popup creates new ones)
    setInterval(() => this.loadBuckets().then(b => { this.buckets = b; }), 5000);

    console.log('[X Buckets] Extension loaded ✓ — Long-press any post or message to start');
  },

  async loadBuckets() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getBuckets' });
      return resp || [];
    } catch { return []; }
  },

  createOverlay() {
    // Dark overlay behind everything
    const overlay = document.createElement('div');
    overlay.id = 'xb-overlay';
    overlay.className = 'xb-overlay';
    document.body.appendChild(overlay);
    this.overlay = overlay;
  },

  /**
   * Distribute buckets across left, right, and bottom screen edges
   */
  showEdgeBuckets() {
    // Refresh buckets first
    this.loadBuckets().then(buckets => {
      this.buckets = buckets;
      this._renderEdgeBuckets();
    });
  },

  _renderEdgeBuckets() {
    // Remove old edge buckets
    this.edgeBucketEls.forEach(el => el.remove());
    this.edgeBucketEls = [];

    if (this.buckets.length === 0) {
      this._showNoBucketsMessage();
      return;
    }

    // Show overlay
    this.overlay.classList.add('xb-overlay-visible');
    this.isVisible = true;

    // Distribute buckets across 3 edges: left, bottom, right
    const total = this.buckets.length;
    const leftCount = Math.ceil(total / 3);
    const bottomCount = Math.ceil((total - leftCount) / 2);
    const rightCount = total - leftCount - bottomCount;

    const leftBuckets = this.buckets.slice(0, leftCount);
    const bottomBuckets = this.buckets.slice(leftCount, leftCount + bottomCount);
    const rightBuckets = this.buckets.slice(leftCount + bottomCount);

    // Create edge bucket elements
    leftBuckets.forEach((b, i) => {
      this._createEdgeBucket(b, 'left', i, leftBuckets.length);
    });

    bottomBuckets.forEach((b, i) => {
      this._createEdgeBucket(b, 'bottom', i, bottomBuckets.length);
    });

    rightBuckets.forEach((b, i) => {
      this._createEdgeBucket(b, 'right', i, rightBuckets.length);
    });

    // Stagger animation
    this.edgeBucketEls.forEach((el, i) => {
      el.style.transitionDelay = (i * 0.04) + 's';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('xb-edge-visible');
        });
      });
    });
  },

  _createEdgeBucket(bucket, edge, index, totalOnEdge) {
    const el = document.createElement('div');
    el.className = `xb-edge-bucket xb-edge-${edge}`;
    el.dataset.bucketId = bucket.id;
    el.dataset.edge = edge;

    el.innerHTML = `
      <span class="xb-edge-icon">${bucket.icon}</span>
      <span class="xb-edge-label">${bucket.name}</span>
    `;

    // Position based on edge + index
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (edge === 'left' || edge === 'right') {
      // Vertical distribution — evenly space from top area to bottom area
      const padding = 80; // stay away from very top/bottom
      const usableHeight = vh - (padding * 2);
      const spacing = totalOnEdge > 1 ? usableHeight / (totalOnEdge - 1) : usableHeight / 2;
      const topPos = padding + (index * spacing);
      el.style.top = topPos + 'px';
    }

    if (edge === 'bottom') {
      // Horizontal distribution across bottom
      const padding = 200; // stay away from left sidebar and right sidebar
      const usableWidth = vw - (padding * 2);
      const spacing = totalOnEdge > 1 ? usableWidth / (totalOnEdge - 1) : usableWidth / 2;
      const leftPos = padding + (index * spacing);
      el.style.left = leftPos + 'px';
    }

    // Color accent
    el.style.setProperty('--bucket-color', bucket.color);

    document.body.appendChild(el);
    this.edgeBucketEls.push(el);
  },

  _showNoBucketsMessage() {
    this.overlay.classList.add('xb-overlay-visible');
    this.isVisible = true;

    const msg = document.createElement('div');
    msg.className = 'xb-no-buckets-msg';
    msg.innerHTML = `
      <div class="xb-no-buckets-icon">🪣</div>
      <div class="xb-no-buckets-text">No buckets created yet!</div>
      <div class="xb-no-buckets-hint">Click the X Buckets extension icon to create one</div>
    `;
    document.body.appendChild(msg);
    this.edgeBucketEls.push(msg);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        msg.classList.add('xb-no-buckets-visible');
      });
    });
  },

  hideEdgeBuckets() {
    this.overlay.classList.remove('xb-overlay-visible');
    this.isVisible = false;

    this.edgeBucketEls.forEach(el => {
      el.classList.remove('xb-edge-visible');
      el.classList.add('xb-edge-hiding');
    });

    setTimeout(() => {
      this.edgeBucketEls.forEach(el => el.remove());
      this.edgeBucketEls = [];
    }, 400);
  },

  /**
   * Check which edge bucket the cursor is hovering over
   */
  checkBucketHover(x, y) {
    this.edgeBucketEls.forEach(el => {
      if (!el.dataset.bucketId) return; // skip message elements
      const rect = el.getBoundingClientRect();
      // Generous hit area — expand by 20px in each direction
      const isOver = x >= rect.left - 20 && x <= rect.right + 20 &&
                     y >= rect.top - 20 && y <= rect.bottom + 20;
      el.classList.toggle('xb-edge-hover', isOver);
    });
  },

  /**
   * Get the bucket element under the cursor
   */
  getHoveredBucket(x, y) {
    for (const el of this.edgeBucketEls) {
      if (!el.dataset.bucketId) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left - 20 && x <= rect.right + 20 &&
          y >= rect.top - 20 && y <= rect.bottom + 20) {
        return el;
      }
    }
    return null;
  }
};

window.XBucketsUI = XBucketsUI;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => XBucketsUI.init());
} else {
  XBucketsUI.init();
}
