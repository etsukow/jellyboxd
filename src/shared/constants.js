(function (global) {
  'use strict';

  var ns = (global.LbxSeerr = global.LbxSeerr || {});

  // Enumération Seerr / Jellyseerr / Overseerr (1-based)
  var MEDIA_STATUS = Object.freeze({
    UNKNOWN: 1,
    PENDING: 2,
    PROCESSING: 3,
    PARTIAL: 4,
    AVAILABLE: 5,
    BLOCKLISTED: 6,
    DELETED: 7
  });

  var REQUEST_STATUS = Object.freeze({
    PENDING_APPROVAL: 1,
    APPROVED: 2,
    DECLINED: 3,
    FAILED: 4,
    COMPLETED: 5
  });

  var MEDIA_STATUS_META = Object.freeze({
    1: { label: 'Non disponible', shortLabel: 'Absent', tone: 'unknown' },
    2: { label: 'En attente', shortLabel: 'Attente', tone: 'pending' },
    3: { label: 'En cours', shortLabel: 'En cours', tone: 'processing' },
    4: { label: 'Partiel', shortLabel: 'Partiel', tone: 'partial' },
    5: { label: 'Disponible', shortLabel: 'Dispo', tone: 'available' },
    6: { label: 'Bloqué', shortLabel: 'Bloqué', tone: 'blocked' },
    7: { label: 'Supprimé', shortLabel: 'Supprimé', tone: 'unknown' }
  });

  var REQUEST_STATUS_META = Object.freeze({
    1: { label: 'En attente d’approbation', tone: 'pending' },
    2: { label: 'Approuvée', tone: 'processing' },
    3: { label: 'Refusée', tone: 'blocked' },
    4: { label: 'Échouée', tone: 'blocked' },
    5: { label: 'Terminée', tone: 'available' }
  });

  var DEFAULT_SETTINGS = Object.freeze({
    seerrUrl: '',
    authMode: 'apiKey', // 'apiKey' | 'cookie'
    seerrApiKey: '',
    seerrUserId: null,
    jellyfinUrl: '',
    jellyfinApiKey: '',
    defaultRadarrServerId: null,
    defaultRadarrProfileId: null,
    defaultRadarrRootFolder: '',
    rememberLastProfile: true,
    expandAdvancedByDefault: false,
    widgetStyle: 'native', // 'native' | 'ticket'
    enableTvSupport: true,
    lastUsedRadarr: null,
    lastUsedSonarr: null
  });

  var STORAGE_KEYS = Object.freeze({
    settings: 'lbxSeerrSettings',
    servicesCache: 'lbxSeerrServicesCache'
  });

  var CACHE_TTL_MS = 5 * 60 * 1000;

  var MSG = Object.freeze({
    GET_CONFIG: 'LBX_GET_CONFIG',
    SAVE_SETTINGS: 'LBX_SAVE_SETTINGS',
    RESET_SETTINGS: 'LBX_RESET_SETTINGS',
    TEST_SEERR_CONNECTION: 'LBX_TEST_SEERR_CONNECTION',
    SEERR_JELLYFIN_LOGIN: 'LBX_SEERR_JELLYFIN_LOGIN',
    TEST_JELLYFIN_CONNECTION: 'LBX_TEST_JELLYFIN_CONNECTION',
    GET_SEERR_USERS: 'LBX_GET_SEERR_USERS',
    GET_SERVICES: 'LBX_GET_SERVICES',
    GET_MEDIA_STATE: 'LBX_GET_MEDIA_STATE',
    SUBMIT_REQUEST: 'LBX_SUBMIT_REQUEST',
    CANCEL_REQUEST: 'LBX_CANCEL_REQUEST',
    CLEAR_CACHE: 'LBX_CLEAR_CACHE',
    OPEN_OPTIONS: 'LBX_OPEN_OPTIONS'
  });

  function normalizeBaseUrl(raw) {
    if (!raw || typeof raw !== 'string') {
      return '';
    }
    var trimmed = raw.trim();
    if (!trimmed) {
      return '';
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = 'http://' + trimmed;
    }
    try {
      var parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      var cleanPath = parsed.pathname.replace(/\/+$/, '');
      return parsed.origin + cleanPath;
    } catch (_err) {
      return '';
    }
  }

  function buildOriginPattern(rawUrl) {
    var normalized = normalizeBaseUrl(rawUrl);
    if (!normalized) {
      return '';
    }
    try {
      var parsed = new URL(normalized);
      var host = parsed.hostname;
      if (!host) {
        return '';
      }
      if (host.indexOf(':') !== -1 && host.charAt(0) !== '[') {
        host = '[' + host + ']';
      }
      // Omet volontairement le port : Chrome et Firefox traitent sans port comme wildcard de port
      return parsed.protocol + '//' + host + '/*';
    } catch (_err) {
      return '';
    }
  }

  function isSafeHttpUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return false;
    }
    try {
      var parsed = new URL(rawUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_err) {
      return false;
    }
  }

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) {
      return '';
    }
    var units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
    var val = bytes;
    var idx = 0;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx += 1;
    }
    var formatted = idx === 0 ? String(Math.round(val)) : val.toFixed(1).replace('.', ',');
    return formatted + ' ' + units[idx];
  }

  function canRequestStatus(status) {
    return !status || status === MEDIA_STATUS.UNKNOWN || status === MEDIA_STATUS.DELETED;
  }

  function getMediaStatusMeta(status) {
    return MEDIA_STATUS_META[status] || MEDIA_STATUS_META[MEDIA_STATUS.UNKNOWN];
  }

  function getRequestStatusMeta(status) {
    return REQUEST_STATUS_META[status] || { label: 'Inconnue', tone: 'unknown' };
  }

  function pickDefaultServer(servers, preferredServerId, lastUsed, mediaInfo) {
    if (!Array.isArray(servers) || servers.length === 0) {
      return null;
    }

    // Privilégie la piste (HD ou 4K) qui peut encore être demandée
    var statusHd = mediaInfo && mediaInfo.status ? mediaInfo.status : MEDIA_STATUS.UNKNOWN;
    var status4k = mediaInfo && mediaInfo.status4k ? mediaInfo.status4k : MEDIA_STATUS.UNKNOWN;
    var requestableServers = servers.filter(function (srv) {
      return srv.is4k ? canRequestStatus(status4k) : canRequestStatus(statusHd);
    });
    var pool = requestableServers.length > 0 ? requestableServers : servers;

    if (lastUsed && lastUsed.serverId != null) {
      var fromLast = pool.find(function (srv) {
        return Number(srv.id) === Number(lastUsed.serverId);
      });
      if (fromLast) {
        return fromLast;
      }
    }

    if (preferredServerId != null) {
      var fromPref = pool.find(function (srv) {
        return Number(srv.id) === Number(preferredServerId);
      });
      if (fromPref) {
        return fromPref;
      }
    }

    var defaultNon4k = pool.find(function (srv) {
      return srv.isDefault && !srv.is4k;
    });
    if (defaultNon4k) {
      return defaultNon4k;
    }

    var anyDefault = pool.find(function (srv) {
      return Boolean(srv.isDefault);
    });
    return anyDefault || pool[0];
  }

  function pickDefaultProfileId(server, preferredServerId, preferredProfileId, lastUsed) {
    if (!server || !Array.isArray(server.profiles) || server.profiles.length === 0) {
      return null;
    }

    var hasProfile = function (pid) {
      if (pid == null || pid === '') {
        return false;
      }
      return server.profiles.some(function (p) {
        return Number(p.id) === Number(pid);
      });
    };

    if (
      lastUsed &&
      Number(lastUsed.serverId) === Number(server.id) &&
      hasProfile(lastUsed.profileId)
    ) {
      return Number(lastUsed.profileId);
    }

    if (
      preferredServerId != null &&
      Number(preferredServerId) === Number(server.id) &&
      hasProfile(preferredProfileId)
    ) {
      return Number(preferredProfileId);
    }

    if (hasProfile(server.activeProfileId)) {
      return Number(server.activeProfileId);
    }

    return Number(server.profiles[0].id);
  }

  function pickDefaultRootFolder(server, preferredServerId, preferredRootFolder, lastUsed) {
    if (!server || !Array.isArray(server.rootFolders) || server.rootFolders.length === 0) {
      return server && server.activeDirectory ? server.activeDirectory : '';
    }

    var hasFolder = function (path) {
      if (!path) {
        return false;
      }
      return server.rootFolders.some(function (f) {
        return f.path === path;
      });
    };

    if (
      lastUsed &&
      Number(lastUsed.serverId) === Number(server.id) &&
      hasFolder(lastUsed.rootFolder)
    ) {
      return lastUsed.rootFolder;
    }

    if (
      preferredServerId != null &&
      Number(preferredServerId) === Number(server.id) &&
      hasFolder(preferredRootFolder)
    ) {
      return preferredRootFolder;
    }

    if (hasFolder(server.activeDirectory)) {
      return server.activeDirectory;
    }

    return server.rootFolders[0].path || '';
  }

  ns.MEDIA_STATUS = MEDIA_STATUS;
  ns.REQUEST_STATUS = REQUEST_STATUS;
  ns.MEDIA_STATUS_META = MEDIA_STATUS_META;
  ns.REQUEST_STATUS_META = REQUEST_STATUS_META;
  ns.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  ns.STORAGE_KEYS = STORAGE_KEYS;
  ns.CACHE_TTL_MS = CACHE_TTL_MS;
  ns.MSG = MSG;

  ns.utils = {
    normalizeBaseUrl: normalizeBaseUrl,
    buildOriginPattern: buildOriginPattern,
    isSafeHttpUrl: isSafeHttpUrl,
    formatBytes: formatBytes,
    canRequestStatus: canRequestStatus,
    getMediaStatusMeta: getMediaStatusMeta,
    getRequestStatusMeta: getRequestStatusMeta,
    pickDefaultServer: pickDefaultServer,
    pickDefaultProfileId: pickDefaultProfileId,
    pickDefaultRootFolder: pickDefaultRootFolder
  };
})(globalThis);
