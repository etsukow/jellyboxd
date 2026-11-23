(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;

  function $(id) {
    return document.getElementById(id);
  }

  var el = {
    saveState: $('saveState'),
    saveStateText: $('saveStateText'),
    seerrState: $('seerrState'),
    seerrAvatar: $('seerrAvatar'),
    seerrName: $('seerrName'),
    seerrUrl: $('seerrUrl'),
    method: $('method'),
    methodText: $('methodText'),
    apiKeyPanel: $('apiKeyPanel'),
    seerrApiKey: $('seerrApiKey'),
    showKey: $('showKey'),
    seerrUserId: $('seerrUserId'),
    loadUsers: $('loadUsers'),
    seerrAction: $('seerrAction'),
    jellyfinState: $('jellyfinState'),
    jellyfinUrl: $('jellyfinUrl'),
    jellyfinApiKey: $('jellyfinApiKey'),
    jellyfinAction: $('jellyfinAction'),
    styleCards: $('styleCards'),
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

  function setSaveState(text, kind) {
    el.saveStateText.textContent = text;
    el.saveState.classList.toggle('is-ok', kind === 'ok');
    el.saveState.classList.toggle('is-err', kind === 'err');
  }

  function setLineState(node, text, kind) {
    // Status nodes that also hold an icon keep their text in a .st-text child.
    var target = node.querySelector('.st-text') || node;
    target.textContent = text;
    node.classList.toggle('is-ok', kind === 'ok');
    node.classList.toggle('is-err', kind === 'err');
  }

  function setAccount(name) {
    var label = name || 'Seerr';
    el.seerrName.textContent = label;
    el.seerrAvatar.textContent = label.charAt(0).toUpperCase();
  }

  /* ---------- previews: the real widget, rendered with its own stylesheet ---------- */

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
    // The preview markup lives in <template> elements: the linter rejects innerHTML with a variable.
    el.styleCards.querySelectorAll('[data-prev]').forEach(function (slot) {
      var tpl = $(slot.getAttribute('data-tpl'));
      if (tpl) {
        slot.appendChild(tpl.content.cloneNode(true));
      }
    });
  }

  function setStyle(next) {
    widgetStyle = next === 'native' ? 'native' : 'ticket';
    el.styleCards.querySelectorAll('[data-style]').forEach(function (card) {
      card.setAttribute('aria-pressed', card.getAttribute('data-style') === widgetStyle ? 'true' : 'false');
    });
  }

  /* ---------- form <-> settings ---------- */

  function setMethod(next) {
    method = next === 'apiKey' ? 'apiKey' : 'cookie';
    el.methodText.textContent = method === 'apiKey' ? 'API key' : 'Your Seerr account';
    el.method.setAttribute('data-method', method === 'apiKey' ? 'cookie' : 'apiKey');
    el.method.textContent = method === 'apiKey' ? 'Use your Seerr account' : 'Use an API key';
    el.apiKeyPanel.hidden = method !== 'apiKey';
    updateSeerrAction();
  }

  function updateSeerrAction() {
    if (method === 'apiKey') {
      el.seerrAction.textContent = signedIn ? 'Check the key again' : 'Check API key';
    } else {
      el.seerrAction.textContent = signedIn ? 'Sign in again' : 'Sign in on Seerr';
    }
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
          setSaveState('Saved', 'ok');
        } else {
          setSaveState((res && res.error) || 'Could not save', 'err');
        }
      } catch (err) {
        setSaveState((err && err.message) || 'Could not save', 'err');
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
      setAccount(null);
      setLineState(el.seerrState, 'Not connected');
    } else if (res.permissionMissing) {
      setAccount(res.user && res.user.displayName);
      setLineState(el.seerrState, 'Access not allowed yet', 'err');
    } else if (signedIn) {
      setAccount(res.user && res.user.displayName);
      setLineState(
        el.seerrState,
        method === 'apiKey' ? 'Connected with an API key' : 'Signed in with your Seerr account',
        'ok'
      );
      loadServices(false);
    } else {
      setAccount(null);
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

  el.method.addEventListener('click', function () {
    setMethod(el.method.getAttribute('data-method'));
    saveSoon();
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
        setLineState(el.jellyfinState, 'Works', 'ok');
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
    setSaveState('Profile cache cleared', 'ok');
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
      setSaveState('Settings reset', 'ok');
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
      setSaveState((err && err.message) || 'Could not load the settings', 'err');
    });
})(globalThis);
