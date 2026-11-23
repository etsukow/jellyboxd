(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;

  function $(id) {
    return document.getElementById(id);
  }

  var el = {
    saveState: $('saveState'),
    seerrTicket: $('seerrTicket'),
    seerrState: $('seerrState'),
    seerrUrl: $('seerrUrl'),
    method: $('method'),
    sessionPanel: $('sessionPanel'),
    apiKeyPanel: $('apiKeyPanel'),
    seerrApiKey: $('seerrApiKey'),
    showKey: $('showKey'),
    seerrUserId: $('seerrUserId'),
    loadUsers: $('loadUsers'),
    seerrAction: $('seerrAction'),
    jellyfinTicket: $('jellyfinTicket'),
    jellyfinState: $('jellyfinState'),
    jellyfinUrl: $('jellyfinUrl'),
    jellyfinApiKey: $('jellyfinApiKey'),
    jellyfinAction: $('jellyfinAction'),
    styleCards: $('styleCards'),
    preview: $('preview'),
    refreshProfiles: $('refreshProfiles'),
    prefServer: $('prefServer'),
    prefProfile: $('prefProfile'),
    prefFolder: $('prefFolder'),
    rememberLastProfile: $('rememberLastProfile'),
    expandAdvancedByDefault: $('expandAdvancedByDefault'),
    enableTvSupport: $('enableTvSupport'),
    clearCache: $('clearCache'),
    resetAll: $('resetAll')
  };

  var settings = Object.assign({}, ns.DEFAULT_SETTINGS);
  var method = 'cookie';
  var widgetStyle = 'ticket';
  var servers = [];
  var servicesLoaded = false;
  var saveTimer = null;
  var resetTimer = null;
  var signedIn = false;

  function send(type, payload) {
    return ns.api.sendMessage({ type: type, payload: payload || {} });
  }

  function setSaveState(text) {
    el.saveState.textContent = text;
  }

  function setLineState(node, text, kind) {
    node.textContent = text;
    node.className = 'gt-state' + (kind === 'ok' ? ' is-ok' : kind === 'err' ? ' is-err' : '');
  }

  /* ---------- previews: the real widget, rendered with its own stylesheet ---------- */

  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20" fill="currentColor"/></svg>';
  var PREVIEWS = {
    ticket:
      '<div class="lbx-t lbx-t-go"><div class="lbx-t-top"><div class="lbx-t-line"><span>Jellyfin</span><span>Jellyboxd</span></div>' +
      '<div class="lbx-t-head">Now showing</div><div class="lbx-t-fields"><div class="lbx-t-cell"><small>Quality</small><b>1080p</b></div>' +
      '<div class="lbx-t-cell"><small>Added</small><b>12 Nov</b></div></div></div><div class="lbx-t-perf"></div>' +
      '<span class="lbx-t-stub">' + PLAY + '<span>Watch on Jellyfin</span></span></div>',
    native:
      '<div class="lbx-n"><span class="lbx-n-row lbx-n-action lbx-n-stack"><span class="lbx-n-line"><span class="lbx-n-icon">' + PLAY +
      '</span><span>Watch on Jellyfin</span></span><span class="lbx-n-sub">1080p · added 12 Nov</span></span>' +
      '<div class="lbx-n-foot"><span>Open in Seerr</span><span>Refresh</span><span>Settings</span></div></div>'
  };

  function loadPreviewStyles() {
    // The widget's stylesheet targets #lbx-seerr-root; previews use a class so several can coexist.
    fetch('../content/letterboxd.css')
      .then(function (r) {
        return r.text();
      })
      .then(function (css) {
        var style = document.createElement('style');
        style.textContent = css.split('#lbx-seerr-root').join('.lbx-prev-root');
        document.head.appendChild(style);
      })
      .catch(function () {});
    el.styleCards.querySelectorAll('[data-prev]').forEach(function (slot) {
      var kind = slot.getAttribute('data-prev');
      slot.innerHTML = '<div class="lbx-prev-root lbx-w lbx-w-' + kind + '">' + PREVIEWS[kind] + '</div>';
    });
  }

  function setStyle(next) {
    widgetStyle = next === 'native' ? 'native' : 'ticket';
    el.styleCards.querySelectorAll('[data-style]').forEach(function (card) {
      card.setAttribute('aria-pressed', card.getAttribute('data-style') === widgetStyle ? 'true' : 'false');
    });
    el.preview.className = 'lbx-prev-root lbx-w lbx-w-' + widgetStyle;
    el.preview.innerHTML = PREVIEWS[widgetStyle];
  }

  /* ---------- form <-> settings ---------- */

  function setMethod(next) {
    method = next === 'apiKey' ? 'apiKey' : 'cookie';
    el.method.querySelectorAll('[data-method]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-method') === method ? 'true' : 'false');
    });
    el.apiKeyPanel.hidden = method !== 'apiKey';
    el.sessionPanel.hidden = method === 'apiKey';
    updateSeerrAction();
  }

  function updateSeerrAction() {
    if (method === 'apiKey') {
      el.seerrAction.textContent = signedIn ? 'Check the key again' : 'Check API key';
    } else {
      el.seerrAction.textContent = signedIn ? 'Sign in on Seerr again' : 'Sign in on Seerr';
    }
    el.seerrTicket.classList.toggle('is-ask', !signedIn);
  }

  function option(value, text, selected) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    if (selected) {
      o.selected = true;
    }
    return o;
  }

  function fillSelect(select, first, items) {
    select.textContent = '';
    select.appendChild(first);
    items.forEach(function (o) {
      select.appendChild(o);
    });
  }

  function selectedServer() {
    var id = el.prefServer.value;
    return servers.find(function (s) {
      return String(s.id) === id;
    }) || null;
  }

  function fillServerDetails() {
    var srv = selectedServer();
    var profiles = srv && Array.isArray(srv.profiles) ? srv.profiles : [];
    var folders = srv && Array.isArray(srv.rootFolders) ? srv.rootFolders : [];
    fillSelect(
      el.prefProfile,
      option('', 'Server default'),
      profiles.map(function (p) {
        return option(String(p.id), p.name, Number(p.id) === Number(settings.defaultRadarrProfileId));
      })
    );
    fillSelect(
      el.prefFolder,
      option('', 'Server default'),
      folders.map(function (f) {
        return option(f.path, f.path, f.path === settings.defaultRadarrRootFolder);
      })
    );
  }

  function fillServers() {
    fillSelect(
      el.prefServer,
      option('', 'Pick automatically'),
      servers.map(function (s) {
        return option(String(s.id), s.name + (s.is4k ? ' (4K)' : ''), Number(s.id) === Number(settings.defaultRadarrServerId));
      })
    );
    fillServerDetails();
  }

  function collect() {
    var out = {
      seerrUrl: el.seerrUrl.value.trim(),
      authMode: method,
      seerrApiKey: el.seerrApiKey.value.trim(),
      seerrUserId: el.seerrUserId.value,
      jellyfinUrl: el.jellyfinUrl.value.trim(),
      jellyfinApiKey: el.jellyfinApiKey.value.trim(),
      widgetStyle: widgetStyle,
      rememberLastProfile: el.rememberLastProfile.checked,
      expandAdvancedByDefault: el.expandAdvancedByDefault.checked,
      enableTvSupport: el.enableTvSupport.checked
    };
    // Only save request defaults once the real lists are loaded, so a saved choice is never lost.
    if (servicesLoaded) {
      out.defaultRadarrServerId = el.prefServer.value;
      out.defaultRadarrProfileId = el.prefProfile.value;
      out.defaultRadarrRootFolder = el.prefFolder.value;
    }
    return out;
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    setSaveState('Saving…');
    saveTimer = setTimeout(async function () {
      try {
        var res = await send(MSG.SAVE_SETTINGS, collect());
        if (res && res.ok) {
          settings = res.settings;
          setSaveState('Saved');
        } else {
          setSaveState((res && res.error) || 'Could not save');
        }
      } catch (err) {
        setSaveState((err && err.message) || 'Could not save');
      }
    }, 500);
  }

  function apply(s) {
    settings = Object.assign({}, ns.DEFAULT_SETTINGS, s || {});
    el.seerrUrl.value = settings.seerrUrl || '';
    el.seerrApiKey.value = settings.seerrApiKey || '';
    el.jellyfinUrl.value = settings.jellyfinUrl || '';
    el.jellyfinApiKey.value = settings.jellyfinApiKey || '';
    el.rememberLastProfile.checked = Boolean(settings.rememberLastProfile);
    el.expandAdvancedByDefault.checked = Boolean(settings.expandAdvancedByDefault);
    el.enableTvSupport.checked = Boolean(settings.enableTvSupport);
    if (settings.seerrUserId !== null && settings.seerrUserId !== undefined && settings.seerrUserId !== '') {
      el.seerrUserId.appendChild(option(String(settings.seerrUserId), 'User #' + settings.seerrUserId, true));
    }
    setMethod(settings.authMode);
    setStyle(settings.widgetStyle);
  }

  /* ---------- Seerr ---------- */

  async function refreshSeerrState() {
    var res = await send(MSG.CHECK_SESSION, {});
    signedIn = Boolean(res && res.signedIn);
    if (!res || !res.configured) {
      setLineState(el.seerrState, 'Not connected');
    } else if (res.permissionMissing) {
      setLineState(el.seerrState, 'Access not allowed yet', 'err');
    } else if (signedIn) {
      setLineState(el.seerrState, 'Signed in as ' + ((res.user && res.user.displayName) || 'you'), 'ok');
      loadServices(false);
    } else {
      setLineState(el.seerrState, method === 'apiKey' ? 'API key not accepted' : 'Not signed in', 'err');
    }
    updateSeerrAction();
  }

  async function loadServices(force) {
    try {
      var res = await send(MSG.GET_SERVICES, { kind: 'radarr', forceRefresh: Boolean(force) });
      if (res && res.ok && res.services) {
        servers = res.services.servers || [];
        servicesLoaded = true;
        fillServers();
      }
    } catch (_err) {
      // Lists stay empty until Seerr answers.
    }
  }

  el.method.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-method]');
    if (btn) {
      setMethod(btn.getAttribute('data-method'));
      saveSoon();
    }
  });

  el.seerrAction.addEventListener('click', async function () {
    var seerrUrl = ns.utils.normalizeBaseUrl(el.seerrUrl.value);
    var pattern = seerrUrl ? ns.utils.buildOriginPattern(seerrUrl) : '';
    if (!pattern) {
      setLineState(el.seerrState, 'Enter your Seerr address', 'err');
      el.seerrUrl.focus();
      return;
    }
    // First await of the click: browsers only show the access prompt during a user action.
    var granted = await ns.api.permissionsRequest(
      method === 'apiKey' ? [pattern] : ns.utils.buildSessionPatterns(seerrUrl)
    );
    if (!granted) {
      setLineState(el.seerrState, 'Access not allowed', 'err');
      return;
    }
    el.seerrAction.disabled = true;
    try {
      if (method === 'apiKey') {
        setLineState(el.seerrState, 'Checking…');
        var res = await send(MSG.SETUP_SIGNIN, { seerrUrl: seerrUrl, method: 'apiKey', apiKey: el.seerrApiKey.value });
        if (!res || !res.ok) {
          setLineState(el.seerrState, (res && res.error) || 'Seerr refused this key', 'err');
        }
      } else {
        await ns.connect.signInWithSession(seerrUrl, function (state, detail) {
          if (state === 'checking') {
            setLineState(el.seerrState, 'Checking…');
          } else if (state === 'waiting') {
            setLineState(el.seerrState, 'Sign in on the Seerr tab');
          } else if (state === 'error') {
            setLineState(el.seerrState, detail, 'err');
          } else if (state === 'timeout') {
            setLineState(el.seerrState, 'No Seerr session yet', 'err');
          }
        });
      }
    } catch (err) {
      setLineState(el.seerrState, (err && err.message) || 'Something went wrong', 'err');
    }
    el.seerrAction.disabled = false;
    refreshSeerrState();
  });

  el.showKey.addEventListener('click', function () {
    var hidden = el.seerrApiKey.type === 'password';
    el.seerrApiKey.type = hidden ? 'text' : 'password';
    el.showKey.textContent = hidden ? 'Hide' : 'Show';
  });

  el.loadUsers.addEventListener('click', async function () {
    el.loadUsers.textContent = 'Loading…';
    try {
      var res = await send(MSG.GET_SEERR_USERS, {});
      if (res && res.ok) {
        var current = el.seerrUserId.value;
        fillSelect(
          el.seerrUserId,
          option('', 'The API key owner'),
          res.users.map(function (u) {
            return option(String(u.id), u.displayName, String(u.id) === current);
          })
        );
      }
    } catch (_err) {
      // Keep the current choice.
    }
    el.loadUsers.textContent = 'Load users';
  });

  /* ---------- Jellyfin ---------- */

  el.jellyfinAction.addEventListener('click', async function () {
    var jellyfinUrl = ns.utils.normalizeBaseUrl(el.jellyfinUrl.value);
    var pattern = jellyfinUrl ? ns.utils.buildOriginPattern(jellyfinUrl) : '';
    if (!pattern) {
      setLineState(el.jellyfinState, 'Enter your Jellyfin address', 'err');
      el.jellyfinUrl.focus();
      return;
    }
    var granted = await ns.api.permissionsRequest([pattern]);
    if (!granted) {
      setLineState(el.jellyfinState, 'Access not allowed', 'err');
      return;
    }
    setLineState(el.jellyfinState, 'Checking…');
    try {
      var res = await send(MSG.TEST_JELLYFIN_CONNECTION, { jellyfinUrl: jellyfinUrl, jellyfinApiKey: el.jellyfinApiKey.value.trim() });
      if (res && res.ok) {
        setLineState(el.jellyfinState, 'Connected to ' + (res.serverName || 'Jellyfin'), 'ok');
        el.jellyfinTicket.classList.remove('is-ask');
      } else {
        setLineState(el.jellyfinState, (res && res.error) || 'Jellyfin did not answer', 'err');
      }
    } catch (err) {
      setLineState(el.jellyfinState, (err && err.message) || 'Jellyfin did not answer', 'err');
    }
  });

  /* ---------- widget and requests ---------- */

  el.styleCards.addEventListener('click', function (event) {
    var card = event.target.closest('[data-style]');
    if (card) {
      setStyle(card.getAttribute('data-style'));
      saveSoon();
    }
  });

  el.prefServer.addEventListener('change', function () {
    settings.defaultRadarrProfileId = null;
    settings.defaultRadarrRootFolder = '';
    fillServerDetails();
    saveSoon();
  });

  el.refreshProfiles.addEventListener('click', function () {
    loadServices(true);
  });

  [el.seerrUrl, el.seerrApiKey, el.jellyfinUrl, el.jellyfinApiKey].forEach(function (input) {
    input.addEventListener('input', saveSoon);
  });
  [el.seerrUserId, el.prefProfile, el.prefFolder, el.rememberLastProfile, el.expandAdvancedByDefault, el.enableTvSupport].forEach(
    function (input) {
      input.addEventListener('change', saveSoon);
    }
  );

  el.clearCache.addEventListener('click', async function () {
    await send(MSG.CLEAR_CACHE, {});
    setSaveState('Profile cache cleared');
    loadServices(true);
  });

  el.resetAll.addEventListener('click', async function () {
    if (!el.resetAll.classList.contains('is-armed')) {
      el.resetAll.classList.add('is-armed');
      el.resetAll.textContent = 'Click again to reset everything';
      resetTimer = setTimeout(function () {
        el.resetAll.classList.remove('is-armed');
        el.resetAll.textContent = 'Reset all settings';
      }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    el.resetAll.classList.remove('is-armed');
    el.resetAll.textContent = 'Reset all settings';
    var res = await send(MSG.RESET_SETTINGS, {});
    if (res && res.ok) {
      servers = [];
      servicesLoaded = false;
      apply(res.settings);
      fillServers();
      setSaveState('Settings reset');
      refreshSeerrState();
    }
  });

  /* ---------- start ---------- */

  loadPreviewStyles();
  send(MSG.GET_CONFIG, {})
    .then(function (res) {
      apply(res && res.settings);
      if (settings.jellyfinUrl) {
        setLineState(el.jellyfinState, 'Saved');
      }
      return refreshSeerrState();
    })
    .catch(function (err) {
      setSaveState((err && err.message) || 'Could not load the settings');
    });
})(globalThis);
