(function (global) {
  'use strict';

  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var DEFAULT_TIMEOUT_MS = 12000;

  function makeError(message, details) {
    var err = new Error(message);
    if (details) {
      err.status = details.status || 0;
      err.code = details.code || 'SEERR_ERROR';
      err.rawMessage = details.rawMessage || '';
    }
    return err;
  }

  function translateHttpError(status, bodyText, parsedJson, path) {
    var apiMsg =
      (parsedJson && (parsedJson.message || parsedJson.error)) ||
      (typeof bodyText === 'string' ? bodyText.trim().slice(0, 200) : '');

    if (status === 401) {
      return makeError(
        'Seerr authentication rejected (401). Check your API key or reconnect your session.',
        { status: status, code: 'UNAUTHORIZED', rawMessage: apiMsg }
      );
    }
    if (status === 403) {
      return makeError(
        'Access denied by Seerr (403) on ' + path + '. Check your permissions or the CSRF protection.',
        { status: status, code: 'FORBIDDEN', rawMessage: apiMsg }
      );
    }
    if (status === 404) {
      return makeError('Resource not found on Seerr (404): ' + path, {
        status: status,
        code: 'NOT_FOUND',
        rawMessage: apiMsg
      });
    }
    if (status === 409) {
      return makeError(
        apiMsg || 'This media is already requested or available on Seerr (409).',
        { status: status, code: 'CONFLICT', rawMessage: apiMsg }
      );
    }
    if (status >= 500) {
      return makeError(
        'Internal Seerr server error (' + status + ')' + (apiMsg ? ': ' + apiMsg : '.'),
        { status: status, code: 'SERVER_ERROR', rawMessage: apiMsg }
      );
    }
    return makeError(
      'Seerr error (' + status + ')' + (apiMsg ? ': ' + apiMsg : '.'),
      { status: status, code: 'HTTP_ERROR', rawMessage: apiMsg }
    );
  }

  async function fetchJson(config, path, options) {
    var opts = options || {};
    var baseUrl = ns.utils.normalizeBaseUrl(config && config.seerrUrl);
    if (!baseUrl) {
      throw makeError('Seerr server URL not configured.', { code: 'NO_URL' });
    }

    var authMode = (config && config.authMode) || 'apiKey';
    var headers = {
      Accept: 'application/json'
    };

    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    var credentials = 'omit';
    if (authMode === 'apiKey') {
      var apiKey = config && config.seerrApiKey ? String(config.seerrApiKey).trim() : '';
      if (!apiKey && !opts.allowUnauthenticated) {
        throw makeError('Seerr API key missing.', { code: 'NO_API_KEY' });
      }
      if (apiKey) {
        headers['X-Api-Key'] = apiKey;
      }
    } else if (authMode === 'cookie') {
      // With the session rule the cookie is added to the request already; asking the browser for
      // its own cookies as well makes Safari drop the request's cookie.
      credentials = ns.session && ns.session.isRuleActive() ? 'omit' : 'include';
    }

    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

    var response;
    try {
      response = await fetch(baseUrl + path, {
        method: opts.method || 'GET',
        headers: headers,
        credentials: opts.credentials || credentials,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err && err.name === 'AbortError') {
        throw makeError('Timed out while connecting to Seerr.', {
          code: 'TIMEOUT',
          rawMessage: err.message
        });
      }
      throw makeError(
        'Could not reach the Seerr server (' + baseUrl + '). Check the URL and your network.',
        { code: 'NETWORK_ERROR', rawMessage: err && err.message ? err.message : '' }
      );
    }

    clearTimeout(timeoutId);

    var rawText = '';
    try {
      rawText = await response.text();
    } catch (_readErr) {
      rawText = '';
    }

    var parsedJson = null;
    if (rawText) {
      try {
        parsedJson = JSON.parse(rawText);
      } catch (_jsonErr) {
        parsedJson = null;
      }
    }

    if (!response.ok) {
      throw translateHttpError(response.status, rawText, parsedJson, path);
    }

    return parsedJson;
  }

  function getStatus(config) {
    return fetchJson(config, '/api/v1/status', { allowUnauthenticated: true });
  }

  function getMe(config) {
    return fetchJson(config, '/api/v1/auth/me');
  }


  function getUsers(config) {
    return fetchJson(config, '/api/v1/user?take=50');
  }

  function getMediaDetails(config, mediaType, tmdbId) {
    var cleanType = mediaType === 'tv' ? 'tv' : 'movie';
    return fetchJson(
      config,
      '/api/v1/' + cleanType + '/' + encodeURIComponent(String(tmdbId))
    );
  }

  async function getServiceInstances(config, kind) {
    var serviceKind = kind === 'sonarr' ? 'sonarr' : 'radarr';
    var summaries;

    try {
      summaries = await fetchJson(config, '/api/v1/service/' + serviceKind);
    } catch (err) {
      if (err && err.status === 403) {
        return {
          kind: serviceKind,
          servers: [],
          advancedAllowed: false,
          error: err.message
        };
      }
      throw err;
    }

    if (!Array.isArray(summaries)) {
      return {
        kind: serviceKind,
        servers: [],
        advancedAllowed: true
      };
    }

    var detailResults = await Promise.allSettled(
      summaries.map(function (srv) {
        return fetchJson(
          config,
          '/api/v1/service/' + serviceKind + '/' + encodeURIComponent(String(srv.id))
        );
      })
    );

    var anyForbidden = false;
    var servers = summaries.map(function (summary, idx) {
      var res = detailResults[idx];
      if (res.status === 'fulfilled' && res.value) {
        var detail = res.value;
        var srvObj = detail.server || {};
        return {
          id: summary.id,
          name: srvObj.name || summary.name || (serviceKind === 'sonarr' ? 'Sonarr' : 'Radarr') + ' #' + summary.id,
          is4k: Boolean(srvObj.is4k !== undefined ? srvObj.is4k : summary.is4k),
          isDefault: Boolean(srvObj.isDefault !== undefined ? srvObj.isDefault : summary.isDefault),
          activeProfileId:
            srvObj.activeProfileId !== undefined ? srvObj.activeProfileId : summary.activeProfileId,
          activeDirectory: srvObj.activeDirectory || summary.activeDirectory || '',
          profiles: Array.isArray(detail.profiles) ? detail.profiles : [],
          rootFolders: Array.isArray(detail.rootFolders) ? detail.rootFolders : [],
          tags: Array.isArray(detail.tags) ? detail.tags : [],
          detailError: null
        };
      }

      var reason = res.reason || {};
      if (reason.status === 403) {
        anyForbidden = true;
      }

      return {
        id: summary.id,
        name: summary.name || (serviceKind === 'sonarr' ? 'Sonarr' : 'Radarr') + ' #' + summary.id,
        is4k: Boolean(summary.is4k),
        isDefault: Boolean(summary.isDefault),
        activeProfileId: summary.activeProfileId,
        activeDirectory: summary.activeDirectory || '',
        profiles: [],
        rootFolders: [],
        tags: [],
        detailError: reason.message || 'Could not load profiles.'
      };
    });

    var hasAnyProfiles = servers.some(function (s) {
      return s.profiles.length > 0;
    });

    return {
      kind: serviceKind,
      servers: servers,
      advancedAllowed: !anyForbidden || hasAnyProfiles
    };
  }

  function createRequest(config, payload) {
    var mediaType = payload.mediaType === 'tv' ? 'tv' : 'movie';
    var body = {
      mediaType: mediaType,
      mediaId: Number(payload.tmdbId),
      is4k: Boolean(payload.is4k)
    };

    if (payload.serverId !== undefined && payload.serverId !== null && payload.serverId !== '') {
      body.serverId = Number(payload.serverId);
    }
    if (payload.profileId !== undefined && payload.profileId !== null && payload.profileId !== '') {
      body.profileId = Number(payload.profileId);
    }
    if (payload.rootFolder) {
      body.rootFolder = String(payload.rootFolder);
    }
    if (Array.isArray(payload.tags) && payload.tags.length > 0) {
      body.tags = payload.tags.map(Number).filter(function (n) {
        return Number.isFinite(n);
      });
    }
    var effectiveUserId =
      payload.userId !== undefined && payload.userId !== null && payload.userId !== ''
        ? payload.userId
        : config && config.seerrUserId;
    if (
      config &&
      config.authMode === 'apiKey' &&
      effectiveUserId !== undefined &&
      effectiveUserId !== null &&
      effectiveUserId !== ''
    ) {
      body.userId = Number(effectiveUserId);
    }
    if (mediaType === 'tv' && payload.seasons !== undefined) {
      body.seasons = payload.seasons;
    }

    return fetchJson(config, '/api/v1/request', {
      method: 'POST',
      body: body
    });
  }

  function deleteRequest(config, requestId) {
    return fetchJson(
      config,
      '/api/v1/request/' + encodeURIComponent(String(requestId)),
      { method: 'DELETE' }
    );
  }

  ns.seerr = {
    getStatus: getStatus,
    getMe: getMe,
    getUsers: getUsers,
    getMediaDetails: getMediaDetails,
    getServiceInstances: getServiceInstances,
    createRequest: createRequest,
    deleteRequest: deleteRequest
  };
})(globalThis);
