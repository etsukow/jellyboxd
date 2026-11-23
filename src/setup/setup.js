(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;
  var params = new URLSearchParams(global.location.search);

  var $ = function (id) {
    return document.getElementById(id);
  };
  var steps = { address: $('stepAddress'), wait: $('stepWait'), done: $('stepDone') };
  var urlInput = $('seerrUrl');
  var apiKeyInput = $('apiKey');
  var apiKeyField = $('apiKeyField');
  var addressLead = $('addressLead');
  var addressHint = $('addressHint');
  var addressStatus = $('addressStatus');
  var submitBtn = $('submitBtn');
  var methodBtn = $('methodBtn');
  var closeBtn = $('closeBtn');
  var waitText = $('waitText');
  var waitBox = $('waitBox');

  var method = 'cookie';
  var busy = false;
  var attempt = 0;
  var currentUrl = '';

  function show(name) {
    Object.keys(steps).forEach(function (key) {
      steps[key].hidden = key !== name;
    });
    closeBtn.textContent = name === 'done' ? 'Close' : 'Not now';
  }

  function setError(text) {
    addressStatus.textContent = text || '';
    addressStatus.hidden = !text;
  }

  function setMethod(next) {
    method = next === 'apiKey' ? 'apiKey' : 'cookie';
    var key = method === 'apiKey';
    apiKeyField.hidden = !key;
    addressLead.hidden = key;
    addressHint.hidden = key;
    submitBtn.textContent = key ? 'Connect' : 'Sign in on Seerr';
    methodBtn.textContent = key ? 'Sign in with my account instead' : 'I’m an admin, use an API key';
    setError('');
  }

  function hostOf(url) {
    return String(url || '').replace(/^https?:\/\//, '');
  }

  function finish(user) {
    var name = (user && user.displayName) || 'You';
    $('doneAvatar').textContent = name.charAt(0).toUpperCase();
    $('doneName').textContent = name;
    $('doneHost').textContent = method === 'apiKey' ? 'Connected to ' + hostOf(currentUrl) + ' with an API key' : 'Signed in to ' + hostOf(currentUrl);
    show('done');
    $('doneBtn').focus();
  }

  methodBtn.addEventListener('click', function () {
    if (!busy) {
      setMethod(method === 'apiKey' ? 'cookie' : 'apiKey');
      (method === 'apiKey' ? apiKeyInput : urlInput).focus();
    }
  });

  closeBtn.addEventListener('click', function () {
    global.close();
  });

  $('doneBtn').addEventListener('click', function () {
    global.close();
  });

  $('settingsBtn').addEventListener('click', function () {
    ns.api.openOptionsPage().then(function () {
      global.close();
    });
  });

  $('showTabBtn').addEventListener('click', function () {
    if (currentUrl) {
      ns.connect.openSeerrTab(currentUrl);
    }
  });

  $('backBtn').addEventListener('click', function () {
    attempt += 1; // stops the waiting loop
    busy = false;
    submitBtn.disabled = false;
    show('address');
    urlInput.focus();
  });

  steps.address.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    var seerrUrl = ns.utils.normalizeBaseUrl(urlInput.value);
    var pattern = seerrUrl ? ns.utils.buildOriginPattern(seerrUrl) : '';
    if (!pattern) {
      setError('Enter your Seerr address, for example https://seerr.example.com.');
      urlInput.focus();
      return;
    }
    if (method === 'apiKey' && !apiKeyInput.value.trim()) {
      setError('Enter your Seerr API key.');
      apiKeyInput.focus();
      return;
    }

    // Must be the first await of the click: browsers only show the prompt during a user action.
    var granted = await ns.api.permissionsRequest(
      method === 'apiKey' ? [pattern] : ns.utils.buildSessionPatterns(seerrUrl)
    );
    if (!granted) {
      setError('Jellyboxd needs access to ' + hostOf(seerrUrl) + ' to work.');
      return;
    }

    currentUrl = seerrUrl;
    busy = true;
    submitBtn.disabled = true;
    setError('');
    try {
      if (method === 'apiKey') {
        var res = await ns.api.sendMessage({
          type: MSG.SETUP_SIGNIN,
          payload: { seerrUrl: seerrUrl, method: 'apiKey', apiKey: apiKeyInput.value }
        });
        if (res && res.ok) {
          finish(res.user);
          return;
        }
        setError((res && res.error) || 'Seerr refused this API key.');
      } else {
        attempt += 1;
        var mine = attempt;
        $('waitHost').textContent = hostOf(seerrUrl);
        var done = await ns.connect.signInWithSession(
          seerrUrl,
          function (state, detail) {
            if (mine !== attempt) {
              return;
            }
            if (state === 'waiting') {
              waitBox.classList.remove('is-err');
              waitText.textContent = 'Waiting for your sign-in…';
              show('wait');
            } else if (state === 'signed-in') {
              finish(detail);
            } else if (state === 'error') {
              show('address');
              setError(detail);
            } else if (state === 'timeout') {
              waitBox.classList.add('is-err');
              waitText.textContent = 'Still no Seerr session. Sign in on Seerr, then go back and try again.';
            }
          },
          function () {
            return mine !== attempt;
          }
        );
        if (done) {
          return;
        }
      }
    } catch (err) {
      show('address');
      setError((err && err.message) || 'Something went wrong. Try again.');
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
    var seerrUrl = currentUrl || ns.utils.normalizeBaseUrl(urlInput.value);
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
  setMethod('cookie');
  show('address');
  ns.api
    .sendMessage({ type: MSG.GET_CONFIG })
    .then(function (res) {
      var s = res && res.settings;
      if (s && !urlInput.value) {
        urlInput.value = s.seerrUrl || '';
      }
      if (s && s.authMode === 'apiKey') {
        setMethod('apiKey');
      }
    })
    .catch(function () {});
  (urlInput.value ? submitBtn : urlInput).focus();
})(globalThis);
