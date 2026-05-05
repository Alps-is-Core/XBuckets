// X Buckets — Content Extractor v2
// Robust extraction from tweets, comments, and XChat messages
// Works with X.com's React-rendered DOM

const XBucketsExtractor = {

  detectType(element) {
    if (this.isInDMView()) {
      const msg = this._findDMContainer(element);
      if (msg) return 'xchat_message';
    }
    const article = this._findTweetArticle(element);
    if (article) return 'tweet';
    return null;
  },

  isInDMView() {
    return window.location.pathname.startsWith('/messages');
  },

  /**
   * Walk up from any element to find the extractable parent.
   * X.com uses deep nesting so we need multiple selector strategies.
   */
  findExtractableElement(target) {
    if (!target || target === document.body || target === document.documentElement) return null;

    // In DMs
    if (this.isInDMView()) {
      const msg = this._findDMContainer(target);
      if (msg) return msg;
    }

    // Tweet / reply
    const article = this._findTweetArticle(target);
    if (article) return article;

    return null;
  },

  _findTweetArticle(el) {
    // Direct approach
    let article = el.closest('article[data-testid="tweet"]');
    if (article) return article;

    // Sometimes the click target is deep inside; walk up manually
    let node = el;
    let depth = 0;
    while (node && depth < 30) {
      if (node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet') {
        return node;
      }
      // Also check if we're inside a tweet's cellInnerDiv
      if (node.getAttribute('data-testid') === 'cellInnerDiv') {
        const inner = node.querySelector('article[data-testid="tweet"]');
        if (inner) return inner;
      }
      node = node.parentElement;
      depth++;
    }

    return null;
  },

  _findDMContainer(el) {
    // Try multiple selectors X.com uses for DM messages
    const selectors = [
      '[data-testid="messageEntry"]',
      '[data-testid="message"]',
      '[data-testid="cellInnerDiv"]',
      '[data-testid="DMMessageContainer"]'
    ];
    for (const sel of selectors) {
      const match = el.closest(sel);
      if (match) return match;
    }

    // Walk up looking for message-like containers
    let node = el;
    let depth = 0;
    while (node && depth < 20) {
      // DM messages often have role="row" or specific class patterns
      if (node.getAttribute('data-testid')?.includes('message') ||
          node.getAttribute('data-testid')?.includes('Message')) {
        return node;
      }
      node = node.parentElement;
      depth++;
    }

    // Fallback: in DM view, any cellInnerDiv is a message container
    return el.closest('[data-testid="cellInnerDiv"]');
  },

  extract(element) {
    const type = this.detectType(element);
    if (!type) return null;
    try {
      return type === 'tweet' ? this.extractTweet(element) : this.extractXChatMessage(element);
    } catch (err) {
      console.error('[X Buckets] Extraction error:', err);
      return null;
    }
  },

  extractTweet(element) {
    const article = this._findTweetArticle(element);
    if (!article) return null;

    const authorName = article.querySelector('[data-testid="User-Name"]')?.textContent || '';
    const authorLink = article.querySelector('[data-testid="User-Name"] a[role="link"]');
    const authorHandle = authorLink ? authorLink.getAttribute('href')?.replace('/', '') : '';
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    const textContent = tweetTextEl ? tweetTextEl.textContent : '';

    let url = '';
    // Strategy 1: Find /status/ links (most reliable)
    const timeLinks = article.querySelectorAll('a[href*="/status/"]');
    for (const link of timeLinks) {
      const href = link.getAttribute('href');
      if (href && href.match(/\/status\/\d+/)) {
        url = 'https://x.com' + href;
        break;
      }
    }
    // Strategy 2: Build from author handle + find status ID in time link
    if (!url && authorHandle) {
      const timeEl = article.querySelector('time');
      if (timeEl) {
        const parentA = timeEl.closest('a');
        if (parentA) {
          const href = parentA.getAttribute('href');
          if (href) url = 'https://x.com' + href;
        }
      }
    }

    const media = this.extractMedia(article);
    const timeEl = article.querySelector('time');
    const timestamp = timeEl ? timeEl.getAttribute('datetime') : '';

    return {
      type: 'tweet', url, textContent,
      authorName: this.cleanAuthorName(authorName), authorHandle, timestamp, media,
      preview: textContent.substring(0, 140) + (textContent.length > 140 ? '…' : '')
    };
  },

  extractXChatMessage(element) {
    const container = this._findDMContainer(element) || element;

    // Get text content from multiple possible locations
    const textEls = container.querySelectorAll(
      '[data-testid="tweetText"], [data-testid="messageText"], [dir="auto"] > span, [lang]'
    );
    let textContent = '';
    const seen = new Set();
    textEls.forEach(el => {
      const t = el.textContent?.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        textContent += (textContent ? '\n' : '') + t;
      }
    });
    if (!textContent) textContent = container.innerText?.trim() || '';

    const media = this.extractMedia(container);

    // Shared tweets
    const sharedTweets = [];
    container.querySelectorAll('a[href*="/status/"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const fullUrl = 'https://x.com' + (href.startsWith('/') ? '' : '/') + href;
        if (!sharedTweets.includes(fullUrl)) sharedTweets.push(fullUrl);
      }
    });

    const senderInfo = this.extractDMSenderInfo(container);
    const timeEl = container.querySelector('time');

    return {
      type: 'xchat_message', url: window.location.href, textContent,
      authorName: senderInfo.name, authorHandle: senderInfo.handle,
      timestamp: timeEl ? timeEl.getAttribute('datetime') : '',
      media, sharedTweets,
      preview: textContent.substring(0, 140) + (textContent.length > 140 ? '…' : '')
    };
  },

  extractMedia(container) {
    const media = [];
    const seen = new Set();

    // Images
    container.querySelectorAll(
      '[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com"], img[src*="ton.twimg.com"]'
    ).forEach(img => {
      const src = img.src;
      if (src && !src.includes('emoji') && !src.includes('profile_images') &&
          !src.includes('hashflag') && !seen.has(src)) {
        seen.add(src);
        media.push({
          type: 'image',
          url: src.replace(/&name=\w+/, '&name=large'),
          alt: img.alt || ''
        });
      }
    });

    // Videos
    container.querySelectorAll('video').forEach(video => {
      const src = video.src || video.querySelector('source')?.src;
      if (src && !seen.has(src)) {
        seen.add(src);
        media.push({ type: 'video', url: src, posterUrl: video.poster || '' });
      }
    });

    return media;
  },

  extractDMSenderInfo(container) {
    let name = '', handle = '';
    const avatarLink = container.querySelector('a[href^="/"][role="link"]');
    if (avatarLink) handle = avatarLink.getAttribute('href')?.replace('/', '') || '';

    // Get from page title: "User Name / X"
    const titleMatch = document.title.match(/(.+?) \/ X$/);
    if (titleMatch) name = titleMatch[1];

    // Fallback: conversation header
    if (!name) {
      const headerName = document.querySelector(
        '[data-testid="conversation_header"] [dir="ltr"] span'
      );
      if (headerName) name = headerName.textContent || '';
    }

    return { name, handle };
  },

  cleanAuthorName(raw) {
    // User-Name element: "Display Name@handle · 4h" → extract just display name
    const atIndex = raw.indexOf('@');
    if (atIndex > 0) return raw.substring(0, atIndex).trim();
    return raw.trim();
  }
};

window.XBucketsExtractor = XBucketsExtractor;
