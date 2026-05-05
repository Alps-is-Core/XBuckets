// X Buckets — Drag Handler v3
// Ultra-robust long-press that bypasses X.com's React event system
// Uses MutationObserver + direct element listeners as fallback

const XBucketsDragHandler = {
  LONG_PRESS_MS: 600,
  pressTimer: null,
  isDragging: false,
  dragGhost: null,
  activeElement: null,
  extractedData: null,
  startX: 0,
  startY: 0,
  longPressTriggered: false,
  boundElements: new WeakSet(),

  init() {
    // Strategy 1: Document-level capture listeners
    const opts = { capture: true, passive: false };
    document.addEventListener('mousedown', this._onMouseDown.bind(this), opts);
    document.addEventListener('mousemove', this._onMouseMove.bind(this), opts);
    document.addEventListener('mouseup', this._onMouseUp.bind(this), opts);
    document.addEventListener('touchstart', this._onTouchStart.bind(this), opts);
    document.addEventListener('touchmove', this._onTouchMove.bind(this), opts);
    document.addEventListener('touchend', this._onTouchEnd.bind(this), opts);
    document.addEventListener('touchcancel', this._onTouchEnd.bind(this), opts);

    // Block context menu during long-press / drag
    document.addEventListener('contextmenu', (e) => {
      if (this.isDragging || this.longPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    }, { capture: true });

    // Escape to cancel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isDragging) this.cancelDrag();
    });

    // Strategy 2: Directly attach to tweet articles as they appear
    this._observeNewTweets();

    console.log('[X Buckets] Drag handler v3 ready ✓');
  },

  // ── MutationObserver: Bind directly to new tweets ──
  _observeNewTweets() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Find tweet articles in added nodes
          const articles = node.querySelectorAll ? 
            node.querySelectorAll('article[data-testid="tweet"]') : [];
          articles.forEach(art => this._bindToElement(art));
          // Also check if the node itself is an article
          if (node.matches && node.matches('article[data-testid="tweet"]')) {
            this._bindToElement(node);
          }
          // Find DM message containers
          const msgs = node.querySelectorAll ? 
            node.querySelectorAll('[data-testid="messageEntry"], [data-testid="cellInnerDiv"]') : [];
          msgs.forEach(msg => this._bindToElement(msg));
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also bind to any already-existing tweets
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      this._bindToElement(art);
    });
  },

  _bindToElement(el) {
    if (this.boundElements.has(el)) return;
    this.boundElements.add(el);

    // Direct mousedown on the element (bypasses React's synthetic event pool)
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._handleDown(e.target, e.clientX, e.clientY);
    }, { capture: true, passive: true });

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      this._handleDown(t.target, t.clientX, t.clientY);
    }, { capture: true, passive: true });
  },

  // ── Mouse Event Handlers ──
  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._handleDown(e.target, e.clientX, e.clientY);
  },

  _onMouseMove(e) {
    this._handleMove(e.clientX, e.clientY, e);
  },

  _onMouseUp(e) {
    this._handleUp(e.clientX, e.clientY, e);
  },

  // ── Touch Event Handlers ──
  _onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this._handleDown(t.target, t.clientX, t.clientY);
  },

  _onTouchMove(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this._handleMove(t.clientX, t.clientY, e);
  },

  _onTouchEnd(e) {
    const t = e.changedTouches?.[0];
    this._handleUp(t?.clientX || 0, t?.clientY || 0, e);
  },

  // ══════════════════════════════════════
  // CORE LOGIC
  // ══════════════════════════════════════

  _handleDown(target, x, y) {
    // Prevent double-init from both strategies firing
    if (this.pressTimer) return;
    if (this.isDragging) return;

    const extractable = window.XBucketsExtractor.findExtractableElement(target);
    if (!extractable) return;

    this.startX = x;
    this.startY = y;
    this.activeElement = extractable;
    this.longPressTriggered = false;

    this.pressTimer = setTimeout(() => {
      this.longPressTriggered = true;
      this._startDrag(x, y);
    }, this.LONG_PRESS_MS);
  },

  _handleMove(x, y, event) {
    // Before long-press triggers: cancel if finger moved too much
    if (this.pressTimer && !this.isDragging) {
      const dx = Math.abs(x - this.startX);
      const dy = Math.abs(y - this.startY);
      if (dx > 10 || dy > 10) {
        clearTimeout(this.pressTimer);
        this.pressTimer = null;
        this.longPressTriggered = false;
      }
      return;
    }

    // During drag: move ghost + check bucket hover
    if (this.isDragging) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this._moveDragGhost(x, y);
      window.XBucketsUI?.checkBucketHover(x, y);
    }
  },

  _handleUp(x, y, event) {
    clearTimeout(this.pressTimer);
    this.pressTimer = null;

    if (this.isDragging) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
      this._endDrag(x, y);
    }

    setTimeout(() => { this.longPressTriggered = false; }, 100);
  },

  // ══════════════════════════════════════
  // DRAG LIFECYCLE
  // ══════════════════════════════════════

  _startDrag(x, y) {
    if (!this.activeElement) return;
    this.isDragging = true;

    // Extract content data
    this.extractedData = window.XBucketsExtractor.extract(this.activeElement);
    if (!this.extractedData) {
      console.warn('[X Buckets] Could not extract data from element');
      this.cancelDrag();
      return;
    }

    console.log('[X Buckets] Long-press detected! Extracted:', this.extractedData.type, this.extractedData.preview?.substring(0, 50));

    // Visual feedback: dim and shrink original
    this.activeElement.style.transition = 'transform 0.3s ease, opacity 0.3s ease, filter 0.3s ease';
    this.activeElement.style.transform = 'scale(0.96)';
    this.activeElement.style.opacity = '0.4';
    this.activeElement.style.filter = 'blur(1px)';

    // Create ghost
    this._createDragGhost(x, y);

    // Show edge buckets
    window.XBucketsUI?.showEdgeBuckets();

    // Lock scrolling and selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.classList.add('xb-dragging');
    document.body.style.overflow = 'hidden';
  },

  _createDragGhost(x, y) {
    // Remove any stale ghost
    document.getElementById('xb-drag-ghost')?.remove();

    const ghost = document.createElement('div');
    ghost.className = 'xb-drag-ghost';
    ghost.id = 'xb-drag-ghost';

    const icon = this.extractedData.type === 'tweet' ? '𝕏' : '💬';
    const text = this.extractedData.preview || 'Saved content';

    ghost.innerHTML = `
      <div class="xb-ghost-icon">${icon}</div>
      <div class="xb-ghost-text">${this._escapeHtml(text.substring(0, 50))}${text.length > 50 ? '…' : ''}</div>
    `;

    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';

    document.body.appendChild(ghost);
    this.dragGhost = ghost;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ghost.classList.add('xb-ghost-visible');
      });
    });
  },

  _moveDragGhost(x, y) {
    if (!this.dragGhost) return;
    this.dragGhost.style.left = x + 'px';
    this.dragGhost.style.top = y + 'px';
  },

  _endDrag(x, y) {
    const hoveredBucket = window.XBucketsUI?.getHoveredBucket(x, y);

    if (hoveredBucket && this.extractedData) {
      const bucketId = hoveredBucket.dataset.bucketId;
      this._saveItem(bucketId, this.extractedData, hoveredBucket);
    } else {
      this.cancelDrag();
    }
  },

  async _saveItem(bucketId, data, targetEl) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'addItemToBucket',
        bucketId: bucketId,
        item: data
      });

      if (response.success) {
        this._showDropSuccess(targetEl);
      } else {
        this._showDropError(targetEl, response.error);
      }
    } catch (err) {
      console.error('[X Buckets] Save error:', err);
      this._showDropError(targetEl, 'Failed to save');
    }

    this._cleanup();
  },

  _showDropSuccess(targetEl) {
    targetEl.classList.add('xb-edge-drop-success');
    setTimeout(() => {
      targetEl.classList.remove('xb-edge-drop-success');
      window.XBucketsUI?.hideEdgeBuckets();
    }, 1000);
  },

  _showDropError(targetEl, msg) {
    targetEl.classList.add('xb-edge-drop-error');
    setTimeout(() => {
      targetEl.classList.remove('xb-edge-drop-error');
      window.XBucketsUI?.hideEdgeBuckets();
    }, 1200);
  },

  cancelDrag() {
    this._cleanup();
    window.XBucketsUI?.hideEdgeBuckets();
  },

  _cleanup() {
    this.isDragging = false;
    this.extractedData = null;

    if (this.activeElement) {
      this.activeElement.style.transform = '';
      this.activeElement.style.opacity = '';
      this.activeElement.style.filter = '';
      const el = this.activeElement;
      setTimeout(() => { el.style.transition = ''; }, 300);
    }
    this.activeElement = null;

    if (this.dragGhost) {
      this.dragGhost.classList.add('xb-ghost-dropping');
      const ghost = this.dragGhost;
      setTimeout(() => ghost.remove(), 300);
      this.dragGhost = null;
    }

    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    document.body.classList.remove('xb-dragging');
    document.body.style.overflow = '';
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

window.XBucketsDragHandler = XBucketsDragHandler;
