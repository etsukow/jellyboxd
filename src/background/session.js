(function (global) {
  'use strict';

  // Seerr session bridge.
  //
  // Seerr signs users in with an httpOnly session cookie marked SameSite=Lax. Browsers that do not
  // exempt extensions from SameSite (Safari) never attach it to the extension's requests, so the
  // user would always look signed out. The user signs in on Seerr's own site; this module reads
  // that cookie through the cookies API and adds it, with a session network rule, to the
  // extension's own requests only (tabIds: [-1]). Web pages never get the cookie through it.

  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var RULE_ID = 1;
  var COOKIE_NAME = 'connect.sid';
  var lastRuleValue = null;
  var ruleActive = false;

  function ext() {
    return ns.api && ns.api.raw;
  }

  function dnr() {
    var e = ext();
    return e && e.declarativeNetRequest && typeof e.declarativeNetRequest.updateSessionRules === 'function'
      ? e.declarativeNetRequest
      : null;
  }

  // Cookie stores to search. Browsers keep one per profile (Safari profiles, Firefox containers)
  // and the background reads the default one unless told otherwise.
  async function cookieStores() {
    var e = ext();
    try {
      var stores = await ns.api.call(e.cookies, 'getAllCookieStores', []);
      var ids = (stores || []).map(function (s) {
        return s && s.id;
      }).filter(function (id) {
        return id !== undefined && id !== null;
      });
      return ids.length ? ids : [null];
    } catch (_err) {
      return [null];
    }
  }

  // Returns { value, store, stores } for the first session cookie found in any store.
  async function findSessionCookie(seerrUrl) {
    var e = ext();
    var result = { value: null, store: null, stores: 0 };
    if (!e || !e.cookies || typeof e.cookies.getAll !== 'function' || !seerrUrl) {
      return result;
    }
    var stores = await cookieStores();
    result.stores = stores.length;
    for (var i = 0; i < stores.length; i += 1) {
      var query = { url: seerrUrl + '/' };
      if (stores[i] !== null) {
        query.storeId = stores[i];
      }
      try {
        var cookies = await ns.api.call(e.cookies, 'getAll', [query]);
        var match = (cookies || []).find(function (c) {
          return c && c.name === COOKIE_NAME;
        });
        if (match) {
          result.value = match.value;
          result.store = stores[i];
          return result;
        }
      } catch (_err) {
        // Try the next store.
      }
    }
    return result;
  }

  async function readSessionCookie(seerrUrl) {
    return (await findSessionCookie(seerrUrl)).value;
  }

  async function removeRule() {
    var api = dnr();
    lastRuleValue = null;
    ruleActive = false;
    if (!api) {
      return;
    }
    try {
      await ns.api.call(api, 'updateSessionRules', [{ removeRuleIds: [RULE_ID] }]);
    } catch (_err) {
      // Nothing to remove.
    }
  }

  async function setRule(seerrUrl, value) {
    var api = dnr();
    if (!api) {
      return false;
    }
    if (lastRuleValue === seerrUrl + '\n' + value) {
      ruleActive = true;
      return true;
    }
    var rule = {
      id: RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'cookie', operation: 'set', value: COOKIE_NAME + '=' + value }]
      },
      condition: {
        urlFilter: '|' + seerrUrl + '/api/',
        resourceTypes: ['xmlhttprequest', 'other'],
        // -1: requests that do not come from a tab, i.e. this extension's background.
        tabIds: [-1]
      }
    };
    try {
      await ns.api.call(api, 'updateSessionRules', [{ removeRuleIds: [RULE_ID], addRules: [rule] }]);
      lastRuleValue = seerrUrl + '\n' + value;
      ruleActive = true;
      return true;
    } catch (_err) {
      // Without the tab limit the rule would reach web pages too; rely on the browser instead.
      lastRuleValue = null;
      ruleActive = false;
      return false;
    }
  }

  // Keeps the network rule in step with the settings and the cookie jar.
  // Returns true when a Seerr session cookie exists for the configured server.
  async function syncSession(settings) {
    var seerrUrl = settings && settings.seerrUrl;
    if (!seerrUrl || settings.authMode !== 'cookie') {
      await removeRule();
      return false;
    }
    var value = await readSessionCookie(seerrUrl);
    if (!value) {
      await removeRule();
      return false;
    }
    await setRule(seerrUrl, value);
    return true;
  }

  function watchCookies(loadSettings) {
    var e = ext();
    if (!e || !e.cookies || !e.cookies.onChanged) {
      return;
    }
    e.cookies.onChanged.addListener(function (change) {
      if (!change || !change.cookie || change.cookie.name !== COOKIE_NAME) {
        return;
      }
      loadSettings().then(function (settings) {
        if (!settings.seerrUrl) {
          return;
        }
        var host = '';
        try {
          host = new URL(settings.seerrUrl).hostname;
        } catch (_err) {
          return;
        }
        var domain = String(change.cookie.domain || '').replace(/^\./, '');
        if (domain === host || host.endsWith('.' + domain)) {
          syncSession(settings);
        }
      });
    });
  }

  ns.session = {
    syncSession: syncSession,
    readSessionCookie: readSessionCookie,
    findSessionCookie: findSessionCookie,
    setRule: setRule,
    // True while the network rule carries the session cookie.
    isRuleActive: function () {
      return ruleActive;
    },
    watchCookies: watchCookies,
    removeRule: removeRule
  };
})(globalThis);
