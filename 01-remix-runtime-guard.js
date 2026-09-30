(function() {
  if (window.__remixRuntimeNetworkGuardInstalled) return;
  window.__remixRuntimeNetworkGuardInstalled = true;

  // Older SDK bundles accept any window message. A sibling game can hold a
  // WindowProxy even though the browser forbids reading its DOM. Filter real
  // cross-window messages before those SDK listeners run; only this game's
  // parent may supply host events. Keep self-posted library messages working.
  // Native WebViews are top-level and inject their own source-less messages.
  if (window.top !== window && typeof window.addEventListener === 'function') {
    window.addEventListener('message', function(event) {
      if (event.source && event.source !== window.parent && event.source !== window) {
        event.stopImmediatePropagation();
      }
    }, true);
  }

  const allowExternalHosts = false;

  const esmShUnscopedPackages = ["phaser","three","pixi","pixijs","playcanvas","cannon-es","cannon","crashcat"];
  const esmShScopedPrefixes = ["@babylonjs/","@remix-gg/","@farcade/"];

  const allowedHostPatterns = [
    /(^|\.)remix\.gg$/i,
    /(^|\.)remix-gg\.workers\.dev$/i,
    /(^|\.)vercel-storage\.com$/i,
    /(^|\.)vercel\.storage$/i,
    /(^|\.)farcade\.com$/i,
    /^cdn\.jsdelivr\.net$/i,
    /^cdn\.babylonjs\.com$/i,
    /^esm\.sh$/i,
    /^raw\.githack\.com$/i,
    /^cdn\.statically\.io$/i,
    /^cdnjs\.cloudflare\.com$/i,
    /^fonts\.googleapis\.com$/i,
    /^fonts\.gstatic\.com$/i,
  ];

  function isAllowedDictionaryPath(pathname) {
    return /(?:words?[_-]?alpha|wordlist|dictionary|enable1|word\s*list).*\.txt$/i.test(pathname);
  }

  function isAllowedJsdelivrPath(pathname) {
    if (new RegExp("^\\/npm\\/(?:@remix-gg\\/|@farcade\\/|phaser(?:@|\\/|$)|three(?:@|\\/|$)|pixi(?:js)?(?:@|\\/|$)|@babylonjs\\/|playcanvas(?:@|\\/|$)|cannon-es(?:@|\\/|$)|cannon(?:@|\\/|$)|crashcat(?:@|\\/|$))", 'i').test(pathname)) {
      return true;
    }

    if (/^\/gh\//i.test(pathname)) {
      return isAllowedDictionaryPath(pathname);
    }

    return false;
  }

  function isAllowedBabylonjsCdnPath(pathname) {
    if (pathname.includes('..')) return false;
    return new RegExp("^\\/(?:babylon(?:[-\\d.]+)?(?:\\.(?:max|min|lite))?\\.js|loaders\\/babylonjs\\.loaders(?:\\.min)?\\.js|(?:gui|materialsLibrary|serializers|postProcessLibrary|proceduralTexturesLibrary)\\/[^/?#]+\\.js)$", 'i').test(pathname);
  }

  function isAllowedEsmShPath(pathname) {
    if (pathname.includes('..')) return false;

    const scoped = pathname.match(/^\/(@[^/@]+)\/([^/@]+)(?:@([^/?#]+))?(?:\/(.*))?$/);
    const pkg = scoped
      ? (scoped[1] + '/' + scoped[2]).toLowerCase()
      : (pathname.match(/^\/([^/@]+)(?:@([^/?#]+))?(?:\/(.*))?$/) || [])[1]?.trim().toLowerCase();

    if (!pkg) return false;
    if (esmShUnscopedPackages.indexOf(pkg) !== -1) return true;
    return esmShScopedPrefixes.some(function(prefix) { return pkg.indexOf(prefix) === 0; });
  }

  function resolveUrl(target) {
    try {
      return new URL(String(target), document.baseURI || window.location.href);
    } catch (_error) {
      return null;
    }
  }

  const blockedRemixApiPathPatterns = [
    /^\/api(\/|$)/i,
    /^\/trpc(\/|$)/i,
  ];

  function isBlockedRemixApiPath(hostname, pathname) {
    hostname = hostname.replace(/\.$/, '');
    if (!/(^|\.)remix\.gg$/i.test(hostname)) return false;
    try { pathname = decodeURIComponent(pathname).replace(/\\/g, '/'); }
    catch (_error) { return true; }
    if (hostname.toLowerCase() === 'api.remix.gg') return !/^\/versions\/[^/]+\/?$/i.test(pathname);
    return blockedRemixApiPathPatterns.some((pattern) => pattern.test(pathname));
  }

  function isAllowedTarget(target) {
    const raw = String(target || '').trim();
    if (!raw) return true;
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return true;

    const resolved = resolveUrl(raw);
    if (!resolved) return false;

    // Block /api and /trpc on any remix.gg host, regardless of the iframe's origin.
    // This one holds for every game, desktop included: it is the same-origin
    // credential path, and no peer-to-peer game needs it.
    if (isBlockedRemixApiPath(resolved.hostname, resolved.pathname)) return false;

    // Everything below is the CDN allowlist, which is what a signalling socket
    // trips. A desktop-only game is past it.
    if (allowExternalHosts) return true;

    if (resolved.origin === window.location.origin) return true;
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return false;
    if (!allowedHostPatterns.some((pattern) => pattern.test(resolved.hostname))) return false;

    if (resolved.hostname === 'cdn.jsdelivr.net') {
      return isAllowedJsdelivrPath(resolved.pathname);
    }

    if (resolved.hostname === 'cdn.babylonjs.com') {
      return isAllowedBabylonjsCdnPath(resolved.pathname);
    }

    if (resolved.hostname === 'esm.sh') {
      return isAllowedEsmShPath(resolved.pathname);
    }

    if (resolved.hostname === 'raw.githack.com' || resolved.hostname === 'cdn.statically.io') {
      return isAllowedDictionaryPath(resolved.pathname);
    }

    if (resolved.hostname === 'cdnjs.cloudflare.com') {
      return /^\/ajax\/libs\//i.test(resolved.pathname);
    }

    return true;
  }

  function blockedError(kind, target) {
    const message = '[RemixSecurity] Blocked ' + kind + ' request to ' + target;
    try {
      console.warn(message);
    } catch (_error) {}
    return new Error(message);
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function(input) {
      const target =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : String(input || '');

      if (!isAllowedTarget(target)) {
        return Promise.reject(blockedError('fetch', target));
      }

      return originalFetch.apply(this, arguments);
    };
  }

  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
      if (!isAllowedTarget(url)) {
        throw blockedError('XMLHttpRequest', url);
      }
      return originalOpen.apply(this, arguments);
    };
  }

  if (navigator && typeof navigator.sendBeacon === 'function') {
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      if (!isAllowedTarget(url)) {
        blockedError('sendBeacon', url);
        return false;
      }
      return originalSendBeacon(url, data);
    };
  }

  if (window.WebSocket) {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      if (!isAllowedTarget(url)) {
        throw blockedError('WebSocket', url);
      }
      return protocols === undefined ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  }

  if (window.EventSource) {
    const OriginalEventSource = window.EventSource;
    window.EventSource = function(url, config) {
      if (!isAllowedTarget(url)) {
        throw blockedError('EventSource', url);
      }
      return config === undefined ? new OriginalEventSource(url) : new OriginalEventSource(url, config);
    };
    window.EventSource.prototype = OriginalEventSource.prototype;
  }
})();