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
    merged.widgetStyle = merged.widgetStyle === 'ticket' ? 'ticket' : 'native';
    return merged;
  }

  async function saveSettings(partial) {
    var current = await loadSettings();
    var next = Object.assign({}, current, partial || {});
    next.seerrUrl = ns.utils.normalizeBaseUrl(next.seerrUrl);
    next.jellyfinUrl = ns.utils.normalizeBaseUrl(next.jellyfinUrl);
    next.authMode = next.authMode === 'cookie' ? 'cookie' : 'apiKey';
    next.widgetStyle = next.widgetStyle === 'ticket' ? 'ticket' : 'native';
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
      widgetStyle: settings.widgetStyle === 'ticket' ? 'ticket' : 'native',
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
        configured: false
      };
    }

    if (hasSeerr) {
      var seerrPermOk = await hasOriginPermission(settings.seerrUrl);
      if (!seerrPermOk) {
        return {
          ok: true,
          configured: true,
          permissionMissing: true,
          seerrUrl: settings.seerrUrl
        };
      }

      if (settings.authMode === 'apiKey' && !settings.seerrApiKey) {
        return {
          ok: true,
          configured: true,
          authMissing: true,
          seerrUrl: settings.seerrUrl
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

  async function handleSeerrJellyfinLogin(payload) {
    var seerrUrl = ns.utils.normalizeBaseUrl(payload && payload.seerrUrl);
    var username = payload && payload.username ? String(payload.username).trim() : '';
    var password = payload && payload.password ? String(payload.password) : '';

    if (!seerrUrl) {
      return { ok: false, error: 'Seerr URL required.' };
    }
    if (!username) {
      return { ok: false, error: 'Jellyfin username required.' };
    }

    var permOk = await hasOriginPermission(seerrUrl);
    if (!permOk) {
      return {
        ok: false,
        permissionMissing: true,
        error: 'Network permission required for ' + seerrUrl
      };
    }

    var user = await ns.seerr.loginWithJellyfin(seerrUrl, username, password);
    return {
      ok: true,
      user: {
        id: user && user.id,
        displayName: user && (user.displayName || user.username || user.email)
      }
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

  async function dispatchMessage(message, sender) {
    var type = message && message.type;
    var payload = (message && message.payload) || {};
    var fromContentScript = Boolean(sender && sender.tab);

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
      case MSG.SEERR_JELLYFIN_LOGIN:
        return handleSeerrJellyfinLogin(payload);
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
      case MSG.OPEN_OPTIONS:
        await ns.api.openOptionsPage();
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown message: ' + String(type) };
    }
  }

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
