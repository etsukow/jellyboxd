(function (global) {
  'use strict';

  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var MSG = ns.MSG;
  var MEDIA_STATUS = ns.MEDIA_STATUS;
  var STORAGE_KEYS = ns.STORAGE_KEYS;

  async function loadSettings() {
    var stored = await ns.api.storageGet(STORAGE_KEYS.settings);
    var raw = (stored && stored[STORAGE_KEYS.settings]) || {};
    var merged = Object.assign({}, ns.DEFAULT_SETTINGS, raw);
    merged.seerrUrl = ns.utils.normalizeBaseUrl(merged.seerrUrl);
    merged.jellyfinUrl = ns.utils.normalizeBaseUrl(merged.jellyfinUrl);
    merged.authMode = merged.authMode === 'cookie' ? 'cookie' : 'apiKey';
    merged.widgetStyle = merged.widgetStyle === 'native' ? 'native' : 'ticket';
    return merged;
  }

  async function saveSettings(partial) {
    var current = await loadSettings();
    var next = Object.assign({}, current, partial || {});
    next.seerrUrl = ns.utils.normalizeBaseUrl(next.seerrUrl);
    next.jellyfinUrl = ns.utils.normalizeBaseUrl(next.jellyfinUrl);
    next.authMode = next.authMode === 'cookie' ? 'cookie' : 'apiKey';
    next.widgetStyle = next.widgetStyle === 'native' ? 'native' : 'ticket';
    next.seerrApiKey = next.seerrApiKey ? String(next.seerrApiKey).trim() : '';
    next.jellyfinApiKey = next.jellyfinApiKey ? String(next.jellyfinApiKey).trim() : '';

    if (next.seerrUserId === '' || next.seerrUserId === undefined) {
      next.seerrUserId = null;
    } else if (next.seerrUserId !== null) {
      next.seerrUserId = Number(next.seerrUserId);
    }

    if (next.defaultRadarrServerId === '' || next.defaultRadarrServerId === undefined) {
      next.defaultRadarrServerId = null;
    } else if (next.defaultRadarrServerId !== null) {
      next.defaultRadarrServerId = Number(next.defaultRadarrServerId);
    }

    if (next.defaultRadarrProfileId === '' || next.defaultRadarrProfileId === undefined) {
      next.defaultRadarrProfileId = null;
    } else if (next.defaultRadarrProfileId !== null) {
      next.defaultRadarrProfileId = Number(next.defaultRadarrProfileId);
    }

    var obj = {};
    obj[STORAGE_KEYS.settings] = next;
    await ns.api.storageSet(obj);

    // Invalidates the profile cache whenever the server/auth configuration changes
    await clearServicesCache();
    return next;
  }

  async function resetSettings() {
    var reset = Object.assign({}, ns.DEFAULT_SETTINGS);
    var obj = {};
    obj[STORAGE_KEYS.settings] = reset;
    await ns.api.storageSet(obj);
    await clearServicesCache();
    return reset;
  }

  function sanitizeSettingsForContent(settings) {
    return {
      seerrUrl: settings.seerrUrl,
      authMode: settings.authMode,
      hasSeerrApiKey: Boolean(settings.seerrApiKey),
      jellyfinUrl: settings.jellyfinUrl,
      hasJellyfinApiKey: Boolean(settings.jellyfinApiKey),
      defaultRadarrServerId: settings.defaultRadarrServerId,
      defaultRadarrProfileId: settings.defaultRadarrProfileId,
      defaultRadarrRootFolder: settings.defaultRadarrRootFolder,
      rememberLastProfile: Boolean(settings.rememberLastProfile),
      expandAdvancedByDefault: Boolean(settings.expandAdvancedByDefault),
      widgetStyle: settings.widgetStyle === 'native' ? 'native' : 'ticket',
      enableTvSupport: Boolean(settings.enableTvSupport),
      lastUsedRadarr: settings.lastUsedRadarr || null,
      lastUsedSonarr: settings.lastUsedSonarr || null
    };
  }

  async function clearServicesCache() {
    await ns.api.storageRemove(STORAGE_KEYS.servicesCache);
  }

  function buildCacheKey(settings) {
    return [
      settings.seerrUrl || '',
      settings.authMode || 'apiKey',
      settings.seerrApiKey ? 'k1' : 'k0'
    ].join('|');
  }

  async function getServicesCached(settings, kind, forceRefresh) {
    var serviceKind = kind === 'sonarr' ? 'sonarr' : 'radarr';
    var cacheKey = buildCacheKey(settings);

    var stored = await ns.api.storageGet(STORAGE_KEYS.servicesCache);
    var cache = (stored && stored[STORAGE_KEYS.servicesCache]) || {};

    if (
      !forceRefresh &&
      cache.key === cacheKey &&
      cache[serviceKind] &&
      typeof cache[serviceKind].fetchedAt === 'number' &&
      Date.now() - cache[serviceKind].fetchedAt < ns.CACHE_TTL_MS
    ) {
      return cache[serviceKind].data;
    }

    var fresh = await ns.seerr.getServiceInstances(settings, serviceKind);

    var nextCache = cache.key === cacheKey ? Object.assign({}, cache) : { key: cacheKey };
    nextCache[serviceKind] = {
      fetchedAt: Date.now(),
      data: fresh
    };
    var storeObj = {};
    storeObj[STORAGE_KEYS.servicesCache] = nextCache;
    await ns.api.storageSet(storeObj);

    return fresh;
  }

  async function hasOriginPermission(url) {
    var pattern = ns.utils.buildOriginPattern(url);
    if (!pattern) {
      return false;
    }
    return ns.api.permissionsContains([pattern]);
  }

  function findProfileName(servers, serverId, profileId) {
    if (!Array.isArray(servers) || profileId === undefined || profileId === null) {
      return null;
    }
    var targetSrv =
      serverId !== undefined && serverId !== null
        ? servers.find(function (s) {
            return Number(s.id) === Number(serverId);
          })
        : null;

    var pool = targetSrv ? [targetSrv] : servers;
    for (var i = 0; i < pool.length; i += 1) {
      var profiles = pool[i].profiles || [];
      for (var j = 0; j < profiles.length; j += 1) {
        if (Number(profiles[j].id) === Number(profileId)) {
          return profiles[j].name;
        }
      }
    }
    return null;
  }

  function normalizeMediaDetails(raw, mediaType, servers) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    var info = raw.mediaInfo || null;
    var requestsRaw = info && Array.isArray(info.requests) ? info.requests : [];
    var requests = requestsRaw.map(function (req) {
      var requestedByName =
        (req.requestedBy &&
          (req.requestedBy.displayName || req.requestedBy.username || req.requestedBy.email)) ||
        'User';
      return {
        id: req.id,
        status: req.status,
        is4k: Boolean(req.is4k),
        serverId: req.serverId !== undefined ? req.serverId : null,
        profileId: req.profileId !== undefined ? req.profileId : null,
        profileName: findProfileName(servers, req.serverId, req.profileId),
        rootFolder: req.rootFolder || '',
        createdAt: req.createdAt || null,
        requestedByName: requestedByName
      };
    });

    var seasons = [];
    if (mediaType === 'tv' && Array.isArray(raw.seasons)) {
      seasons = raw.seasons
        .filter(function (s) {
          return Number(s.seasonNumber) > 0;
        })
        .map(function (s) {
          return {
            seasonNumber: Number(s.seasonNumber),
            name: s.name || 'Season ' + s.seasonNumber,
            episodeCount: s.episodeCount || 0
          };
        });
    }

    return {
      title: raw.title || raw.name || '',
      originalTitle: raw.originalTitle || raw.originalName || '',
      mediaInfo: info
        ? {
            id: info.id,
            status: info.status || MEDIA_STATUS.UNKNOWN,
            status4k: info.status4k || MEDIA_STATUS.UNKNOWN,
            jellyfinMediaId: info.jellyfinMediaId || null,
            jellyfinMediaId4k: info.jellyfinMediaId4k || null,
            mediaUrl: info.mediaUrl || null,
            mediaUrl4k: info.mediaUrl4k || null,
            mediaAddedAt: info.mediaAddedAt || null,
            requests: requests
          }
        : {
            id: null,
            status: MEDIA_STATUS.UNKNOWN,
            status4k: MEDIA_STATUS.UNKNOWN,
            jellyfinMediaId: null,
            jellyfinMediaId4k: null,
            mediaUrl: null,
            mediaUrl4k: null,
            mediaAddedAt: null,
            requests: []
          },
      seasons: seasons
    };
  }

  async function handleGetMediaState(payload) {
    var settings = await loadSettings();
    var tmdbId = payload && payload.tmdbId ? String(payload.tmdbId).trim() : '';
    var rawType = payload && payload.mediaType === 'tv' ? 'tv' : 'movie';
    var effectiveType = rawType === 'tv' && settings.enableTvSupport ? 'tv' : 'movie';
    var forceRefresh = Boolean(payload && payload.forceRefresh);

    var hasSeerr = Boolean(settings.seerrUrl);
    var hasDirectJellyfin = Boolean(settings.jellyfinUrl && settings.jellyfinApiKey);

    if (!hasSeerr && !hasDirectJellyfin) {
      return {
        ok: true,
        configured: false,
        preferences: sanitizeSettingsForContent(settings)
      };
    }

    if (hasSeerr) {
      var seerrPermOk = await hasOriginPermission(settings.seerrUrl);
      if (!seerrPermOk) {
        return {
          ok: true,
          configured: true,
          permissionMissing: true,
          seerrUrl: settings.seerrUrl,
          preferences: sanitizeSettingsForContent(settings)
        };
      }

      if (settings.authMode === 'apiKey' && !settings.seerrApiKey) {
        return {
          ok: true,
          configured: true,
          authMissing: true,
          seerrUrl: settings.seerrUrl,
          preferences: sanitizeSettingsForContent(settings)
        };
      }
    }

    var serviceKind = effectiveType === 'tv' ? 'sonarr' : 'radarr';
    var seerrMediaRaw = null;
    var servicesData = { kind: serviceKind, servers: [], advancedAllowed: true };
    var seerrError = null;

    if (hasSeerr) {
      var settled = await Promise.allSettled([
        ns.seerr.getMediaDetails(settings, effectiveType, tmdbId),
        getServicesCached(settings, serviceKind, forceRefresh)
      ]);

      if (settled[0].status === 'fulfilled') {
        seerrMediaRaw = settled[0].value;
      } else if (
        settings.authMode === 'cookie' &&
        settled[0].reason &&
        (settled[0].reason.status === 401 || settled[0].reason.status === 403)
      ) {
        // The Seerr session ended (or never started): ask the user to sign in again.
        return { ok: true, configured: true, signInRequired: true, seerrUrl: settings.seerrUrl, preferences: sanitizeSettingsForContent(settings) };
      } else {
        seerrError =
          (settled[0].reason && settled[0].reason.message) ||
          'Error fetching the media from Seerr.';
      }

      if (settled[1].status === 'fulfilled' && settled[1].value) {
        servicesData = settled[1].value;
      } else if (settled[1].status === 'rejected' && !seerrError) {
        servicesData = {
          kind: serviceKind,
          servers: [],
          advancedAllowed: false,
          error: settled[1].reason ? settled[1].reason.message : 'Services unavailable.'
        };
      }
    }

    var normalized = normalizeMediaDetails(seerrMediaRaw, effectiveType, servicesData.servers);
    var mediaInfo = normalized ? normalized.mediaInfo : null;

    var jellyfinLinks = ns.jellyfin.resolveJellyfinLinks(mediaInfo, settings.jellyfinUrl);

    // Direct fallback to the Jellyfin API when configured and Seerr provides no link
    if (!jellyfinLinks.url && hasDirectJellyfin) {
      try {
        var jfPermOk = await hasOriginPermission(settings.jellyfinUrl);
        if (jfPermOk) {
          var directMatch = await ns.jellyfin.findItemByTmdb(
            settings.jellyfinUrl,
            settings.jellyfinApiKey,
            {
              tmdbId: tmdbId,
              mediaType: effectiveType,
              title: (payload && payload.title) || (normalized && normalized.title) || '',
              originalTitle:
                (payload && payload.originalTitle) ||
                (normalized && normalized.originalTitle) ||
                '',
              year: payload && payload.year
            }
          );
          if (directMatch && directMatch.url) {
            jellyfinLinks = {
              url: directMatch.url,
              url4k: null,
              itemId: directMatch.id,
              itemId4k: null,
              source: 'jellyfin-direct'
            };
            if (!mediaInfo) {
              mediaInfo = {
                id: null,
                status: MEDIA_STATUS.AVAILABLE,
                status4k: MEDIA_STATUS.UNKNOWN,
                jellyfinMediaId: directMatch.id,
                jellyfinMediaId4k: null,
                mediaUrl: directMatch.url,
                mediaUrl4k: null,
                requests: []
              };
            } else if (mediaInfo.status === MEDIA_STATUS.UNKNOWN) {
              mediaInfo.status = MEDIA_STATUS.AVAILABLE;
            }
          }
        }
      } catch (_jfErr) {
        // Silent: the Jellyfin fallback must not block the Seerr display
      }
    }

    // Quality and date added, read from Jellyfin when an API key is set.
    var details = { quality: '', addedAt: mediaInfo ? mediaInfo.mediaAddedAt : null };
    if (settings.jellyfinUrl && settings.jellyfinApiKey && jellyfinLinks.itemId) {
      try {
        if (await hasOriginPermission(settings.jellyfinUrl)) {
          var itemDetails = await ns.jellyfin.getItemDetails(settings.jellyfinUrl, settings.jellyfinApiKey, jellyfinLinks.itemId);
          if (itemDetails) {
            details.quality = itemDetails.quality || '';
            details.addedAt = itemDetails.addedAt || details.addedAt;
          }
        }
      } catch (_detailsErr) {
        // Optional information: never block the widget for it.
      }
    }

    var seerrMediaUrl = '';
    if (settings.seerrUrl && tmdbId) {
      var candidateSeerrUrl =
        settings.seerrUrl + '/' + (effectiveType === 'tv' ? 'tv' : 'movie') + '/' + encodeURIComponent(tmdbId);
      if (ns.utils.isSafeHttpUrl(candidateSeerrUrl)) {
        seerrMediaUrl = candidateSeerrUrl;
      }
    }

    return {
      ok: true,
      configured: true,
      hasSeerr: hasSeerr,
      seerrError: seerrError,
      mediaType: effectiveType,
      rawMediaType: rawType,
      tmdbId: tmdbId,
      seerrMediaUrl: seerrMediaUrl,
      mediaInfo: mediaInfo,
      seasons: normalized ? normalized.seasons : [],
      services: servicesData,
      jellyfin: jellyfinLinks,
      details: details,
      preferences: sanitizeSettingsForContent(settings)
    };
  }

  async function handleTestSeerrConnection(payload) {
    var saved = await loadSettings();
    var override = (payload && payload.settingsOverride) || {};
    var cfg = Object.assign({}, saved, override);
    cfg.seerrUrl = ns.utils.normalizeBaseUrl(cfg.seerrUrl);

    if (!cfg.seerrUrl) {
      return { ok: false, error: 'Enter the Seerr server URL.' };
    }

    var permOk = await hasOriginPermission(cfg.seerrUrl);
    if (!permOk) {
      return {
        ok: false,
        permissionMissing: true,
        error: 'Network permission required to access ' + cfg.seerrUrl
      };
    }

    var status = await ns.seerr.getStatus(cfg);
    var user = await ns.seerr.getMe(cfg);
    var radarr = await ns.seerr.getServiceInstances(cfg, 'radarr');
    var sonarr = cfg.enableTvSupport
      ? await ns.seerr.getServiceInstances(cfg, 'sonarr')
      : { kind: 'sonarr', servers: [], advancedAllowed: true };

    return {
      ok: true,
      status: status,
      user: {
        id: user && user.id,
        displayName: user && (user.displayName || user.username || user.email),
        email: user && user.email,
        permissions: user && user.permissions
      },
      radarr: radarr,
      sonarr: sonarr
    };
  }


  async function handleTestJellyfinConnection(payload) {
    var saved = await loadSettings();
    var jellyfinUrl = ns.utils.normalizeBaseUrl(
      payload && payload.jellyfinUrl !== undefined ? payload.jellyfinUrl : saved.jellyfinUrl
    );
    var jellyfinApiKey =
      payload && payload.jellyfinApiKey !== undefined
        ? payload.jellyfinApiKey
        : saved.jellyfinApiKey;

    if (!jellyfinUrl) {
      return { ok: false, error: 'Enter the Jellyfin URL.' };
    }

    var permOk = await hasOriginPermission(jellyfinUrl);
    if (!permOk) {
      return {
        ok: false,
        permissionMissing: true,
        error: 'Network permission required to access ' + jellyfinUrl
      };
    }

    return ns.jellyfin.testJellyfinConnection(jellyfinUrl, jellyfinApiKey);
  }

  async function handleGetSeerrUsers(payload) {
    var saved = await loadSettings();
    var override = (payload && payload.settingsOverride) || {};
    var cfg = Object.assign({}, saved, override);
    cfg.seerrUrl = ns.utils.normalizeBaseUrl(cfg.seerrUrl);

    var data = await ns.seerr.getUsers(cfg);
    var results = Array.isArray(data && data.results) ? data.results : [];
    return {
      ok: true,
      users: results.map(function (u) {
        return {
          id: u.id,
          displayName: u.displayName || u.username || u.email || 'User #' + u.id,
          email: u.email || ''
        };
      })
    };
  }

  async function handleGetServices(payload) {
    var saved = await loadSettings();
    var override = (payload && payload.settingsOverride) || {};
    var cfg = Object.assign({}, saved, override);
    cfg.seerrUrl = ns.utils.normalizeBaseUrl(cfg.seerrUrl);

    if (!cfg.seerrUrl) {
      return { ok: false, error: 'Seerr URL not configured.' };
    }

    var kind = payload && payload.kind === 'sonarr' ? 'sonarr' : 'radarr';
    var forceRefresh = Boolean(payload && payload.forceRefresh);
    var services = override.seerrUrl || override.seerrApiKey || override.authMode
      ? await ns.seerr.getServiceInstances(cfg, kind)
      : await getServicesCached(cfg, kind, forceRefresh);

    return { ok: true, services: services };
  }

  async function handleSubmitRequest(payload) {
    var settings = await loadSettings();
    if (!settings.seerrUrl) {
      return { ok: false, error: 'Seerr server not configured.' };
    }

    var requestResult = await ns.seerr.createRequest(settings, payload);

    if (settings.rememberLastProfile && payload.serverId !== undefined && payload.serverId !== null) {
      var lastSnapshot = {
        serverId: Number(payload.serverId),
        profileId:
          payload.profileId !== undefined && payload.profileId !== null && payload.profileId !== ''
            ? Number(payload.profileId)
            : null,
        rootFolder: payload.rootFolder || ''
      };
      var patch = {};
      if (payload.mediaType === 'tv') {
        patch.lastUsedSonarr = lastSnapshot;
      } else {
        patch.lastUsedRadarr = lastSnapshot;
      }
      var nextSettings = Object.assign({}, settings, patch);
      var storeObj = {};
      storeObj[STORAGE_KEYS.settings] = nextSettings;
      await ns.api.storageSet(storeObj);
    }

    var freshState = await handleGetMediaState({
      tmdbId: payload.tmdbId,
      mediaType: payload.mediaType,
      title: payload.title,
      originalTitle: payload.originalTitle,
      year: payload.year,
      forceRefresh: false
    });

    return {
      ok: true,
      request: requestResult,
      state: freshState
    };
  }

  async function handleCancelRequest(payload) {
    var settings = await loadSettings();
    if (!settings.seerrUrl) {
      return { ok: false, error: 'Seerr server not configured.' };
    }
    if (!payload || !payload.requestId) {
      return { ok: false, error: 'Missing request ID.' };
    }

    await ns.seerr.deleteRequest(settings, payload.requestId);

    var freshState = await handleGetMediaState({
      tmdbId: payload.tmdbId,
      mediaType: payload.mediaType,
      title: payload.title,
      originalTitle: payload.originalTitle,
      year: payload.year,
      forceRefresh: false
    });

    return {
      ok: true,
      state: freshState
    };
  }

  function isExtensionPage(sender) {
    var ext = ns.api.raw;
    var base = ext && ext.runtime && typeof ext.runtime.getURL === 'function' ? ext.runtime.getURL('') : '';
    var url = (sender && (sender.url || sender.origin)) || '';
    return Boolean(base) && url.indexOf(base.replace(/\/$/, '')) === 0;
  }

  // Setup started from a Letterboxd page: only the Seerr address comes from the page.
  // Signing in happens in an extension window, where page scripts cannot read what is typed.
  async function handleStartSetup(payload) {
    var seerrUrl = ns.utils.normalizeBaseUrl(payload && payload.seerrUrl);
    if (!seerrUrl || !ns.utils.isSafeHttpUrl(seerrUrl)) {
      return { ok: false, error: 'Enter your Seerr address, for example seerr.example.com.' };
    }
    var settings = await loadSettings();
    if (settings.seerrUrl !== seerrUrl) {
      await saveSettings({ seerrUrl: seerrUrl, seerrApiKey: settings.authMode === 'apiKey' ? '' : settings.seerrApiKey });
    }
    await ns.api.openWindow(ns.api.getUrl('src/setup/setup.html?seerr=' + encodeURIComponent(seerrUrl)), 400, 600);
    return { ok: true, seerrUrl: seerrUrl };
  }

  async function currentUser(settings) {
    try {
      var user = await ns.seerr.getMe(settings);
      return user && user.id ? { displayName: user.displayName || user.username || user.email || user.jellyfinUsername || 'you' } : null;
    } catch (_err) {
      return null;
    }
  }

  // Sign-in from the setup window or the options page: the user's Seerr session, or an API key.
  async function handleSetupSignIn(payload) {
    var seerrUrl = ns.utils.normalizeBaseUrl(payload && payload.seerrUrl);
    var method = payload && payload.method === 'apiKey' ? 'apiKey' : 'cookie';
    if (!seerrUrl) {
      return { ok: false, error: 'Enter your Seerr address.' };
    }
    if (!(await hasOriginPermission(seerrUrl))) {
      return { ok: false, permissionMissing: true, error: 'Allow Jellyboxd to reach ' + seerrUrl + ' first.' };
    }
    if (method === 'apiKey') {
      var apiKey = payload && payload.apiKey ? String(payload.apiKey).trim() : '';
      if (!apiKey) {
        return { ok: false, error: 'Enter your Seerr API key.' };
      }
      var keyUser = await currentUser({ seerrUrl: seerrUrl, authMode: 'apiKey', seerrApiKey: apiKey });
      if (!keyUser) {
        return { ok: false, error: 'Seerr refused this API key.' };
      }
      await saveSettings({ seerrUrl: seerrUrl, authMode: 'apiKey', seerrApiKey: apiKey, setupCompletedAt: Date.now() });
      return { ok: true, signedIn: true, user: keyUser };
    }
    await saveSettings({ seerrUrl: seerrUrl, authMode: 'cookie' });
    return handleCheckSession({ markComplete: true });
  }

  // Is the user signed in to Seerr? Used by the setup window while the user signs in on Seerr.
  async function handleCheckSession(payload) {
    var settings = await loadSettings();
    if (!settings.seerrUrl) {
      return { ok: true, configured: false, signedIn: false };
    }
    var host = settings.seerrUrl.replace(/^https?:\/\//, '');
    if (!(await hasOriginPermission(settings.seerrUrl))) {
      return { ok: true, configured: true, permissionMissing: true, signedIn: false, host: host, seerrUrl: settings.seerrUrl };
    }
    await ns.session.syncSession(settings);
    var user = await currentUser(settings);
    if (user && payload && payload.markComplete) {
      await saveSettings({ setupCompletedAt: Date.now() });
    }
    return { ok: true, configured: true, signedIn: Boolean(user), user: user, authMode: settings.authMode, host: host, seerrUrl: settings.seerrUrl };
  }

  // What the background sees of the Seerr session; values are never returned, only facts.
  async function handleDiagnose(payload) {
    var settings = await loadSettings();
    var out = { context: typeof ServiceWorkerGlobalScope !== 'undefined' && global instanceof ServiceWorkerGlobalScope ? 'service worker' : 'background page' };
    if (!settings.seerrUrl) {
      out.error = 'No Seerr address saved';
      return { ok: true, report: out };
    }
    out.access = await hasOriginPermission(settings.seerrUrl);
    var value = await ns.session.readSessionCookie(settings.seerrUrl);
    out.cookieVisible = Boolean(value);
    if (!value && payload && payload.cookieFromPage) {
      // The page could read it: try the rule with the page's copy.
      value = payload.cookieFromPage;
      out.usedPageCookie = true;
    }
    out.ruleSet = value ? await ns.session.setRule(settings.seerrUrl, value) : false;
    var dnr = ns.api.raw.declarativeNetRequest;
    try {
      out.rules = dnr && dnr.getSessionRules ? (await ns.api.call(dnr, 'getSessionRules', [])).length : 'no API';
    } catch (err) {
      out.rules = 'error: ' + err.message;
    }
    for (var mode of ['omit', 'include']) {
      try {
        out['me_' + mode] = (await fetch(settings.seerrUrl + '/api/v1/auth/me', { credentials: mode, cache: 'no-store' })).status;
      } catch (err) {
        out['me_' + mode] = 'error: ' + err.message;
      }
    }
    return { ok: true, report: out };
  }

  var SEERR_MESSAGES = [
    MSG.TEST_SEERR_CONNECTION, MSG.GET_SEERR_USERS, MSG.GET_SERVICES,
    MSG.GET_MEDIA_STATE, MSG.SUBMIT_REQUEST, MSG.CANCEL_REQUEST
  ];

  async function dispatchMessage(message, sender) {
    var type = message && message.type;
    var payload = (message && message.payload) || {};
    // A content script runs in a web page; the options page, the popup and the setup window are
    // extension pages, even when the options page is opened in a tab.
    var fromContentScript = !isExtensionPage(sender);

    if (SEERR_MESSAGES.indexOf(type) !== -1) {
      await ns.session.syncSession(await loadSettings());
    }

    switch (type) {
      case MSG.GET_CONFIG: {
        var settings = await loadSettings();
        return {
          ok: true,
          settings: fromContentScript ? sanitizeSettingsForContent(settings) : settings
        };
      }
      case MSG.SAVE_SETTINGS: {
        if (fromContentScript) {
          return { ok: false, error: 'Action not allowed from the page.' };
        }
        var updated = await saveSettings(payload);
        return { ok: true, settings: updated };
      }
      case MSG.RESET_SETTINGS: {
        if (fromContentScript) {
          return { ok: false, error: 'Action not allowed from the page.' };
        }
        var reset = await resetSettings();
        return { ok: true, settings: reset };
      }
      case MSG.TEST_SEERR_CONNECTION:
        return handleTestSeerrConnection(payload);
      case MSG.TEST_JELLYFIN_CONNECTION:
        return handleTestJellyfinConnection(payload);
      case MSG.GET_SEERR_USERS:
        return handleGetSeerrUsers(payload);
      case MSG.GET_SERVICES:
        return handleGetServices(payload);
      case MSG.GET_MEDIA_STATE:
        return handleGetMediaState(payload);
      case MSG.SUBMIT_REQUEST:
        return handleSubmitRequest(payload);
      case MSG.CANCEL_REQUEST:
        return handleCancelRequest(payload);
      case MSG.CLEAR_CACHE:
        await clearServicesCache();
        return { ok: true };
      case MSG.START_SETUP:
        return handleStartSetup(payload);
      case MSG.DIAGNOSE:
        if (fromContentScript) {
          return { ok: false, error: 'Action not allowed from the page.' };
        }
        return handleDiagnose(payload);
      case MSG.CHECK_SESSION:
        return handleCheckSession(payload);
      case MSG.SETUP_SIGNIN:
        if (fromContentScript) {
          return { ok: false, error: 'Action not allowed from the page.' };
        }
        return handleSetupSignIn(payload);
      case MSG.OPEN_OPTIONS:
        await ns.api.openOptionsPage();
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown message: ' + String(type) };
    }
  }

  ns.session.watchCookies(loadSettings);
  loadSettings().then(ns.session.syncSession);

  // IMPORTANT: synchronous listener that returns `true` to keep the message channel open under Chrome MV3
  ns.api.raw.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    dispatchMessage(message, sender)
      .then(function (result) {
        sendResponse(result);
      })
      .catch(function (err) {
        sendResponse({
          ok: false,
          error: (err && err.message) || 'Unexpected error in the extension.',
          status: (err && err.status) || 0,
          code: (err && err.code) || 'INTERNAL_ERROR'
        });
      });
    return true;
  });
})(globalThis);
