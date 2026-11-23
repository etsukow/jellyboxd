(function (global) {
  'use strict';

  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var hasBrowserNs = typeof global.browser !== 'undefined' && global.browser !== null;
  var ext = hasBrowserNs ? global.browser : global.chrome;

  function callApi(target, method, args) {
    if (!target || typeof target[method] !== 'function') {
      return Promise.reject(new Error('API navigateur indisponible : ' + method));
    }

    if (hasBrowserNs) {
      try {
        return Promise.resolve(target[method].apply(target, args || []));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return new Promise(function (resolve, reject) {
      try {
        var finalArgs = (args || []).slice();
        finalArgs.push(function (result) {
          var lastErr = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastErr) {
            reject(new Error(lastErr.message || 'Erreur API Chrome'));
            return;
          }
          resolve(result);
        });
        target[method].apply(target, finalArgs);
      } catch (err) {
        reject(err);
      }
    });
  }

  function storageGet(keys) {
    return callApi(ext.storage.local, 'get', [keys]);
  }

  function storageSet(obj) {
    return callApi(ext.storage.local, 'set', [obj]);
  }

  function storageRemove(keys) {
    return callApi(ext.storage.local, 'remove', [keys]);
  }

  function permissionsContains(origins) {
    if (!Array.isArray(origins) || origins.length === 0) {
      return Promise.resolve(true);
    }
    if (!ext.permissions || typeof ext.permissions.contains !== 'function') {
      return Promise.resolve(true);
    }
    return callApi(ext.permissions, 'contains', [{ origins: origins }]);
  }

  // IMPORTANT : doit être appelé de façon synchrone dans un gestionnaire de clic (règle Firefox)
  function permissionsRequest(origins) {
    if (!Array.isArray(origins) || origins.length === 0) {
      return Promise.resolve(true);
    }
    if (!ext.permissions || typeof ext.permissions.request !== 'function') {
      return Promise.resolve(true);
    }
    return callApi(ext.permissions, 'request', [{ origins: origins }]);
  }

  function sendMessage(message) {
    return callApi(ext.runtime, 'sendMessage', [message]);
  }

  function openOptionsPage() {
    return callApi(ext.runtime, 'openOptionsPage', []);
  }

  function createTab(url) {
    if (ext.tabs && typeof ext.tabs.create === 'function') {
      return callApi(ext.tabs, 'create', [{ url: url }]);
    }
    return Promise.reject(new Error('API tabs indisponible'));
  }

  ns.api = {
    raw: ext,
    isFirefoxNamespace: hasBrowserNs,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    permissionsContains: permissionsContains,
    permissionsRequest: permissionsRequest,
    sendMessage: sendMessage,
    openOptionsPage: openOptionsPage,
    createTab: createTab
  };
})(globalThis);
