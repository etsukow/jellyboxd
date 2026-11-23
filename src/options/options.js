(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;

  var globalStatusBadge = document.getElementById('globalStatusBadge');
  var globalStatusText = document.getElementById('globalStatusText');
  var optionsForm = document.getElementById('optionsForm');

  var seerrUrlInput = document.getElementById('seerrUrl');
  var authModeSegmented = document.getElementById('authModeSegmented');
  var apiKeySection = document.getElementById('apiKeySection');
  var cookieSection = document.getElementById('cookieSection');
  var seerrApiKeyInput = document.getElementById('seerrApiKey');
  var toggleSeerrKeyBtn = document.getElementById('toggleSeerrKey');
  var seerrUserIdSelect = document.getElementById('seerrUserId');
  var loadUsersBtn = document.getElementById('loadUsersBtn');
  var jfLoginUserInput = document.getElementById('jfLoginUser');
  var jfLoginPassInput = document.getElementById('jfLoginPass');
  var seerrJfLoginBtn = document.getElementById('seerrJfLoginBtn');
  var testSeerrBtn = document.getElementById('testSeerrBtn');
  var seerrDiagBox = document.getElementById('seerrDiagBox');

  var jellyfinUrlInput = document.getElementById('jellyfinUrl');
  var jellyfinApiKeyInput = document.getElementById('jellyfinApiKey');
  var toggleJfKeyBtn = document.getElementById('toggleJfKey');
  var testJellyfinBtn = document.getElementById('testJellyfinBtn');
  var jellyfinDiagBox = document.getElementById('jellyfinDiagBox');

  var defaultRadarrServerSelect = document.getElementById('defaultRadarrServerId');
  var defaultRadarrProfileSelect = document.getElementById('defaultRadarrProfileId');
  var defaultRadarrFolderSelect = document.getElementById('defaultRadarrRootFolder');
  var refreshServicesBtn = document.getElementById('refreshServicesBtn');

  var widgetStyleSegmented = document.getElementById('widgetStyleSegmented');
  var widgetStyleHelp = document.getElementById('widgetStyleHelp');

  var rememberLastProfileCb = document.getElementById('rememberLastProfile');
  var expandAdvancedCb = document.getElementById('expandAdvancedByDefault');
  var enableTvSupportCb = document.getElementById('enableTvSupport');

  var saveAllBtn = document.getElementById('saveAllBtn');
  var saveAllLabel = document.getElementById('saveAllLabel');
  var clearCacheBtn = document.getElementById('clearCacheBtn');
  var resetBtn = document.getElementById('resetBtn');
  var globalFeedback = document.getElementById('globalFeedback');

  var WIDGET_STYLE_HELP = {
    native: 'Extends Letterboxd’s actions panel: same colours, same rows.',
    ticket: 'A cinema ticket whose tear-off stub is the main button.'
  };

  var selectedAuthMode = 'apiKey';
  var selectedWidgetStyle = 'native';
  var radarrServers = [];
  var resetArmed = false;
  var resetTimer = null;

  function setGlobalBadge(text, tone) {
    globalStatusText.textContent = text;
    globalStatusBadge.className = 'lbx-status lbx-tone-' + (tone || 'unknown');
  }

  function showBox(boxEl, lines, tone) {
    while (boxEl.firstChild) {
      boxEl.removeChild(boxEl.firstChild);
    }
    var list = Array.isArray(lines) ? lines : [lines];
    list.forEach(function (line, idx) {
      if (idx > 0) {
        boxEl.appendChild(document.createElement('br'));
      }
      boxEl.appendChild(document.createTextNode(String(line)));
    });
    boxEl.className = 'diag-box diag-' + (tone || 'ok');
  }

  function hideBox(boxEl) {
    boxEl.className = 'diag-box hidden';
  }

  function setAuthMode(mode) {
    selectedAuthMode = mode === 'cookie' ? 'cookie' : 'apiKey';
    var buttons = authModeSegmented.querySelectorAll('.lbx-seg-btn');
    buttons.forEach(function (btn) {
      var active = btn.getAttribute('data-auth') === selectedAuthMode;
      btn.classList.toggle('lbx-seg-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var isCookie = selectedAuthMode === 'cookie';
    apiKeySection.classList.toggle('hidden', isCookie);
    cookieSection.classList.toggle('hidden', !isCookie);
  }

  function setWidgetStyle(style) {
    selectedWidgetStyle = style === 'ticket' ? 'ticket' : 'native';
    var buttons = widgetStyleSegmented.querySelectorAll('.lbx-seg-btn');
    buttons.forEach(function (btn) {
      var active = btn.getAttribute('data-widget') === selectedWidgetStyle;
      btn.classList.toggle('lbx-seg-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    widgetStyleHelp.textContent = WIDGET_STYLE_HELP[selectedWidgetStyle];
  }

  function collectFormSettings() {
    return {
      seerrUrl: seerrUrlInput.value.trim(),
      authMode: selectedAuthMode,
      seerrApiKey: seerrApiKeyInput.value.trim(),
      seerrUserId: seerrUserIdSelect.value ? Number(seerrUserIdSelect.value) : null,
      jellyfinUrl: jellyfinUrlInput.value.trim(),
      jellyfinApiKey: jellyfinApiKeyInput.value.trim(),
      defaultRadarrServerId: defaultRadarrServerSelect.value
        ? Number(defaultRadarrServerSelect.value)
        : null,
      defaultRadarrProfileId: defaultRadarrProfileSelect.value
        ? Number(defaultRadarrProfileSelect.value)
        : null,
      defaultRadarrRootFolder: defaultRadarrFolderSelect.value || '',
      rememberLastProfile: Boolean(rememberLastProfileCb.checked),
      expandAdvancedByDefault: Boolean(expandAdvancedCb.checked),
      widgetStyle: selectedWidgetStyle,
      enableTvSupport: Boolean(enableTvSupportCb.checked)
    };
  }

  function collectOriginsFromInputs() {
    var origins = [];
    var pSeerr = ns.utils.buildOriginPattern(seerrUrlInput.value.trim());
    if (pSeerr) {
      origins.push(pSeerr);
    }
    var pJf = ns.utils.buildOriginPattern(jellyfinUrlInput.value.trim());
    if (pJf && origins.indexOf(pJf) === -1) {
      origins.push(pJf);
    }
    return origins;
  }

  function populateRadarrDependentSelects(server, preferredProfileId, preferredFolder) {
    while (defaultRadarrProfileSelect.firstChild) {
      defaultRadarrProfileSelect.removeChild(defaultRadarrProfileSelect.firstChild);
    }
    while (defaultRadarrFolderSelect.firstChild) {
      defaultRadarrFolderSelect.removeChild(defaultRadarrFolderSelect.firstChild);
    }

    var autoProfOpt = document.createElement('option');
    autoProfOpt.value = '';
    autoProfOpt.textContent = 'Server default';
    defaultRadarrProfileSelect.appendChild(autoProfOpt);

    var autoFolderOpt = document.createElement('option');
    autoFolderOpt.value = '';
    autoFolderOpt.textContent = 'Server default';
    defaultRadarrFolderSelect.appendChild(autoFolderOpt);

    if (!server) {
      return;
    }

    (server.profiles || []).forEach(function (prof) {
      var opt = document.createElement('option');
      opt.value = String(prof.id);
      opt.textContent = prof.name;
      if (preferredProfileId !== null && Number(prof.id) === Number(preferredProfileId)) {
        opt.selected = true;
      }
      defaultRadarrProfileSelect.appendChild(opt);
    });

    (server.rootFolders || []).forEach(function (folder) {
      var opt = document.createElement('option');
      opt.value = folder.path;
      var space =
        typeof folder.freeSpace === 'number'
          ? ' (' + ns.utils.formatBytes(folder.freeSpace) + ' free)'
          : '';
      opt.textContent = folder.path + space;
      if (preferredFolder && folder.path === preferredFolder) {
        opt.selected = true;
      }
      defaultRadarrFolderSelect.appendChild(opt);
    });
  }

  function populateRadarrServers(servers, selectedServerId, selectedProfileId, selectedFolder) {
    radarrServers = Array.isArray(servers) ? servers : [];

    while (defaultRadarrServerSelect.firstChild) {
      defaultRadarrServerSelect.removeChild(defaultRadarrServerSelect.firstChild);
    }

    var autoSrvOpt = document.createElement('option');
    autoSrvOpt.value = '';
    autoSrvOpt.textContent = 'Pick automatically';
    defaultRadarrServerSelect.appendChild(autoSrvOpt);

    var matched = null;
    radarrServers.forEach(function (srv) {
      var opt = document.createElement('option');
      opt.value = String(srv.id);
      opt.textContent = (srv.is4k ? '[4K] ' : '[HD] ') + srv.name;
      if (selectedServerId !== null && Number(srv.id) === Number(selectedServerId)) {
        opt.selected = true;
        matched = srv;
      }
      defaultRadarrServerSelect.appendChild(opt);
    });

    if (!matched && radarrServers.length > 0 && selectedServerId === null) {
      matched =
        radarrServers.find(function (s) {
          return s.isDefault && !s.is4k;
        }) || radarrServers[0];
    }

    populateRadarrDependentSelects(matched, selectedProfileId, selectedFolder);
  }

  function populateUsers(users, selectedUserId) {
    while (seerrUserIdSelect.firstChild) {
      seerrUserIdSelect.removeChild(seerrUserIdSelect.firstChild);
    }
    var defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'API key owner (default)';
    seerrUserIdSelect.appendChild(defaultOpt);

    (users || []).forEach(function (u) {
      var opt = document.createElement('option');
      opt.value = String(u.id);
      opt.textContent = u.displayName + (u.email ? ' (' + u.email + ')' : '');
      if (selectedUserId !== null && Number(u.id) === Number(selectedUserId)) {
        opt.selected = true;
      }
      seerrUserIdSelect.appendChild(opt);
    });
  }

  function applySettingsToForm(settings) {
    seerrUrlInput.value = settings.seerrUrl || '';
    setAuthMode(settings.authMode || 'apiKey');
    seerrApiKeyInput.value = settings.seerrApiKey || '';
    jellyfinUrlInput.value = settings.jellyfinUrl || '';
    jellyfinApiKeyInput.value = settings.jellyfinApiKey || '';
    rememberLastProfileCb.checked = Boolean(settings.rememberLastProfile);
    expandAdvancedCb.checked = Boolean(settings.expandAdvancedByDefault);
    setWidgetStyle(settings.widgetStyle);
    enableTvSupportCb.checked = Boolean(settings.enableTvSupport);

    if (settings.seerrUserId !== null && settings.seerrUserId !== undefined) {
      populateUsers(
        [{ id: settings.seerrUserId, displayName: 'User #' + settings.seerrUserId, email: '' }],
        settings.seerrUserId
      );
    }
  }

  async function runSeerrDiagnostic(overrideSettings, savedPrefs) {
    var res = await ns.api.sendMessage({
      type: MSG.TEST_SEERR_CONNECTION,
      payload: overrideSettings ? { settingsOverride: overrideSettings } : {}
    });

    if (res && res.ok) {
      var who = (res.user && res.user.displayName) || 'Unknown user';
      var version = (res.status && res.status.version) || 'n/a';
      var radarrList = (res.radarr && res.radarr.servers) || [];
      var sonarrList = (res.sonarr && res.sonarr.servers) || [];
      var radarrProfilesCount = radarrList.reduce(function (acc, s) {
        return acc + (s.profiles ? s.profiles.length : 0);
      }, 0);

      setGlobalBadge('Connected · ' + who, 'available');
      showBox(
        seerrDiagBox,
        [
          'Seerr connection OK (version ' + version + ') · User: ' + who,
          'Radarr: ' +
            radarrList.length +
            ' server(s), ' +
            radarrProfilesCount +
            ' quality profile(s)' +
            (sonarrList.length > 0 ? ' · Sonarr: ' + sonarrList.length + ' server(s)' : '')
        ],
        'ok'
      );

      var prefs = savedPrefs || collectFormSettings();
      populateRadarrServers(
        radarrList,
        prefs.defaultRadarrServerId,
        prefs.defaultRadarrProfileId,
        prefs.defaultRadarrRootFolder
      );
      return true;
    }

    if (res && res.permissionMissing) {
      setGlobalBadge('Permission required', 'pending');
      showBox(seerrDiagBox, res.error, 'warn');
    } else {
      setGlobalBadge('Seerr error', 'blocked');
      showBox(seerrDiagBox, (res && res.error) || 'Seerr connection test failed.', 'err');
    }
    return false;
  }

  async function init() {
    var cfgRes = await ns.api.sendMessage({ type: MSG.GET_CONFIG });
    if (!cfgRes || !cfgRes.ok) {
      setGlobalBadge('Error', 'blocked');
      return;
    }

    var settings = cfgRes.settings || ns.DEFAULT_SETTINGS;
    applySettingsToForm(settings);

    if (!settings.seerrUrl) {
      setGlobalBadge('Not configured', 'pending');
      return;
    }

    setGlobalBadge('Checking…', 'processing');
    await runSeerrDiagnostic(null, settings);
  }

  authModeSegmented.addEventListener('click', function (event) {
    var btn = event.target.closest('.lbx-seg-btn');
    if (!btn) {
      return;
    }
    setAuthMode(btn.getAttribute('data-auth'));
  });

  widgetStyleSegmented.addEventListener('click', function (event) {
    var btn = event.target.closest('.lbx-seg-btn');
    if (!btn) {
      return;
    }
    setWidgetStyle(btn.getAttribute('data-widget'));
  });

  toggleSeerrKeyBtn.addEventListener('click', function () {
    var isHidden = seerrApiKeyInput.type === 'password';
    seerrApiKeyInput.type = isHidden ? 'text' : 'password';
    toggleSeerrKeyBtn.textContent = isHidden ? 'Hide' : 'Show';
  });

  toggleJfKeyBtn.addEventListener('click', function () {
    var isHidden = jellyfinApiKeyInput.type === 'password';
    jellyfinApiKeyInput.type = isHidden ? 'text' : 'password';
    toggleJfKeyBtn.textContent = isHidden ? 'Hide' : 'Show';
  });

  defaultRadarrServerSelect.addEventListener('change', function () {
    var srvId = defaultRadarrServerSelect.value;
    var srv = srvId
      ? radarrServers.find(function (s) {
          return Number(s.id) === Number(srvId);
        })
      : radarrServers.find(function (s) {
          return s.isDefault && !s.is4k;
        }) || radarrServers[0];
    populateRadarrDependentSelects(srv, null, '');
  });

  testSeerrBtn.addEventListener('click', async function () {
    hideBox(seerrDiagBox);
    var origins = collectOriginsFromInputs();
    if (!ns.utils.buildOriginPattern(seerrUrlInput.value.trim())) {
      showBox(seerrDiagBox, 'Enter a valid Seerr URL.', 'err');
      return;
    }

    testSeerrBtn.disabled = true;
    testSeerrBtn.textContent = 'Testing…';

    try {
      // CRITICAL Firefox: permissionsRequest must be the very first await of the click
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        showBox(seerrDiagBox, 'Network permission denied by the browser.', 'warn');
        return;
      }
      var draft = collectFormSettings();
      await runSeerrDiagnostic(draft, draft);
    } catch (err) {
      showBox(seerrDiagBox, (err && err.message) || 'Unexpected error.', 'err');
    } finally {
      testSeerrBtn.disabled = false;
      testSeerrBtn.textContent = 'Test connection';
    }
  });

  loadUsersBtn.addEventListener('click', async function () {
    var origins = collectOriginsFromInputs();
    if (!ns.utils.buildOriginPattern(seerrUrlInput.value.trim())) {
      showBox(seerrDiagBox, 'Enter the Seerr URL first.', 'err');
      return;
    }

    loadUsersBtn.disabled = true;
    try {
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        showBox(seerrDiagBox, 'Network permission denied.', 'warn');
        return;
      }

      var draft = collectFormSettings();
      var res = await ns.api.sendMessage({
        type: MSG.GET_SEERR_USERS,
        payload: { settingsOverride: draft }
      });

      if (res && res.ok) {
        populateUsers(res.users, draft.seerrUserId);
        showBox(seerrDiagBox, 'Loaded ' + res.users.length + ' Seerr user(s).', 'ok');
      } else {
        showBox(seerrDiagBox, (res && res.error) || 'Could not load users.', 'err');
      }
    } finally {
      loadUsersBtn.disabled = false;
    }
  });

  seerrJfLoginBtn.addEventListener('click', async function () {
    var rawSeerr = seerrUrlInput.value.trim();
    var pSeerr = ns.utils.buildOriginPattern(rawSeerr);
    if (!pSeerr) {
      showBox(seerrDiagBox, 'Enter a valid Seerr URL.', 'err');
      return;
    }

    var username = jfLoginUserInput.value.trim();
    var password = jfLoginPassInput.value;
    if (!username) {
      showBox(seerrDiagBox, 'Enter your Jellyfin username.', 'err');
      return;
    }

    seerrJfLoginBtn.disabled = true;
    try {
      var granted = await ns.api.permissionsRequest([pSeerr]);
      if (!granted) {
        showBox(seerrDiagBox, 'Network permission denied.', 'warn');
        return;
      }

      var res = await ns.api.sendMessage({
        type: MSG.SEERR_JELLYFIN_LOGIN,
        payload: { seerrUrl: rawSeerr, username: username, password: password }
      });
      jfLoginPassInput.value = '';

      if (res && res.ok) {
        var who = (res.user && res.user.displayName) || username;
        showBox(seerrDiagBox, 'Seerr session opened for ' + who + '!', 'ok');
        await runSeerrDiagnostic(collectFormSettings(), collectFormSettings());
      } else {
        showBox(seerrDiagBox, (res && res.error) || 'Jellyfin login on Seerr failed.', 'err');
      }
    } finally {
      seerrJfLoginBtn.disabled = false;
    }
  });

  testJellyfinBtn.addEventListener('click', async function () {
    hideBox(jellyfinDiagBox);
    var rawJf = jellyfinUrlInput.value.trim();
    var pJf = ns.utils.buildOriginPattern(rawJf);
    if (!pJf) {
      showBox(jellyfinDiagBox, 'Enter a valid Jellyfin URL.', 'err');
      return;
    }

    testJellyfinBtn.disabled = true;
    testJellyfinBtn.textContent = 'Testing…';

    try {
      var granted = await ns.api.permissionsRequest([pJf]);
      if (!granted) {
        showBox(jellyfinDiagBox, 'Network permission denied for Jellyfin.', 'warn');
        return;
      }

      var res = await ns.api.sendMessage({
        type: MSG.TEST_JELLYFIN_CONNECTION,
        payload: {
          jellyfinUrl: rawJf,
          jellyfinApiKey: jellyfinApiKeyInput.value.trim()
        }
      });

      if (res && res.ok) {
        showBox(
          jellyfinDiagBox,
          'Jellyfin connected: ' +
            res.serverName +
            (res.version ? ' (v' + res.version + ')' : '') +
            (res.authenticated ? ' — API key valid' : ' — Public info OK'),
          'ok'
        );
      } else {
        showBox(jellyfinDiagBox, (res && res.error) || 'Could not reach Jellyfin.', 'err');
      }
    } finally {
      testJellyfinBtn.disabled = false;
      testJellyfinBtn.textContent = 'Test Jellyfin';
    }
  });

  refreshServicesBtn.addEventListener('click', async function () {
    var origins = collectOriginsFromInputs();
    if (!ns.utils.buildOriginPattern(seerrUrlInput.value.trim())) {
      showBox(globalFeedback, 'Set the Seerr URL first.', 'err');
      return;
    }

    refreshServicesBtn.disabled = true;
    try {
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        showBox(globalFeedback, 'Network permission denied.', 'warn');
        return;
      }

      var draft = collectFormSettings();
      var res = await ns.api.sendMessage({
        type: MSG.GET_SERVICES,
        payload: { kind: 'radarr', forceRefresh: true, settingsOverride: draft }
      });

      if (res && res.ok && res.services) {
        populateRadarrServers(
          res.services.servers,
          draft.defaultRadarrServerId,
          draft.defaultRadarrProfileId,
          draft.defaultRadarrRootFolder
        );
        showBox(
          globalFeedback,
          'Refreshed ' + res.services.servers.length + ' Radarr server(s) and their profiles.',
          'ok'
        );
      } else {
        showBox(globalFeedback, (res && res.error) || 'Could not refresh the profiles.', 'err');
      }
    } finally {
      refreshServicesBtn.disabled = false;
    }
  });

  optionsForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    hideBox(globalFeedback);

    var origins = collectOriginsFromInputs();
    saveAllBtn.disabled = true;
    saveAllLabel.textContent = 'Saving…';

    try {
      if (origins.length > 0) {
        var granted = await ns.api.permissionsRequest(origins);
        if (!granted) {
          showBox(globalFeedback, 'Network permission denied for the entered servers.', 'warn');
          return;
        }
      }

      var next = collectFormSettings();
      var saveRes = await ns.api.sendMessage({
        type: MSG.SAVE_SETTINGS,
        payload: next
      });

      if (!saveRes || !saveRes.ok) {
        showBox(globalFeedback, (saveRes && saveRes.error) || 'Error while saving.', 'err');
        return;
      }

      showBox(globalFeedback, 'Settings saved.', 'ok');
      if (saveRes.settings && saveRes.settings.seerrUrl) {
        await runSeerrDiagnostic(null, saveRes.settings);
      } else {
        setGlobalBadge('Not configured', 'pending');
      }
    } catch (err) {
      showBox(globalFeedback, (err && err.message) || 'Unexpected error.', 'err');
    } finally {
      saveAllBtn.disabled = false;
      saveAllLabel.textContent = 'Save settings';
    }
  });

  clearCacheBtn.addEventListener('click', async function () {
    var res = await ns.api.sendMessage({ type: MSG.CLEAR_CACHE });
    if (res && res.ok) {
      showBox(globalFeedback, 'Server and profile cache cleared.', 'ok');
    }
  });

  resetBtn.addEventListener('click', async function () {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'Confirm reset?';
      resetBtn.classList.add('lbx-btn-danger-armed');
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
      resetTimer = setTimeout(function () {
        resetArmed = false;
        resetBtn.textContent = 'Reset';
        resetBtn.classList.remove('lbx-btn-danger-armed');
      }, 4500);
      return;
    }

    resetArmed = false;
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    resetBtn.textContent = 'Reset';
    resetBtn.classList.remove('lbx-btn-danger-armed');

    var res = await ns.api.sendMessage({ type: MSG.RESET_SETTINGS });
    if (res && res.ok) {
      applySettingsToForm(res.settings);
      populateRadarrServers([], null, null, '');
      populateUsers([], null);
      hideBox(seerrDiagBox);
      hideBox(jellyfinDiagBox);
      setGlobalBadge('Not configured', 'pending');
      showBox(globalFeedback, 'Settings reset.', 'ok');
    }
  });

  init();
})(globalThis);
