(function (global) {
  const pending = new Map();
  let frame = null;
  let frameOrigin = '';
  let framePromise = null;
  let resolveFrameReady = null;
  let sequence = 0;

  function failure(message, code) {
    return { success: false, code: code || 'BACKEND_UNAVAILABLE', message };
  }

  function directAppsScriptCall(method, args) {
    return new Promise(resolve => {
      try {
        const runner = global.google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(error => resolve(failure(error && error.message || 'Backend request failed')));
        runner[method].apply(runner, args);
      } catch (error) {
        resolve(failure(error && error.message || 'Backend request failed'));
      }
    });
  }

  function isTrustedBackendOrigin(origin) {
    return origin === 'https://script.google.com' ||
      /^https:\/\/(?:[a-z0-9-]+\.)?script\.googleusercontent\.com$/i.test(origin);
  }

  function receiveMessage(event) {
    if (!frame || event.source !== frame.contentWindow || !isTrustedBackendOrigin(event.origin)) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'gas-bridge-ready' && message.nonce === frame.dataset.nonce) {
      frameOrigin = event.origin;
      if (resolveFrameReady) {
        const resolve = resolveFrameReady;
        resolveFrameReady = null;
        resolve();
      }
      return;
    }

    if (event.origin !== frameOrigin || message.type !== 'gas-bridge-result' || typeof message.id !== 'string') return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    request.resolve(message.result);
  }

  function connect() {
    if (global.google && global.google.script && global.google.script.run) return Promise.resolve(null);
    if (framePromise) return framePromise;

    const configuredUrl = global.APP_CONFIG && global.APP_CONFIG.appsScriptUrl;
    let backendUrl;
    try {
      if (!configuredUrl || configuredUrl.indexOf('PASTE_') === 0) {
        throw new Error('Set appsScriptUrl to the deployed Apps Script /exec URL in frontend/js/config.js.');
      }
      backendUrl = new URL(configuredUrl);
      if (backendUrl.protocol !== 'https:' || backendUrl.hostname !== 'script.google.com' ||
          !/^\/macros\/(?:u\/\d+\/)?s\/[^/]+\/exec$/.test(backendUrl.pathname)) {
        throw new Error('Configure appsScriptUrl with the deployed Apps Script /exec URL in frontend/js/config.js.');
      }
    } catch (error) {
      return Promise.reject(error);
    }

    framePromise = new Promise((resolve, reject) => {
      const nonce = 'b' + Date.now().toString(36) + (++sequence).toString(36) +
        Math.random().toString(36).slice(2);
      frame = document.createElement('iframe');
      frame.title = 'Apps Script backend connection';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.dataset.nonce = nonce;
      frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;bottom:0;border:0;opacity:0;pointer-events:none';
      const timeout = setTimeout(() => {
        global.removeEventListener('message', receiveMessage);
        if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        frame = null;
        frameOrigin = '';
        resolveFrameReady = null;
        framePromise = null;
        reject(new Error('Could not connect to Apps Script. Check the web app URL, deployment access, and FRONTEND_URL setting.'));
      }, 20000);
      resolveFrameReady = () => {
        clearTimeout(timeout);
        resolve(frame);
      };
      frame.onerror = () => {
        clearTimeout(timeout);
        global.removeEventListener('message', receiveMessage);
        if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        frame = null;
        frameOrigin = '';
        framePromise = null;
        resolveFrameReady = null;
        reject(new Error('Could not load the Apps Script bridge.'));
      };
      global.addEventListener('message', receiveMessage);
      backendUrl.searchParams.set('bridge', '1');
      backendUrl.searchParams.set('nonce', nonce);
      frame.src = backendUrl.toString();
      document.body.appendChild(frame);
    });
    return framePromise;
  }

  function request(method, ...args) {
    if (global.google && global.google.script && global.google.script.run) {
      return directAppsScriptCall(method, args);
    }

    return connect().then(() => new Promise(resolve => {
      const id = 'r' + Date.now().toString(36) + (++sequence).toString(36);
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(failure('Apps Script request timed out. Please try again.', 'TIMEOUT'));
      }, 300000);
      pending.set(id, { resolve, timer });
      try {
        frame.contentWindow.postMessage({ type: 'gas-bridge-call', id, method, args }, frameOrigin);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        resolve(failure('Could not send request to Apps Script.'));
      }
    })).catch(error => failure(error.message || 'Could not connect to Apps Script.'));
  }

  global.AppBackend = { request };
})(window);
