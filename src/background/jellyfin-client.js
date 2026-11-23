(function (global) {
  'use strict';

  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var DEFAULT_TIMEOUT_MS = 10000;

  function buildJellyfinItemUrl(jellyfinBaseUrl, itemId) {
    var base = ns.utils.normalizeBaseUrl(jellyfinBaseUrl);
    if (!base || !itemId) {
      return '';
    }
    var candidate = base + '/web/index.html#!/details?id=' + encodeURIComponent(String(itemId));
    return ns.utils.isSafeHttpUrl(candidate) ? candidate : '';
  }

  function resolveJellyfinLinks(mediaInfo, customJellyfinUrl) {
    var info = mediaInfo || {};
    var customBase = ns.utils.normalizeBaseUrl(customJellyfinUrl);

    var itemId = info.jellyfinMediaId ? String(info.jellyfinMediaId) : null;
    var itemId4k = info.jellyfinMediaId4k ? String(info.jellyfinMediaId4k) : null;

    var url = '';
    if (customBase && itemId) {
      url = buildJellyfinItemUrl(customBase, itemId);
    } else if (ns.utils.isSafeHttpUrl(info.mediaUrl)) {
      url = info.mediaUrl;
    }

    var url4k = '';
    if (customBase && itemId4k) {
      url4k = buildJellyfinItemUrl(customBase, itemId4k);
    } else if (ns.utils.isSafeHttpUrl(info.mediaUrl4k)) {
      url4k = info.mediaUrl4k;
    }

    if (url4k && url4k === url) {
      url4k = '';
    }

    return {
      url: url || null,
      url4k: url4k || null,
      itemId: itemId,
      itemId4k: itemId4k,
      source: url ? 'seerr' : null
    };
  }

  async function fetchJellyfinJson(baseUrl, apiKey, path) {
    var cleanBase = ns.utils.normalizeBaseUrl(baseUrl);
    if (!cleanBase) {
      throw new Error('Jellyfin URL not configured.');
    }

    var headers = {
      Accept: 'application/json'
    };
    if (apiKey) {
      headers['X-Emby-Token'] = String(apiKey).trim();
    }

    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, DEFAULT_TIMEOUT_MS);

    var response;
    try {
      response = await fetch(cleanBase + path, {
        method: 'GET',
        headers: headers,
        credentials: 'omit',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err && err.name === 'AbortError') {
        throw new Error('Timed out connecting to Jellyfin.');
      }
      throw new Error('Could not reach Jellyfin (' + cleanBase + ').');
    }

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new Error('Jellyfin API key invalid or rejected (' + response.status + ').');
    }
    if (!response.ok) {
      throw new Error('Jellyfin error (' + response.status + ').');
    }

    return response.json();
  }

  async function testJellyfinConnection(jellyfinUrl, jellyfinApiKey) {
    var cleanKey = jellyfinApiKey ? String(jellyfinApiKey).trim() : '';
    var endpoint = cleanKey ? '/System/Info' : '/System/Info/Public';
    var info = await fetchJellyfinJson(jellyfinUrl, cleanKey, endpoint);
    return {
      ok: true,
      serverName: info && info.ServerName ? info.ServerName : 'Jellyfin',
      version: info && info.Version ? info.Version : '',
      id: info && info.Id ? info.Id : '',
      authenticated: Boolean(cleanKey)
    };
  }

  async function searchCandidateItems(baseUrl, apiKey, itemType, searchTerm) {
    var query =
      '/Items?Recursive=true' +
      '&IncludeItemTypes=' + encodeURIComponent(itemType) +
      '&Fields=ProviderIds' +
      '&Limit=25';
    if (searchTerm) {
      query += '&SearchTerm=' + encodeURIComponent(searchTerm);
    }
    var data = await fetchJellyfinJson(baseUrl, apiKey, query);
    return Array.isArray(data && data.Items) ? data.Items : [];
  }

  async function findItemByTmdb(jellyfinUrl, jellyfinApiKey, params) {
    var cleanBase = ns.utils.normalizeBaseUrl(jellyfinUrl);
    var cleanKey = jellyfinApiKey ? String(jellyfinApiKey).trim() : '';
    if (!cleanBase || !cleanKey || !params || !params.tmdbId) {
      return null;
    }

    var targetId = String(params.tmdbId);
    var itemType = params.mediaType === 'tv' ? 'Series' : 'Movie';
    var terms = [];
    if (params.title) {
      terms.push(params.title);
    }
    if (params.originalTitle && params.originalTitle !== params.title) {
      terms.push(params.originalTitle);
    }
    if (terms.length === 0) {
      terms.push('');
    }

    for (var i = 0; i < terms.length; i += 1) {
      var items = await searchCandidateItems(cleanBase, cleanKey, itemType, terms[i]);
      var match = items.find(function (item) {
        var pids = item && item.ProviderIds ? item.ProviderIds : null;
        if (!pids) {
          return false;
        }
        var tmdbVal = pids.Tmdb !== undefined ? pids.Tmdb : pids.tmdb;
        return tmdbVal !== undefined && String(tmdbVal) === targetId;
      });
      if (match && match.Id) {
        return {
          id: String(match.Id),
          name: match.Name || '',
          url: buildJellyfinItemUrl(cleanBase, match.Id)
        };
      }
    }

    return null;
  }

  // Quality label from the widest video stream: 4K, 1080p, 720p or SD.
  function qualityFromWidth(width) {
    var w = Number(width) || 0;
    if (w >= 3200) {
      return '4K';
    }
    if (w >= 1800) {
      return '1080p';
    }
    if (w >= 1200) {
      return '720p';
    }
    return w > 0 ? 'SD' : '';
  }

  async function getItemDetails(jellyfinUrl, jellyfinApiKey, itemId) {
    var cleanKey = jellyfinApiKey ? String(jellyfinApiKey).trim() : '';
    if (!itemId || !cleanKey) {
      return null;
    }
    var data = await fetchJellyfinJson(
      jellyfinUrl,
      cleanKey,
      '/Items?Ids=' + encodeURIComponent(String(itemId)) + '&Fields=MediaSources,DateCreated'
    );
    var item = data && Array.isArray(data.Items) ? data.Items[0] : null;
    if (!item) {
      return null;
    }
    var width = 0;
    (item.MediaSources || []).forEach(function (source) {
      (source.MediaStreams || []).forEach(function (stream) {
        if (stream && stream.Type === 'Video' && Number(stream.Width) > width) {
          width = Number(stream.Width);
        }
      });
    });
    return { quality: qualityFromWidth(width), addedAt: item.DateCreated || null };
  }

  ns.jellyfin = {
    buildJellyfinItemUrl: buildJellyfinItemUrl,
    resolveJellyfinLinks: resolveJellyfinLinks,
    testJellyfinConnection: testJellyfinConnection,
    findItemByTmdb: findItemByTmdb,
    getItemDetails: getItemDetails
  };
})(globalThis);
