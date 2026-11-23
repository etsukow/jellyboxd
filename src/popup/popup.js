(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;

  var connBadge = document.getElementById('connBadge');
  var connBadgeText = document.getElementById('connBadgeText');
  var openSeerrLink = document.getElementById('openSeerrLink');
  var quickForm = document.getElementById('quickForm');
  var seerrUrlInput = document.getElementById('seerrUrl');
  var authModeSegmented = document.getElementById('authModeSegmented');
  var apiKeyField = document.getElementById('apiKeyField');
  var cookieNote = document.getElementById('cookieNote');
  var seerrApiKeyInput = document.getElementById('seerrApiKey');
  var toggleApiKeyBtn = document.getElementById('toggleApiKey');
  var jellyfinUrlInput = document.getElementById('jellyfinUrl');
  var saveTestBtn = document.getElementById('saveTestBtn');
  var saveTestLabel = document.getElementById('saveTestLabel');
  var feedbackBox = document.getElementById('feedbackBox');
  var defaultsCard = document.getElementById('defaultsCard');
  var defaultServerSelect = document.getElementById('defaultServer');
  var defaultProfileSelect = document.getElementById('defaultProfile');
  var profilesHint = document.getElementById('profilesHint');
  var openOptionsBtn = document.getElementById('openOptionsBtn');

  var currentSettings = Object.assign({}, ns.DEFAULT_SETTINGS);
  var selectedAuthMode = 'apiKey';
  var radarrServers = [];

  function setBadge(text, tone) {
    connBadgeText.textContent = text;
    connBadge.className = 'lbx-status lbx-tone-' + (tone || 'unknown');
  }

  function showFeedback(text, isError) {
    feedbackBox.textContent = text;
    feedbackBox.className = 'feedback ' + (isError ? 'feedback-err' : 'feedback-ok');
  }

  function hideFeedback() {
    feedbackBox.textContent = '';
    feedbackBox.className = 'feedback hidden';
  }

  function setAuthMode(mode) {
    selectedAuthMode = mode === 'cookie' ? 'cookie' : 'apiKey';
    var buttons = authModeSegmented.querySelectorAll('.lbx-seg-btn');
    buttons.forEach(function (btn) {
      var active = btn.getAttribute('data-auth') === selectedAuthMode;
      btn.classList.toggle('lbx-seg-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    apiKeyField.classList.toggle('hidden', selectedAuthMode === 'cookie');
    cookieNote.classList.toggle('hidden', selectedAuthMode !== 'cookie');
  }

  function updateHeaderLinks(seerrUrl) {
    var normalized = ns.utils.normalizeBaseUrl(seerrUrl);
    if (normalized && ns.utils.isSafeHttpUrl(normalized)) {
      openSeerrLink.href = normalized;
      openSeerrLink.classList.remove('hidden');
    } else {
      openSeerrLink.classList.add('hidden');
    }
  }

  function populateProfileSelect(server, selectedProfileId) {
    while (defaultProfileSelect.firstChild) {
      defaultProfileSelect.removeChild(defaultProfileSelect.firstChild);
    }

    if (!server || !Array.isArray(server.profiles) || server.profiles.length === 0) {
      var emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No profile available';
      defaultProfileSelect.appendChild(emptyOpt);
      defaultProfileSelect.disabled = true;
      return;
    }

    defaultProfileSelect.disabled = false;
    var activePid =
      selectedProfileId !== null && selectedProfileId !== undefined
        ? Number(selectedProfileId)
        : Number(server.activeProfileId);

    server.profiles.forEach(function (prof) {
      var opt = document.createElement('option');
      opt.value = String(prof.id);
      opt.textContent = prof.name;
      if (Number(prof.id) === activePid) {
        opt.selected = true;
      }
      defaultProfileSelect.appendChild(opt);
    });
  }

  function renderRadarrDefaults(radarrData) {
    var servers = (radarrData && radarrData.servers) || [];
    radarrServers = servers;

    if (servers.length === 0) {
      defaultsCard.classList.add('hidden');
      return;
    }

    defaultsCard.classList.remove('hidden');
    while (defaultServerSelect.firstChild) {
      defaultServerSelect.removeChild(defaultServerSelect.firstChild);
    }

    var selectedSrv =
      servers.find(function (s) {
        return Number(s.id) === Number(currentSettings.defaultRadarrServerId);
      }) ||
      servers.find(function (s) {
        return s.isDefault && !s.is4k;
      }) ||
      servers[0];

    servers.forEach(function (srv) {
      var opt = document.createElement('option');
      opt.value = String(srv.id);
      opt.textContent = (srv.is4k ? '[4K] ' : '[HD] ') + srv.name;
      if (selectedSrv && Number(srv.id) === Number(selectedSrv.id)) {
        opt.selected = true;
      }
      defaultServerSelect.appendChild(opt);
    });

    populateProfileSelect(selectedSrv, currentSettings.defaultRadarrProfileId);

    var totalProfiles = servers.reduce(function (acc, s) {
      return acc + (s.profiles ? s.profiles.length : 0);
    }, 0);
    profilesHint.textContent =
      servers.length +
      ' Radarr server(s) · ' +
      totalProfiles +
      ' quality profile(s) detected.';
  }

  async function saveDefaultSelection() {
    var serverId = defaultServerSelect.value ? Number(defaultServerSelect.value) : null;
    var profileId = defaultProfileSelect.value ? Number(defaultProfileSelect.value) : null;

    var res = await ns.api.sendMessage({
      type: MSG.SAVE_SETTINGS,
      payload: {
        defaultRadarrServerId: serverId,
        defaultRadarrProfileId: profileId
      }
    });
    if (res && res.ok && res.settings) {
      currentSettings = res.settings;
    }
  }

  async function loadInitialState() {
    var res = await ns.api.sendMessage({ type: MSG.GET_CONFIG });
    if (!res || !res.ok) {
      setBadge('Error', 'blocked');
      return;
    }

    currentSettings = res.settings || currentSettings;
    seerrUrlInput.value = currentSettings.seerrUrl || '';
    seerrApiKeyInput.value = currentSettings.seerrApiKey || '';
    jellyfinUrlInput.value = currentSettings.jellyfinUrl || '';
    setAuthMode(currentSettings.authMode || 'apiKey');
    updateHeaderLinks(currentSettings.seerrUrl);

    if (!currentSettings.seerrUrl) {
      setBadge('Not configured', 'pending');
      return;
    }

    setBadge('Checking…', 'processing');
    var testRes = await ns.api.sendMessage({ type: MSG.TEST_SEERR_CONNECTION });
    if (testRes && testRes.ok) {
      var who = (testRes.user && testRes.user.displayName) || 'Connected';
      setBadge('Connected · ' + who, 'available');
      renderRadarrDefaults(testRes.radarr);
    } else if (testRes && testRes.permissionMissing) {
      setBadge('Permission required', 'pending');
    } else {
      setBadge('Offline / Error', 'blocked');
    }
  }

  authModeSegmented.addEventListener('click', function (event) {
    var btn = event.target.closest('.lbx-seg-btn');
    if (!btn) {
      return;
    }
    setAuthMode(btn.getAttribute('data-auth'));
  });

  quickForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    hideFeedback();

    var rawSeerrUrl = seerrUrlInput.value.trim();
    var rawJellyfinUrl = jellyfinUrlInput.value.trim();
    var authMode = selectedAuthMode;
    var apiKey = seerrApiKeyInput.value.trim();

    var origins = [];
    var seerrPattern = ns.utils.buildOriginPattern(rawSeerrUrl);
    if (seerrPattern) {
      origins.push(seerrPattern);
    }
    var jfPattern = ns.utils.buildOriginPattern(rawJellyfinUrl);
    if (jfPattern && origins.indexOf(jfPattern) === -1) {
      origins.push(jfPattern);
    }

    if (!seerrPattern) {
      showFeedback('Enter a valid Seerr URL (e.g. http://192.168.1.10:5055).', true);
      return;
    }

    if (authMode === 'apiKey' && !apiKey) {
      showFeedback('Enter the Seerr API key.', true);
      return;
    }

    saveTestBtn.disabled = true;
    saveTestLabel.textContent = 'Connecting…';

    try {
      // CRITICAL Firefox: permissionsRequest must be the very first await of the user click
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        setBadge('Permission denied', 'pending');
        showFeedback('Network permission denied by the browser.', true);
        return;
      }

      var saveRes = await ns.api.sendMessage({
        type: MSG.SAVE_SETTINGS,
        payload: {
          seerrUrl: rawSeerrUrl,
          authMode: authMode,
          seerrApiKey: apiKey,
          jellyfinUrl: rawJellyfinUrl
        }
      });

      if (!saveRes || !saveRes.ok) {
        showFeedback((saveRes && saveRes.error) || 'Save error.', true);
        return;
      }

      currentSettings = saveRes.settings;
      updateHeaderLinks(currentSettings.seerrUrl);

      var testRes = await ns.api.sendMessage({ type: MSG.TEST_SEERR_CONNECTION });
      if (testRes && testRes.ok) {
        var who = (testRes.user && testRes.user.displayName) || 'OK';
        var ver = (testRes.status && testRes.status.version) || '';
        setBadge('Connected · ' + who, 'available');
        showFeedback(
          'Connection successful' + (ver ? ' (Seerr v' + ver + ')' : '') + '!',
          false
        );
        renderRadarrDefaults(testRes.radarr);
      } else {
        setBadge('Connection error', 'blocked');
        showFeedback((testRes && testRes.error) || 'Could not reach Seerr.', true);
      }
    } catch (err) {
      setBadge('Error', 'blocked');
      showFeedback((err && err.message) || 'Unexpected error.', true);
    } finally {
      saveTestBtn.disabled = false;
      saveTestLabel.textContent = 'Test & save';
    }
  });

  toggleApiKeyBtn.addEventListener('click', function () {
    var hidden = seerrApiKeyInput.type === 'password';
    seerrApiKeyInput.type = hidden ? 'text' : 'password';
    toggleApiKeyBtn.textContent = hidden ? 'Hide' : 'Show';
  });

  defaultServerSelect.addEventListener('change', function () {
    var srv = radarrServers.find(function (s) {
      return Number(s.id) === Number(defaultServerSelect.value);
    });
    populateProfileSelect(srv, null);
    saveDefaultSelection();
  });

  defaultProfileSelect.addEventListener('change', function () {
    saveDefaultSelection();
  });

  openOptionsBtn.addEventListener('click', function () {
    ns.api.openOptionsPage();
  });

  loadInitialState();
})(globalThis);
