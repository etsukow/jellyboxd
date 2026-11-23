(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;

  var connBadge = document.getElementById('connBadge');
  var connBadgeText = document.getElementById('connBadgeText');
  var openSeerrLink = document.getElementById('openSeerrLink');
  var quickForm = document.getElementById('quickForm');
  var quickBeam = document.getElementById('quickBeam');
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

  ns.ui.attachMagicCard(quickForm);
  ns.ui.attachMagicCard(defaultsCard);

  function setBadge(text, tone) {
    connBadgeText.textContent = text;
    connBadge.className = 'lbx-status-plate lbx-tone-' + (tone || 'unknown');
    if (quickBeam) {
      var beamTone =
        tone === 'available'
          ? 'available'
          : tone === 'pending'
            ? 'pending'
            : tone === 'blocked'
              ? 'blocked'
              : 'default';
      quickBeam.setAttribute('data-beam-tone', beamTone);
    }
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
      emptyOpt.textContent = 'Aucun profil disponible';
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
      ' serveur(s) Radarr · ' +
      totalProfiles +
      ' profil(s) de qualité détecté(s).';
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
      setBadge('Erreur', 'blocked');
      return;
    }

    currentSettings = res.settings || currentSettings;
    seerrUrlInput.value = currentSettings.seerrUrl || '';
    seerrApiKeyInput.value = currentSettings.seerrApiKey || '';
    jellyfinUrlInput.value = currentSettings.jellyfinUrl || '';
    setAuthMode(currentSettings.authMode || 'apiKey');
    updateHeaderLinks(currentSettings.seerrUrl);

    if (!currentSettings.seerrUrl) {
      setBadge('Non configuré', 'pending');
      return;
    }

    setBadge('Vérification…', 'processing');
    var testRes = await ns.api.sendMessage({ type: MSG.TEST_SEERR_CONNECTION });
    if (testRes && testRes.ok) {
      var who = (testRes.user && testRes.user.displayName) || 'Connecté';
      setBadge('Connecté · ' + who, 'available');
      renderRadarrDefaults(testRes.radarr);
    } else if (testRes && testRes.permissionMissing) {
      setBadge('Permission requise', 'pending');
    } else {
      setBadge('Hors ligne / Erreur', 'blocked');
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
      showFeedback('Veuillez saisir une URL Seerr valide (ex : http://192.168.1.10:5055).', true);
      return;
    }

    if (authMode === 'apiKey' && !apiKey) {
      showFeedback('Veuillez saisir la clé API Seerr.', true);
      return;
    }

    saveTestBtn.disabled = true;
    saveTestLabel.textContent = 'Connexion en cours…';

    try {
      // CRITIQUE Firefox : permissionsRequest doit être le tout premier await du clic utilisateur
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        setBadge('Permission refusée', 'pending');
        showFeedback('Permission réseau refusée par le navigateur.', true);
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
        showFeedback((saveRes && saveRes.error) || 'Erreur de sauvegarde.', true);
        return;
      }

      currentSettings = saveRes.settings;
      updateHeaderLinks(currentSettings.seerrUrl);

      var testRes = await ns.api.sendMessage({ type: MSG.TEST_SEERR_CONNECTION });
      if (testRes && testRes.ok) {
        var who = (testRes.user && testRes.user.displayName) || 'OK';
        var ver = (testRes.status && testRes.status.version) || '';
        setBadge('Connecté · ' + who, 'available');
        showFeedback(
          'Connexion réussie' + (ver ? ' (Seerr v' + ver + ')' : '') + ' !',
          false
        );
        renderRadarrDefaults(testRes.radarr);
      } else {
        setBadge('Erreur de connexion', 'blocked');
        showFeedback((testRes && testRes.error) || 'Impossible de joindre Seerr.', true);
      }
    } catch (err) {
      setBadge('Erreur', 'blocked');
      showFeedback((err && err.message) || 'Erreur inattendue.', true);
    } finally {
      saveTestBtn.disabled = false;
      saveTestLabel.textContent = 'Tester & Enregistrer';
    }
  });

  toggleApiKeyBtn.addEventListener('click', function () {
    var hidden = seerrApiKeyInput.type === 'password';
    seerrApiKeyInput.type = hidden ? 'text' : 'password';
    toggleApiKeyBtn.textContent = hidden ? 'Cacher' : 'Voir';
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
