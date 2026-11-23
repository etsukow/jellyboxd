(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;
  var params = new URLSearchParams(global.location.search);

  var form = document.getElementById('setupForm');
  var urlInput = document.getElementById('seerrUrl');
  var methodGroup = document.getElementById('method');
  var sessionHelp = document.getElementById('sessionHelp');
  var apiKeyField = document.getElementById('apiKeyField');
  var apiKeyInput = document.getElementById('apiKey');
  var submitBtn = document.getElementById('submitBtn');
  var statusLine = document.getElementById('status');
  var closeBtn = document.getElementById('closeBtn');

  var method = 'cookie';
  var busy = false;

  function setStatus(text, kind) {
    statusLine.textContent = text || '';
    statusLine.hidden = !text;
    statusLine.className = 'dark-state' + (kind === 'ok' ? ' is-ok' : kind === 'err' ? ' is-err' : '');
  }

  function setMethod(next) {
    method = next === 'apiKey' ? 'apiKey' : 'cookie';
    methodGroup.querySelectorAll('button[data-method]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-method') === method ? 'true' : 'false');
    });
    apiKeyField.hidden = method !== 'apiKey';
    sessionHelp.hidden = method === 'apiKey';
    submitBtn.textContent = method === 'apiKey' ? 'Connect' : 'Sign in on Seerr';
    setStatus('');
  }

  function finish(user) {
    setStatus('Signed in as ' + ((user && user.displayName) || 'you') + '. You can close this window.', 'ok');
    submitBtn.disabled = true;
    setTimeout(function () {
      global.close();
    }, 1500);
  }

  methodGroup.addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-method]');
    if (btn && !busy) {
      setMethod(btn.getAttribute('data-method'));
    }
  });

  closeBtn.addEventListener('click', function () {
    global.close();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    var seerrUrl = ns.utils.normalizeBaseUrl(urlInput.value);
    var pattern = seerrUrl ? ns.utils.buildOriginPattern(seerrUrl) : '';
    if (!pattern) {
      setStatus('Enter your Seerr address, for example https://seerr.example.com.', 'err');
      urlInput.focus();
      return;
    }
    if (method === 'apiKey' && !apiKeyInput.value.trim()) {
      setStatus('Enter your Seerr API key.', 'err');
      apiKeyInput.focus();
      return;
    }

    // Must be the first await of the click: browsers only show the prompt during a user action.
    var granted = await ns.api.permissionsRequest(
      method === 'apiKey' ? [pattern] : ns.utils.buildSessionPatterns(seerrUrl)
    );
    if (!granted) {
      setStatus('Jellyboxd needs access to ' + seerrUrl.replace(/^https?:\/\//, '') + ' to work.', 'err');
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    try {
      if (method === 'apiKey') {
        setStatus('Checking the key…');
        var res = await ns.api.sendMessage({
          type: MSG.SETUP_SIGNIN,
          payload: { seerrUrl: seerrUrl, method: 'apiKey', apiKey: apiKeyInput.value }
        });
        if (res && res.ok) {
          finish(res.user);
          return;
        }
        setStatus((res && res.error) || 'Seerr refused this API key.', 'err');
      } else {
        var done = await ns.connect.signInWithSession(seerrUrl, function (state, detail) {
          if (state === 'checking') {
            setStatus('Checking your Seerr session…');
          } else if (state === 'waiting') {
            setStatus('Sign in on the Seerr tab that just opened. This window updates by itself.');
          } else if (state === 'signed-in') {
            finish(detail);
          } else if (state === 'error') {
            setStatus(detail, 'err');
          } else if (state === 'timeout') {
            setStatus('No Seerr session yet. Sign in on Seerr, then try again.', 'err');
          }
        });
        if (done) {
          return;
        }
      }
    } catch (err) {
      setStatus((err && err.message) || 'Something went wrong. Try again.', 'err');
    }
    busy = false;
    submitBtn.disabled = false;
  });

  // Troubleshooting: the same checks from this window and from the background, values never shown.
  document.getElementById('diagBtn').addEventListener('click', async function () {
    var out = document.getElementById('diagOut');
    out.hidden = false;
    out.textContent = 'Checking…';
    var ext = ns.api.raw;
    var lines = ['Browser: ' + navigator.userAgent.replace(/.*(Version\/[\d.]+ Safari|Chrome\/[\d.]+|Firefox\/[\d.]+).*/, '$1')];
    var seerrUrl = ns.utils.normalizeBaseUrl(urlInput.value);
    var cookieValue = null;
    try {
      var stores = await ns.api.call(ext.cookies, 'getAllCookieStores', []).catch(function () {
        return [];
      });
      lines.push('Cookie stores: ' + stores.length + (stores.length ? ' (' + stores.map(function (s) { return s.id; }).join(', ') + ')' : ''));
      var ids = stores.length ? stores.map(function (s) { return s.id; }) : [null];
      for (var i = 0; i < ids.length; i += 1) {
        var q = { url: seerrUrl + '/' };
        if (ids[i] !== null) {
          q.storeId = ids[i];
        }
        var cookies = await ns.api.call(ext.cookies, 'getAll', [q]);
        var sid = (cookies || []).find(function (c) {
          return c.name === 'connect.sid';
        });
        lines.push('Store ' + ids[i] + ': ' + (cookies || []).length + ' cookies, session ' + (sid ? 'yes' : 'no'));
        if (sid && !cookieValue) {
          cookieValue = sid.value;
        }
      }
    } catch (err) {
      lines.push('Window cookies API: ' + err.message);
    }
    try {
      var me = await fetch(seerrUrl + '/api/v1/auth/me', { credentials: 'omit', cache: 'no-store' });
      lines.push('Window request to Seerr: ' + me.status);
    } catch (err) {
      lines.push('Window request to Seerr: ' + err.message);
    }
    try {
      var res = await ns.api.sendMessage({ type: MSG.DIAGNOSE, payload: { cookieFromPage: cookieValue } });
      var r = (res && res.report) || {};
      Object.keys(r).forEach(function (k) {
        lines.push('Background ' + k + ': ' + r[k]);
      });
    } catch (err) {
      lines.push('Background: ' + err.message);
    }
    out.textContent = lines.join('\n');
  });

  urlInput.value = params.get('seerr') || '';
  ns.api
    .sendMessage({ type: MSG.GET_CONFIG })
    .then(function (res) {
      var s = res && res.settings;
      if (s) {
        if (!urlInput.value) {
          urlInput.value = s.seerrUrl || '';
        }
        setMethod(s.authMode === 'apiKey' ? 'apiKey' : 'cookie');
      }
    })
    .catch(function () {});
  setMethod('cookie');
  (urlInput.value ? submitBtn : urlInput).focus();
})(globalThis);
