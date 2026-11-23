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

  function ext() {
    return ns.api && ns.api.raw;
  }

  function dnr() {
    var e = ext();
    return e && e.declarativeNetRequest && typeof e.declarativeNetRequest.updateSessionRules === 'function'
      ? e.declarativeNetRequest
      : null;
  }

  async function readSessionCookie(seerrUrl) {
    var e = ext();
    if (!e || !e.cookies || typeof e.cookies.getAll !== 'function' || !seerrUrl) {
      return null;
    }
    try {
      var cookies = await ns.api.call(e.cookies, 'getAll', [{ url: seerrUrl + '/' }]);
      var match = (cookies || []).find(function (c) {
        return c && c.name === COOKIE_NAME;
      });
      return match ? match.value : null;
    } catch (_err) {
      return null;
    }
  }

  async function removeRule() {
    var api = dnr();
    lastRuleValue = null;
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
      return true;
    } catch (_err) {
      // Without the tab limit the rule would reach web pages too; rely on the browser instead.
      lastRuleValue = null;
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
    watchCookies: watchCookies,
    removeRule: removeRule
  };
})(globalThis);
