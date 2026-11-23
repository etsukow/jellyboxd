(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;

  var globalStatusBadge = document.getElementById('globalStatusBadge');
  var globalStatusText = document.getElementById('globalStatusText');
  var seerrBeam = document.getElementById('seerrBeam');
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
    native: 'Le composant prolonge le panneau d’actions de Letterboxd : mêmes couleurs, mêmes lignes.',
    ticket: 'Le composant prend la forme d’un ticket de cinéma, avec un talon détachable comme bouton.'
  };

  var selectedAuthMode = 'apiKey';
  var selectedWidgetStyle = 'native';
  var radarrServers = [];
  var resetArmed = false;
  var resetTimer = null;

  document.querySelectorAll('.lbx-magic-card').forEach(function (card) {
    ns.ui.attachMagicCard(card);
  });

  function setGlobalBadge(text, tone) {
    globalStatusText.textContent = text;
    globalStatusBadge.className = 'lbx-status-plate lbx-tone-' + (tone || 'unknown');
    if (seerrBeam) {
      var beamTone =
        tone === 'available'
          ? 'available'
          : tone === 'pending'
            ? 'pending'
            : tone === 'blocked'
              ? 'blocked'
              : 'default';
      seerrBeam.setAttribute('data-beam-tone', beamTone);
    }
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
    autoProfOpt.textContent = 'Profil par défaut du serveur';
    defaultRadarrProfileSelect.appendChild(autoProfOpt);

    var autoFolderOpt = document.createElement('option');
    autoFolderOpt.value = '';
    autoFolderOpt.textContent = 'Dossier par défaut du serveur';
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
          ? ' (' + ns.utils.formatBytes(folder.freeSpace) + ' libres)'
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
    autoSrvOpt.textContent = 'Sélection automatique';
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
    defaultOpt.textContent = 'Compte par défaut (admin clé API)';
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
        [{ id: settings.seerrUserId, displayName: 'Utilisateur #' + settings.seerrUserId, email: '' }],
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
      var who = (res.user && res.user.displayName) || 'Utilisateur inconnu';
      var version = (res.status && res.status.version) || 'n/c';
      var radarrList = (res.radarr && res.radarr.servers) || [];
      var sonarrList = (res.sonarr && res.sonarr.servers) || [];
      var radarrProfilesCount = radarrList.reduce(function (acc, s) {
        return acc + (s.profiles ? s.profiles.length : 0);
      }, 0);

      setGlobalBadge('Connecté · ' + who, 'available');
      showBox(
        seerrDiagBox,
        [
          'Connexion Seerr OK (version ' + version + ') · Utilisateur : ' + who,
          'Radarr : ' +
            radarrList.length +
            ' serveur(s), ' +
            radarrProfilesCount +
            ' profil(s) de qualité' +
            (sonarrList.length > 0 ? ' · Sonarr : ' + sonarrList.length + ' serveur(s)' : '')
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
      setGlobalBadge('Permission requise', 'pending');
      showBox(seerrDiagBox, res.error, 'warn');
    } else {
      setGlobalBadge('Erreur Seerr', 'blocked');
      showBox(seerrDiagBox, (res && res.error) || 'Échec du test de connexion Seerr.', 'err');
    }
    return false;
  }

  async function init() {
    var cfgRes = await ns.api.sendMessage({ type: MSG.GET_CONFIG });
    if (!cfgRes || !cfgRes.ok) {
      setGlobalBadge('Erreur', 'blocked');
      return;
    }

    var settings = cfgRes.settings || ns.DEFAULT_SETTINGS;
    applySettingsToForm(settings);

    if (!settings.seerrUrl) {
      setGlobalBadge('Non configuré', 'pending');
      return;
    }

    setGlobalBadge('Vérification…', 'processing');
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
    toggleSeerrKeyBtn.textContent = isHidden ? 'Cacher' : 'Voir';
  });

  toggleJfKeyBtn.addEventListener('click', function () {
    var isHidden = jellyfinApiKeyInput.type === 'password';
    jellyfinApiKeyInput.type = isHidden ? 'text' : 'password';
    toggleJfKeyBtn.textContent = isHidden ? 'Cacher' : 'Voir';
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
      showBox(seerrDiagBox, 'Veuillez saisir une URL Seerr valide.', 'err');
      return;
    }

    testSeerrBtn.disabled = true;
    testSeerrBtn.textContent = 'Test en cours…';

    try {
      // CRITIQUE Firefox : permissionsRequest doit être le tout premier await du clic
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        showBox(seerrDiagBox, 'Permission réseau refusée par le navigateur.', 'warn');
        return;
      }
      var draft = collectFormSettings();
      await runSeerrDiagnostic(draft, draft);
    } catch (err) {
      showBox(seerrDiagBox, (err && err.message) || 'Erreur inattendue.', 'err');
    } finally {
      testSeerrBtn.disabled = false;
      testSeerrBtn.textContent = 'Tester la connexion';
    }
  });

  loadUsersBtn.addEventListener('click', async function () {
    var origins = collectOriginsFromInputs();
    if (!ns.utils.buildOriginPattern(seerrUrlInput.value.trim())) {
      showBox(seerrDiagBox, 'Veuillez d’abord saisir l’URL Seerr.', 'err');
      return;
    }

    loadUsersBtn.disabled = true;
    try {
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        showBox(seerrDiagBox, 'Permission réseau refusée.', 'warn');
        return;
      }

      var draft = collectFormSettings();
      var res = await ns.api.sendMessage({
        type: MSG.GET_SEERR_USERS,
        payload: { settingsOverride: draft }
      });

      if (res && res.ok) {
        populateUsers(res.users, draft.seerrUserId);
        showBox(seerrDiagBox, res.users.length + ' utilisateur(s) Seerr chargé(s).', 'ok');
      } else {
        showBox(seerrDiagBox, (res && res.error) || 'Impossible de charger les utilisateurs.', 'err');
      }
    } finally {
      loadUsersBtn.disabled = false;
    }
  });

  seerrJfLoginBtn.addEventListener('click', async function () {
    var rawSeerr = seerrUrlInput.value.trim();
    var pSeerr = ns.utils.buildOriginPattern(rawSeerr);
    if (!pSeerr) {
      showBox(seerrDiagBox, 'Veuillez saisir une URL Seerr valide.', 'err');
      return;
    }

    var username = jfLoginUserInput.value.trim();
    var password = jfLoginPassInput.value;
    if (!username) {
      showBox(seerrDiagBox, 'Saisissez votre nom d’utilisateur Jellyfin.', 'err');
      return;
    }

    seerrJfLoginBtn.disabled = true;
    try {
      var granted = await ns.api.permissionsRequest([pSeerr]);
      if (!granted) {
        showBox(seerrDiagBox, 'Permission réseau refusée.', 'warn');
        return;
      }

      var res = await ns.api.sendMessage({
        type: MSG.SEERR_JELLYFIN_LOGIN,
        payload: { seerrUrl: rawSeerr, username: username, password: password }
      });
      jfLoginPassInput.value = '';

      if (res && res.ok) {
        var who = (res.user && res.user.displayName) || username;
        showBox(seerrDiagBox, 'Session Seerr ouverte pour ' + who + ' !', 'ok');
        await runSeerrDiagnostic(collectFormSettings(), collectFormSettings());
      } else {
        showBox(seerrDiagBox, (res && res.error) || 'Échec de connexion Jellyfin sur Seerr.', 'err');
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
      showBox(jellyfinDiagBox, 'Veuillez saisir une URL Jellyfin valide.', 'err');
      return;
    }

    testJellyfinBtn.disabled = true;
    testJellyfinBtn.textContent = 'Test en cours…';

    try {
      var granted = await ns.api.permissionsRequest([pJf]);
      if (!granted) {
        showBox(jellyfinDiagBox, 'Permission réseau refusée pour Jellyfin.', 'warn');
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
          'Jellyfin connecté : ' +
            res.serverName +
            (res.version ? ' (v' + res.version + ')' : '') +
            (res.authenticated ? ' — Clé API valide' : ' — Info publique OK'),
          'ok'
        );
      } else {
        showBox(jellyfinDiagBox, (res && res.error) || 'Impossible de joindre Jellyfin.', 'err');
      }
    } finally {
      testJellyfinBtn.disabled = false;
      testJellyfinBtn.textContent = 'Tester Jellyfin';
    }
  });

  refreshServicesBtn.addEventListener('click', async function () {
    var origins = collectOriginsFromInputs();
    if (!ns.utils.buildOriginPattern(seerrUrlInput.value.trim())) {
      showBox(globalFeedback, 'Configurez d’abord l’URL Seerr.', 'err');
      return;
    }

    refreshServicesBtn.disabled = true;
    try {
      var granted = await ns.api.permissionsRequest(origins);
      if (!granted) {
        showBox(globalFeedback, 'Permission réseau refusée.', 'warn');
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
          res.services.servers.length + ' serveur(s) Radarr et leurs profils actualisés.',
          'ok'
        );
      } else {
        showBox(globalFeedback, (res && res.error) || 'Impossible d’actualiser les profils.', 'err');
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
    saveAllLabel.textContent = 'Enregistrement…';

    try {
      if (origins.length > 0) {
        var granted = await ns.api.permissionsRequest(origins);
        if (!granted) {
          showBox(globalFeedback, 'Permission réseau refusée pour les serveurs saisis.', 'warn');
          return;
        }
      }

      var next = collectFormSettings();
      var saveRes = await ns.api.sendMessage({
        type: MSG.SAVE_SETTINGS,
        payload: next
      });

      if (!saveRes || !saveRes.ok) {
        showBox(globalFeedback, (saveRes && saveRes.error) || 'Erreur lors de la sauvegarde.', 'err');
        return;
      }

      showBox(globalFeedback, 'Paramètres enregistrés avec succès.', 'ok');
      if (saveRes.settings && saveRes.settings.seerrUrl) {
        await runSeerrDiagnostic(null, saveRes.settings);
      } else {
        setGlobalBadge('Non configuré', 'pending');
      }
    } catch (err) {
      showBox(globalFeedback, (err && err.message) || 'Erreur inattendue.', 'err');
    } finally {
      saveAllBtn.disabled = false;
      saveAllLabel.textContent = 'Enregistrer tous les paramètres';
    }
  });

  clearCacheBtn.addEventListener('click', async function () {
    var res = await ns.api.sendMessage({ type: MSG.CLEAR_CACHE });
    if (res && res.ok) {
      showBox(globalFeedback, 'Cache des serveurs et profils vidé.', 'ok');
    }
  });

  resetBtn.addEventListener('click', async function () {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'Confirmer la réinitialisation ?';
      resetBtn.classList.add('lbx-btn-danger-armed');
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
      resetTimer = setTimeout(function () {
        resetArmed = false;
        resetBtn.textContent = 'Réinitialiser';
        resetBtn.classList.remove('lbx-btn-danger-armed');
      }, 4500);
      return;
    }

    resetArmed = false;
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    resetBtn.textContent = 'Réinitialiser';
    resetBtn.classList.remove('lbx-btn-danger-armed');

    var res = await ns.api.sendMessage({ type: MSG.RESET_SETTINGS });
    if (res && res.ok) {
      applySettingsToForm(res.settings);
      populateRadarrServers([], null, null, '');
      populateUsers([], null);
      hideBox(seerrDiagBox);
      hideBox(jellyfinDiagBox);
      setGlobalBadge('Non configuré', 'pending');
      showBox(globalFeedback, 'Paramètres réinitialisés.', 'ok');
    }
  });

  init();
})(globalThis);
