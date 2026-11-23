(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  if (!ns || !ns.api || !ns.utils) {
    return;
  }

  var MSG = ns.MSG;
  var MEDIA_STATUS = ns.MEDIA_STATUS;
  var REQUEST_STATUS = ns.REQUEST_STATUS;
  var ROOT_ID = 'lbx-seerr-root';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var currentFilm = null;
  var currentState = null;
  var isLoading = false;
  var isSubmitting = false;
  var feedback = null; // { type: 'success'|'error', text: string }
  var confirmCancelId = null;
  var confirmTimer = null;
  var widgetStyle = 'ticket'; // 'native' | 'ticket' (user setting "Widget style")
  var formOpen = false;
  var setupPending = false; // the sign-in window was opened from this page
  var forceAddress = false; // "Change server" was clicked
  var setupDraft = ''; // what the user typed in the address field
  var setupError = null; // request form is folded when the film can already be watched

  var formSelection = {
    serverId: null,
    profileId: null,
    rootFolder: '',
    tags: [],
    allSeasons: true,
    seasons: []
  };

  // Status wording shown on the page (the tone comes from MEDIA_STATUS_META).
  var STATUS_TEXT = {};
  STATUS_TEXT[MEDIA_STATUS.UNKNOWN] = 'Not available';
  STATUS_TEXT[MEDIA_STATUS.PENDING] = 'Pending';
  STATUS_TEXT[MEDIA_STATUS.PROCESSING] = 'Downloading';
  STATUS_TEXT[MEDIA_STATUS.PARTIAL] = 'Partially available';
  STATUS_TEXT[MEDIA_STATUS.AVAILABLE] = 'Available';
  STATUS_TEXT[MEDIA_STATUS.BLOCKLISTED] = 'Blocked';
  STATUS_TEXT[MEDIA_STATUS.DELETED] = 'Not available';

  // Short wording for the ticket's "Status" field.
  var STATUS_SHORT = {};
  STATUS_SHORT[MEDIA_STATUS.UNKNOWN] = 'Missing';
  STATUS_SHORT[MEDIA_STATUS.PENDING] = 'Pending';
  STATUS_SHORT[MEDIA_STATUS.PROCESSING] = 'Fetching';
  STATUS_SHORT[MEDIA_STATUS.PARTIAL] = 'Partial';
  STATUS_SHORT[MEDIA_STATUS.AVAILABLE] = 'Available';
  STATUS_SHORT[MEDIA_STATUS.BLOCKLISTED] = 'Blocked';
  STATUS_SHORT[MEDIA_STATUS.DELETED] = 'Missing';

  var ICONS = {
    arrow: [{ d: 'M5 12h14M13 6l6 6-6 6' }],
    lock: [{ tag: 'rect', x: '5', y: '11', width: '14', height: '9', rx: '2' }, { d: 'M8 11V8a4 4 0 0 1 8 0v3' }],
    play: [{ tag: 'polygon', points: '6 4 20 12 6 20 6 4', fill: 'currentColor', stroke: 'none' }],
    plus: [
      { tag: 'line', x1: '12', y1: '5', x2: '12', y2: '19' },
      { tag: 'line', x1: '5', y1: '12', x2: '19', y2: '12' }
    ],
    ext: [
      { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
      { tag: 'polyline', points: '15 3 21 3 21 9' },
      { tag: 'line', x1: '10', y1: '14', x2: '21', y2: '3' }
    ]
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function svgIcon(paths, viewBox) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', viewBox || '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (item) {
      var child = document.createElementNS(SVG_NS, item.tag || 'path');
      Object.keys(item).forEach(function (attr) {
        if (attr !== 'tag') {
          child.setAttribute(attr, item[attr]);
        }
      });
      svg.appendChild(child);
    });
    return svg;
  }

  function icon(name) {
    return svgIcon(ICONS[name]);
  }

  function dot(tone) {
    return el('span', 'lbx-dot lbx-tone-' + (tone || 'unknown'));
  }

  // "12 Nov", or "12 Nov 2024" for another year.
  function formatDate(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) {
      return '';
    }
    var opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) {
      opts.year = 'numeric';
    }
    return d.toLocaleDateString('en-GB', opts);
  }

  // "5 min ago", "2 h ago", "3 days ago", then a date.
  function relativeTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) {
      return '';
    }
    var minutes = Math.round((Date.now() - d.getTime()) / 60000);
    if (minutes < 1) {
      return 'just now';
    }
    if (minutes < 60) {
      return minutes + ' min ago';
    }
    var hours = Math.round(minutes / 60);
    if (hours < 24) {
      return hours + ' h ago';
    }
    var days = Math.round(hours / 24);
    return days < 14 ? days + (days === 1 ? ' day ago' : ' days ago') : formatDate(iso);
  }

  // Reads the film from a Letterboxd film page: the current one, or one fetched for a review.
  function extractFilmMeta(doc) {
    doc = doc || document;
    var tmdbId = doc.body ? doc.body.getAttribute('data-tmdb-id') : '';
    var tmdbType = doc.body ? doc.body.getAttribute('data-tmdb-type') : '';

    if (!tmdbId || !/^\d+$/.test(tmdbId.trim())) {
      var tmdbLink = doc.querySelector(
        'a[href*="themoviedb.org/movie/"], a[href*="themoviedb.org/tv/"]'
      );
      if (tmdbLink) {
        var match = tmdbLink.getAttribute('href').match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
        if (match) {
          tmdbType = match[1].toLowerCase();
          tmdbId = match[2];
        }
      }
    }

    if (!tmdbId || !/^\d+$/.test(tmdbId.trim())) {
      return null;
    }

    // The page's first <h1> is the site logo: read the film's own heading, then the share title.
    var titleNode = doc.querySelector('h1.primaryname, .production-masthead h1.headline-1, .film-title-wrapper h1');
    var title = titleNode ? titleNode.textContent.replace(/\s+/g, ' ').trim() : '';
    var ogTitle = doc.querySelector('meta[property="og:title"]');
    var ogText = ogTitle ? ogTitle.getAttribute('content') || '' : '';
    if (!title) {
      title = ogText.replace(/\s*\(\d{4}\)\s*$/, '').trim();
    }

    var origNode = doc.querySelector('.originalname, h2.originalname');
    var originalTitle = origNode ? origNode.textContent.trim() : '';

    var yearNode = doc.querySelector('.releasedate a, .releasedate, .releaseyear a, a[href*="/films/year/"]');
    var year = yearNode ? (yearNode.textContent.match(/\d{4}/) || [''])[0] : '';
    if (!year) {
      year = (ogText.match(/\((\d{4})\)\s*$/) || ['', ''])[1];
    }

    var linked = readLinkedData(doc);

    return {
      tmdbId: tmdbId.trim(),
      mediaType: tmdbType && tmdbType.toLowerCase() === 'tv' ? 'tv' : 'movie',
      title: title,
      originalTitle: originalTitle,
      year: year,
      poster: linked.poster,
      directors: linked.directors
    };
  }

  // Letterboxd describes the film in JSON-LD: its poster (on Letterboxd's own image server) and directors.
  function readLinkedData(doc) {
    var out = { poster: '', directors: [] };
    var node = doc.querySelector('script[type="application/ld+json"]');
    if (!node) {
      return out;
    }
    try {
      var data = JSON.parse(node.textContent.replace(/\/\*[\s\S]*?\*\//g, ''));
      if (typeof data.image === 'string' && /^https:\/\/[a-z0-9.-]*ltrbxd\.com\//i.test(data.image)) {
        out.poster = data.image;
      }
      var directors = Array.isArray(data.director) ? data.director : data.director ? [data.director] : [];
      out.directors = directors
        .map(function (d) {
          return d && typeof d.name === 'string' ? d.name : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    } catch (_err) {
      // No structured data: the popup shows the film without poster.
    }
    return out;
  }

  // Review pages (/<member>/film/<slug>/, or /<n>/ for a rewatch) carry no TMDB id: read it from the
  // film's own page, once per tab session.
  function reviewFilmSlug() {
    var match = global.location.pathname.match(/^\/[^/]+\/film\/([^/]+)\/(?:\d+\/)?$/);
    return match ? match[1] : '';
  }

  async function fetchReviewedFilm(slug) {
    var cacheKey = 'jellyboxd:film:' + slug;
    try {
      var cached = JSON.parse(global.sessionStorage.getItem(cacheKey) || 'null');
      if (cached && cached.tmdbId) {
        return cached;
      }
    } catch (_err) {
      // No cache.
    }
    try {
      var res = await fetch('/film/' + encodeURIComponent(slug) + '/', { credentials: 'same-origin' });
      if (!res.ok) {
        return null;
      }
      var doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      var film = extractFilmMeta(doc);
      if (film) {
        try {
          global.sessionStorage.setItem(cacheKey, JSON.stringify(film));
        } catch (_err) {
          // Cache is optional.
        }
      }
      return film;
    } catch (_err) {
      return null;
    }
  }

  async function resolveFilm() {
    var slug = reviewFilmSlug();
    return slug ? fetchReviewedFilm(slug) : extractFilmMeta();
  }

  function findMountTarget() {
    var userpanel = document.getElementById('userpanel');
    if (userpanel && userpanel.parentNode) {
      return { mode: 'after', node: userpanel };
    }

    var actionsSection = document.querySelector('aside.sidebar section.actions-panel, section.actions-panel');
    if (actionsSection && actionsSection.parentNode) {
      return { mode: 'after', node: actionsSection };
    }

    var watchSection = document.querySelector('aside.sidebar section#watch, section#watch');
    if (watchSection && watchSection.parentNode) {
      return { mode: 'before', node: watchSection };
    }

    var sidebar = document.querySelector('aside.sidebar, .col-6.sidebar');
    if (sidebar) {
      var poster = sidebar.querySelector('.film-poster');
      if (poster && poster.parentNode === sidebar) {
        return { mode: 'after', node: poster };
      }
      return { mode: 'prepend', node: sidebar };
    }

    return null;
  }

  function ensureRootMounted() {
    var existing = document.getElementById(ROOT_ID);
    var root = existing;

    if (!existing || !document.body.contains(existing)) {
      var target = findMountTarget();
      if (!target) {
        return existing;
      }
      root = existing || el('section');
      root.id = ROOT_ID;
      if (target.mode === 'after') {
        target.node.insertAdjacentElement('afterend', root);
      } else if (target.mode === 'before') {
        target.node.insertAdjacentElement('beforebegin', root);
      } else {
        target.node.insertBefore(root, target.node.firstChild);
      }
    }

    root.className = 'lbx-w lbx-w-' + widgetStyle;
    root.setAttribute('aria-label', 'Availability on Seerr / Jellyfin');
    return root;
  }

  function getRequestableServers(state) {
    var servers = (state && state.services && state.services.servers) || [];
    var info = (state && state.mediaInfo) || {};
    var statusHd = info.status || MEDIA_STATUS.UNKNOWN;
    var status4k = info.status4k || MEDIA_STATUS.UNKNOWN;

    return servers.filter(function (srv) {
      return srv.is4k ? ns.utils.canRequestStatus(status4k) : ns.utils.canRequestStatus(statusHd);
    });
  }

  function syncFormDefaults(state) {
    var servers = getRequestableServers(state);
    var prefs = (state && state.preferences) || {};
    var lastUsed = state.mediaType === 'tv' ? prefs.lastUsedSonarr : prefs.lastUsedRadarr;
    var useLast = prefs.rememberLastProfile ? lastUsed : null;

    var selectedServer = null;
    if (formSelection.serverId !== null) {
      selectedServer = servers.find(function (s) {
        return Number(s.id) === Number(formSelection.serverId);
      });
    }
    if (!selectedServer) {
      selectedServer = ns.utils.pickDefaultServer(
        servers,
        state.mediaType === 'tv' ? null : prefs.defaultRadarrServerId,
        useLast,
        state.mediaInfo
      );
    }

    formSelection.serverId = selectedServer ? Number(selectedServer.id) : null;

    if (selectedServer) {
      var profileValid =
        formSelection.profileId !== null &&
        Array.isArray(selectedServer.profiles) &&
        selectedServer.profiles.some(function (p) {
          return Number(p.id) === Number(formSelection.profileId);
        });

      if (!profileValid) {
        formSelection.profileId = ns.utils.pickDefaultProfileId(
          selectedServer,
          state.mediaType === 'tv' ? null : prefs.defaultRadarrServerId,
          state.mediaType === 'tv' ? null : prefs.defaultRadarrProfileId,
          useLast
        );
      }

      var folderValid =
        formSelection.rootFolder &&
        Array.isArray(selectedServer.rootFolders) &&
        selectedServer.rootFolders.some(function (f) {
          return f.path === formSelection.rootFolder;
        });

      if (!folderValid) {
        formSelection.rootFolder = ns.utils.pickDefaultRootFolder(
          selectedServer,
          state.mediaType === 'tv' ? null : prefs.defaultRadarrServerId,
          state.mediaType === 'tv' ? '' : prefs.defaultRadarrRootFolder,
          useLast
        );
      }

      var validTagIds = (selectedServer.tags || []).map(function (t) {
        return Number(t.id);
      });
      formSelection.tags = formSelection.tags.filter(function (tid) {
        return validTagIds.indexOf(Number(tid)) !== -1;
      });
    } else {
      formSelection.profileId = null;
      formSelection.rootFolder = '';
      formSelection.tags = [];
    }

    if (state.mediaType === 'tv' && Array.isArray(state.seasons) && formSelection.seasons.length === 0) {
      formSelection.seasons = state.seasons.map(function (s) {
        return Number(s.seasonNumber);
      });
    }

    return selectedServer;
  }

  /* ------------------------------------------------------------------
     View model shared by both styles
     ------------------------------------------------------------------ */

  function toneOf(status) {
    return ns.utils.getMediaStatusMeta(status).tone;
  }

  function isKnownStatus(status) {
    return Boolean(status) && status !== MEDIA_STATUS.UNKNOWN && status !== MEDIA_STATUS.DELETED;
  }

  function jellyfinConfigured(state) {
    return Boolean(state && state.preferences && state.preferences.jellyfinUrl);
  }

  // Describes what to show, without drawing anything.
  function buildView(state) {
    var info = state.mediaInfo || {
      status: MEDIA_STATUS.UNKNOWN,
      status4k: MEDIA_STATUS.UNKNOWN,
      requests: []
    };
    var st = info.status || MEDIA_STATUS.UNKNOWN;
    var st4 = info.status4k || MEDIA_STATUS.UNKNOWN;
    var jf = state.jellyfin || {};
    var jfConf = jellyfinConfigured(state);
    var allServers = (state.services && state.services.servers) || [];
    var has4kServer = allServers.some(function (s) {
      return Boolean(s.is4k);
    });
    var seerrUrl = ns.utils.isSafeHttpUrl(state.seerrMediaUrl) ? state.seerrMediaUrl : '';

    var view = {
      watch: [],
      status: null,
      openSeerr: '',
      extra: [],
      requests: [],
      form: null,
      seerrUrl: seerrUrl,
      quality: (state.details && state.details.quality) || '',
      addedAt: (state.details && state.details.addedAt) || null,
      headline: '',
      serverLabel: jfConf || jf.source === 'jellyfin-direct' ? 'Jellyfin' : 'Seerr'
    };

    // 1. Playback links. When one exists it doubles as the status.
    if (ns.utils.isSafeHttpUrl(jf.url)) {
      // Without a Jellyfin URL the link comes from Seerr, whose media server may not be Jellyfin.
      view.watch.push({ label: jfConf ? 'Watch on Jellyfin' : 'Watch', url: jf.url });
    }
    if (ns.utils.isSafeHttpUrl(jf.url4k)) {
      view.watch.push({ label: 'Watch in 4K', url: jf.url4k });
    }

    // 2. Status, only when there is no "watch" link.
    if (view.watch.length === 0) {
      var text = STATUS_TEXT[st] || STATUS_TEXT[MEDIA_STATUS.UNKNOWN];
      if (!isKnownStatus(st) && (jfConf || !state.hasSeerr)) {
        text = 'Not on Jellyfin';
      }
      view.status = { tone: toneOf(st), text: text, short: STATUS_SHORT[st] || 'Missing', sub: '' };
      if ((st === MEDIA_STATUS.AVAILABLE || st === MEDIA_STATUS.PARTIAL) && seerrUrl) {
        view.openSeerr = seerrUrl;
      }
    }

    // 3. 4K status: Seerr tracks one status for its 4K servers, whatever their profiles.
    if ((has4kServer || isKnownStatus(st4)) && isKnownStatus(st4) && !ns.utils.isSafeHttpUrl(jf.url4k)) {
      view.extra.push({ tone: toneOf(st4), text: '4K · ' + (STATUS_TEXT[st4] || '') });
    }

    // 4. Existing requests.
    var requests = info.requests || [];
    requests.forEach(function (req) {
      var meta = ns.utils.getRequestStatusMeta(req.status);
      var subParts = [];
      if (req.profileName) {
        subParts.push(req.profileName);
      }
      if (req.requestedByName) {
        subParts.push('by ' + req.requestedByName);
      }
      view.requests.push({
        id: req.id,
        createdAt: req.createdAt || null,
        profileName: req.profileName || '',
        requestedBy: req.requestedByName || '',
        statusLabel: meta.label,
        status: req.status,
        is4k: Boolean(req.is4k),
        tone: meta.tone,
        title: 'Request ' + (req.is4k ? '4K ' : '') + meta.label.charAt(0).toLowerCase() + meta.label.slice(1),
        sub: subParts.join(' · '),
        cancellable:
          Boolean(req.id) &&
          (req.status === REQUEST_STATUS.PENDING_APPROVAL || req.status === REQUEST_STATUS.APPROVED),
        merged: false
      });
    });

    // A single regular request next to a status line: show both on one line.
    var regular = view.requests.filter(function (r) {
      return !r.is4k;
    });
    if (view.status && !view.openSeerr && regular.length === 1) {
      view.status.sub = regular[0].sub;
      regular[0].merged = true;
    }

    // Ticket headline: the screening, never the film's title (Letterboxd already shows it).
    var regularRequest = view.requests.filter(function (r) {
      return !r.is4k;
    })[0];
    if (view.watch.length > 0 || view.openSeerr) {
      view.headline = st === MEDIA_STATUS.PARTIAL ? 'Partly showing' : 'Now showing';
    } else if (st === MEDIA_STATUS.PROCESSING || st === MEDIA_STATUS.PENDING || regularRequest) {
      view.headline = 'Coming soon';
    } else if (st === MEDIA_STATUS.BLOCKLISTED) {
      view.headline = 'Not showing';
    } else {
      view.headline = 'Not showing yet';
    }

    // 5. Request form (same conditions as before the redesign).
    if (state.hasSeerr) {
      var servers = getRequestableServers(state);
      var canRequest =
        (allServers.length > 0 && servers.length > 0) ||
        (allServers.length === 0 && ns.utils.canRequestStatus(st));
      if (canRequest) {
        var only4k =
          servers.length > 0 &&
          servers.every(function (s) {
            return s.is4k;
          });
        view.form = {
          collapsed: view.watch.length > 0 || Boolean(view.openSeerr),
          toggleLabel: only4k
            ? 'Request in 4K…'
            : state.mediaType === 'tv'
              ? 'Request more seasons…'
              : 'Make another request…'
        };
      }
    }

    return view;
  }

  /* ------------------------------------------------------------------
     Form controls (shared, skinned by each style)
     ------------------------------------------------------------------ */

  // Native <select>, skinned through the style's class.
  function makeSelect(cls, label, options, onChange) {
    var wrap = el('span', 'lbx-sel ' + cls);
    var select = el('select');
    select.setAttribute('aria-label', label);
    options.forEach(function (o) {
      var opt = el('option', null, o.text);
      opt.value = o.value;
      if (o.selected) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      onChange(select.value);
    });
    wrap.appendChild(select);
    return wrap;
  }

  // Servers keep the name given in Seerr; only 4K ones are marked.
  function serverName(srv) {
    return srv.name + (srv.is4k ? ' (4K)' : '');
  }

  // Returns the form fields: { label, control } or { note }.
  function buildFormFields(state, selectedServer, cls) {
    var fields = [];
    var servers = getRequestableServers(state);
    var advancedAllowed = !state.services || state.services.advancedAllowed !== false;

    if (servers.length > 1) {
      fields.push({
        label: 'Server',
        control: makeSelect(
          cls,
          'Server',
          servers.map(function (srv) {
            return {
              value: String(srv.id),
              text: serverName(srv),
              selected: selectedServer && Number(srv.id) === Number(selectedServer.id)
            };
          }),
          function (value) {
            formSelection.serverId = Number(value);
            formSelection.profileId = null;
            formSelection.rootFolder = '';
            formSelection.tags = [];
            render();
          }
        )
      });
    }

    if (selectedServer && Array.isArray(selectedServer.profiles) && selectedServer.profiles.length > 0) {
      fields.push({
        label: 'Profile',
        control: makeSelect(
          cls,
          'Quality profile',
          selectedServer.profiles.map(function (prof) {
            return {
              value: String(prof.id),
              text: prof.name,
              selected: Number(prof.id) === Number(formSelection.profileId)
            };
          }),
          function (value) {
            formSelection.profileId = Number(value);
          }
        )
      });
    } else if (!advancedAllowed || (selectedServer && selectedServer.detailError)) {
      fields.push({ note: 'Profile chosen by Seerr (advanced permission required to change it here).' });
    }

    return fields;
  }

  function makeChip(prefix, text, checked, onChange) {
    var chip = el('label', prefix + '-chip');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', function () {
      onChange(cb.checked);
    });
    chip.appendChild(cb);
    chip.appendChild(el('span', null, text));
    return chip;
  }

  // Advanced options (root folder, tags, seasons) inside a <details>.
  function buildAdvanced(state, selectedServer, prefix, selectCls) {
    var hasFolders =
      selectedServer && Array.isArray(selectedServer.rootFolders) && selectedServer.rootFolders.length > 0;
    var hasTags = selectedServer && Array.isArray(selectedServer.tags) && selectedServer.tags.length > 0;
    var hasSeasons = state.mediaType === 'tv' && Array.isArray(state.seasons) && state.seasons.length > 0;

    if (!hasFolders && !hasTags && !hasSeasons) {
      return null;
    }

    var details = el('details', prefix + '-adv');
    if (state.preferences && state.preferences.expandAdvancedByDefault) {
      details.open = true;
    }
    details.appendChild(el('summary', prefix + '-adv-summary', 'Advanced options'));
    var body = el('div', prefix + '-adv-body');

    function addField(label, control) {
      var field = el('div', prefix + '-adv-field');
      field.appendChild(el('span', prefix + '-adv-label', label));
      field.appendChild(control);
      body.appendChild(field);
    }

    if (hasFolders) {
      addField(
        'Folder',
        makeSelect(
          selectCls,
          'Root folder',
          selectedServer.rootFolders.map(function (folder) {
            var spaceStr =
              typeof folder.freeSpace === 'number'
                ? ' (' + ns.utils.formatBytes(folder.freeSpace) + ' free)'
                : '';
            return {
              value: folder.path,
              text: folder.path + spaceStr,
              selected: folder.path === formSelection.rootFolder
            };
          }),
          function (value) {
            formSelection.rootFolder = value;
          }
        )
      );
    }

    if (hasTags) {
      var chips = el('div', prefix + '-chips');
      selectedServer.tags.forEach(function (tag) {
        var idNum = Number(tag.id);
        chips.appendChild(
          makeChip(prefix, tag.label, formSelection.tags.indexOf(idNum) !== -1, function (checked) {
            if (checked) {
              if (formSelection.tags.indexOf(idNum) === -1) {
                formSelection.tags.push(idNum);
              }
            } else {
              formSelection.tags = formSelection.tags.filter(function (v) {
                return v !== idNum;
              });
            }
          })
        );
      });
      addField('Tags', chips);
    }

    if (hasSeasons) {
      var seasonChips = el('div', prefix + '-chips');
      seasonChips.appendChild(
        makeChip(prefix, 'All', formSelection.allSeasons, function (checked) {
          formSelection.allSeasons = checked;
          if (checked) {
            formSelection.seasons = state.seasons.map(function (s) {
              return Number(s.seasonNumber);
            });
          }
          render();
        })
      );
      if (!formSelection.allSeasons) {
        state.seasons.forEach(function (s) {
          var num = Number(s.seasonNumber);
          seasonChips.appendChild(
            makeChip(prefix, 'S' + s.seasonNumber, formSelection.seasons.indexOf(num) !== -1, function (checked) {
              if (checked) {
                if (formSelection.seasons.indexOf(num) === -1) {
                  formSelection.seasons.push(num);
                }
              } else {
                formSelection.seasons = formSelection.seasons.filter(function (n) {
                  return n !== num;
                });
              }
            })
          );
        });
      }
      addField('Seasons', seasonChips);
    }

    details.appendChild(body);
    return details;
  }

  function submitLabel(state, selectedServer) {
    if (isSubmitting) {
      return 'Sending…';
    }
    if (selectedServer && selectedServer.is4k) {
      return state.mediaType === 'tv' ? 'Request series in 4K' : 'Request in 4K';
    }
    return state.mediaType === 'tv' ? 'Request series' : 'Request film';
  }

  // Two-step cancel: first click arms the button, second click within 4 s confirms.
  function cancelHandler(reqId) {
    return function () {
      if (confirmCancelId !== reqId) {
        confirmCancelId = reqId;
        if (confirmTimer) {
          clearTimeout(confirmTimer);
        }
        confirmTimer = setTimeout(function () {
          confirmCancelId = null;
          render();
        }, 4000);
        render();
        return;
      }
      confirmCancelId = null;
      if (confirmTimer) {
        clearTimeout(confirmTimer);
      }
      handleCancelRequest(reqId);
    };
  }

  function cancelLabel(req, view) {
    if (confirmCancelId === req.id) {
      return 'Confirm cancel';
    }
    var several =
      view.requests.filter(function (r) {
        return r.cancellable;
      }).length > 1;
    return several && req.is4k ? 'Cancel 4K request' : 'Cancel request';
  }

  function openOptions() {
    ns.api.sendMessage({ type: MSG.OPEN_OPTIONS });
  }

  function refresh() {
    feedback = null;
    loadMediaState(true);
  }

  // Setup from the film page. Only the Seerr address is typed here; signing in happens in an
  // extension window, where scripts of the page cannot read what is typed.
  function setupState(state) {
    if (!state) {
      return null;
    }
    var need = !state.configured
      ? 'address'
      : state.permissionMissing
        ? 'permission'
        : state.signInRequired
          ? 'signin'
          : state.authMissing
            ? 'apikey'
            : null;
    if (!need) {
      setupPending = false;
      forceAddress = false;
      return null;
    }
    if (forceAddress || (need === 'address' && !setupPending)) {
      return { step: 'address', url: setupDraft || state.seerrUrl || '' };
    }
    var text = setupPending
      ? 'Finish signing in in the Jellyboxd window.'
      : need === 'permission'
        ? 'Allow Jellyboxd to reach your Seerr.'
        : need === 'signin'
          ? 'Your Seerr session ended. Sign in again.'
          : 'Add your Seerr API key.';
    return { step: 'continue', text: text, actionLabel: setupPending ? 'Open it again' : 'Sign in', url: state.seerrUrl || setupDraft };
  }

  function startSetup(url) {
    setupError = null;
    ns.api
      .sendMessage({ type: MSG.START_SETUP, payload: { seerrUrl: url } })
      .then(function (res) {
        if (res && res.ok) {
          setupPending = true;
          forceAddress = false;
        } else {
          setupError = (res && res.error) || 'Enter your Seerr address.';
        }
        render();
      })
      .catch(function (err) {
        setupError = (err && err.message) || 'Could not open the sign-in window.';
        render();
      });
  }

  function changeServer() {
    setupPending = false;
    forceAddress = true;
    setupError = null;
    render();
  }

  function setupInput(className) {
    var input = el('input', className);
    input.type = 'text';
    input.inputMode = 'url';
    input.autocomplete = 'url';
    input.spellcheck = false;
    input.placeholder = 'seerr.example.com';
    input.value = setupDraft;
    input.setAttribute('aria-label', 'Seerr address');
    input.addEventListener('input', function () {
      setupDraft = input.value;
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        startSetup(input.value);
      }
    });
    return input;
  }

  // Messages shown instead of the film (loading, errors).
  function messageState(state) {
    if (isLoading && !state) {
      return { kind: 'loading', text: 'Checking on Seerr / Jellyfin…' };
    }
    if (!state) {
      return {
        kind: 'error',
        text: (feedback && feedback.text) || 'Could not fetch the information.',
        action: { label: 'Retry', onClick: refresh }
      };
    }
    if (state.seerrError && !(state.jellyfin && state.jellyfin.url) && !state.mediaInfo) {
      return { kind: 'error', text: state.seerrError, action: { label: 'Retry', onClick: refresh } };
    }
    return null;
  }

  function feedbackItems(state) {
    var items = [];
    if (state && state.seerrError) {
      items.push({ kind: 'warn', text: state.seerrError });
    }
    if (feedback) {
      items.push({ kind: feedback.type === 'success' ? 'success' : 'error', text: feedback.text });
    }
    return items;
  }

  function externalLink(className, text, url) {
    var a = el('a', className, text);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function textButton(className, text, onClick) {
    var b = el('button', className, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /* ------------------------------------------------------------------
     Native style: extends Letterboxd's actions panel
     ------------------------------------------------------------------ */

  function nRow(cls, text) {
    return el('div', 'lbx-n-row' + (cls ? ' ' + cls : ''), text);
  }

  function nAction(tag, text, iconName, cls) {
    var node = el(tag, 'lbx-n-row lbx-n-action' + (cls ? ' ' + cls : ''));
    if (tag === 'button') {
      node.type = 'button';
    }
    if (iconName) {
      var ic = el('span', 'lbx-n-icon');
      ic.appendChild(icon(iconName));
      node.appendChild(ic);
    }
    node.appendChild(el('span', null, text));
    return node;
  }

  function nStack(tone, title, sub) {
    var row = nRow('lbx-n-stack');
    var line = el('span', 'lbx-n-line');
    line.appendChild(dot(tone));
    line.appendChild(el('span', null, title));
    row.appendChild(line);
    if (sub) {
      row.appendChild(el('span', 'lbx-n-sub', sub));
    }
    return row;
  }

  function renderNativeSetup(panel, setup) {
    if (!setupDraft && setup.url) {
      setupDraft = setup.url;
    }
    if (setup.step === 'address') {
      panel.appendChild(nStack('unknown', 'Connect Jellyboxd', 'Enter your Seerr address to see this film on your server.'));
      var row = el('label', 'lbx-n-row lbx-n-input-row');
      row.appendChild(el('span', 'lbx-n-sub', 'Seerr address'));
      var input = setupInput('lbx-n-input');
      row.appendChild(input);
      panel.appendChild(row);
      var go = nAction('button', 'Continue', 'arrow', null);
      go.addEventListener('click', function () {
        startSetup(input.value);
      });
      panel.appendChild(go);
    } else {
      panel.appendChild(nStack('pending', setup.text, ''));
      var again = nAction('button', setup.actionLabel, 'lock', null);
      again.addEventListener('click', function () {
        startSetup(setup.url);
      });
      panel.appendChild(again);
    }
    if (setupError) {
      panel.appendChild(nRow('lbx-n-msg lbx-n-msg-error', setupError));
    }
    var foot = el('div', 'lbx-n-foot');
    if (setup.step === 'continue') {
      foot.appendChild(textButton('lbx-link', 'Change server', changeServer));
    }
    foot.appendChild(textButton('lbx-link', 'Settings', openOptions));
    panel.appendChild(foot);
  }

  function renderNative(root, state) {
    var panel = el('div', 'lbx-n');
    var setup = setupState(state);
    if (setup) {
      renderNativeSetup(panel, setup);
      root.appendChild(panel);
      return;
    }
    var msg = messageState(state);

    if (msg) {
      panel.appendChild(nRow('lbx-n-msg lbx-n-msg-' + msg.kind, msg.text));
      if (msg.action) {
        var act = nAction('button', msg.action.label, null, null);
        act.addEventListener('click', msg.action.onClick);
        panel.appendChild(act);
      }
      root.appendChild(panel);
      return;
    }

    var view = buildView(state);

    var watchSub = [view.quality, view.addedAt ? 'added ' + formatDate(view.addedAt) : ''].filter(Boolean).join(' · ');
    view.watch.forEach(function (w, idx) {
      var a = nAction('a', w.label, 'play', 'lbx-n-watch');
      a.href = w.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (idx === 0 && watchSub) {
        // Quality and date added, under the main watch link.
        a.classList.add('lbx-n-stack');
        var label = a.lastChild;
        var lineNode = el('span', 'lbx-n-line');
        lineNode.appendChild(a.firstChild);
        lineNode.appendChild(label);
        a.appendChild(lineNode);
        a.appendChild(el('span', 'lbx-n-sub', watchSub));
      }
      panel.appendChild(a);
    });

    if (view.status) {
      if (view.openSeerr) {
        var link = externalLink('lbx-n-row lbx-n-action lbx-n-split', null, view.openSeerr);
        var left = el('span', 'lbx-n-line');
        left.appendChild(dot(view.status.tone));
        left.appendChild(el('span', null, view.status.text));
        var right = el('span', 'lbx-n-line lbx-n-sub', 'Open in Seerr');
        right.appendChild(icon('ext'));
        link.appendChild(left);
        link.appendChild(right);
        panel.appendChild(link);
      } else {
        panel.appendChild(nStack(view.status.tone, view.status.text, view.status.sub));
      }
    }

    view.extra.forEach(function (x) {
      panel.appendChild(nStack(x.tone, x.text, ''));
    });

    view.requests.forEach(function (req) {
      if (!req.merged) {
        panel.appendChild(nStack(req.tone, req.title, req.sub));
      }
    });

    view.requests.forEach(function (req) {
      if (req.cancellable) {
        var armed = confirmCancelId === req.id;
        var btn = nAction(
          'button',
          cancelLabel(req, view),
          null,
          'lbx-n-sub lbx-n-cancel' + (armed ? ' lbx-n-armed' : '')
        );
        btn.disabled = isSubmitting;
        btn.addEventListener('click', cancelHandler(req.id));
        panel.appendChild(btn);
      }
    });

    if (view.form) {
      if (view.form.collapsed && !formOpen) {
        var toggle = nAction('button', view.form.toggleLabel, null, 'lbx-n-sub');
        toggle.addEventListener('click', function () {
          formOpen = true;
          render();
        });
        panel.appendChild(toggle);
      } else {
        var selectedServer = syncFormDefaults(state);
        buildFormFields(state, selectedServer, 'lbx-n-select').forEach(function (f) {
          if (f.note) {
            panel.appendChild(nRow('lbx-n-sub lbx-n-note', f.note));
            return;
          }
          var row = el('label', 'lbx-n-row lbx-n-split lbx-n-field');
          row.appendChild(el('span', 'lbx-n-sub', f.label));
          row.appendChild(f.control);
          panel.appendChild(row);
        });
        var adv = buildAdvanced(state, selectedServer, 'lbx-n', 'lbx-n-select');
        if (adv) {
          panel.appendChild(adv);
        }
        var submit = nAction('button', submitLabel(state, selectedServer), 'plus', 'lbx-n-submit');
        submit.disabled = isSubmitting;
        submit.addEventListener('click', function () {
          handleSubmitRequest(selectedServer);
        });
        panel.appendChild(submit);
      }
    }

    feedbackItems(state).forEach(function (f) {
      panel.appendChild(nRow('lbx-n-msg lbx-n-msg-' + f.kind, f.text));
    });

    var foot = el('div', 'lbx-n-foot');
    if (view.seerrUrl && !view.openSeerr) {
      foot.appendChild(externalLink('lbx-link', 'Open in Seerr', view.seerrUrl));
    }
    var refreshBtn = textButton('lbx-link', isLoading ? 'Refreshing…' : 'Refresh', refresh);
    refreshBtn.disabled = isLoading || isSubmitting;
    foot.appendChild(refreshBtn);
    foot.appendChild(textButton('lbx-link', 'Settings', openOptions));
    panel.appendChild(foot);

    root.appendChild(panel);
  }

  /* ------------------------------------------------------------------
     Ticket style: a cinema ticket whose stub is the main button
     ------------------------------------------------------------------ */

  // Picks the stub action and the secondary links of the ticket.
  function planTicket(state, view, msg) {
    var plan = { stub: null, links: [], showForm: false, selectedServer: null };

    if (msg) {
      plan.stub = msg.action
        ? { kind: 'plain', label: msg.action.label, onClick: msg.action.onClick }
        : { kind: 'plain', label: '…', disabled: true };
      return plan;
    }

    plan.showForm = Boolean(view.form) && (!view.form.collapsed || formOpen);

    if (plan.showForm) {
      var selectedServer = syncFormDefaults(state);
      plan.selectedServer = selectedServer;
      plan.stub = {
        kind: 'ask',
        label: submitLabel(state, selectedServer),
        disabled: isSubmitting,
        onClick: function () {
          handleSubmitRequest(selectedServer);
        }
      };
      view.watch.forEach(function (w) {
        plan.links.push({ label: w.label, url: w.url });
      });
      if (view.form.collapsed) {
        plan.links.push({
          label: 'Close',
          onClick: function () {
            formOpen = false;
            render();
          }
        });
      }
    } else if (view.watch.length > 0) {
      plan.stub = { kind: 'go', label: view.watch[0].label, url: view.watch[0].url, iconBefore: 'play' };
      view.watch.slice(1).forEach(function (w) {
        plan.links.push({ label: w.label, url: w.url });
      });
    } else if (view.openSeerr) {
      plan.stub = { kind: 'go', label: 'Open in Seerr', url: view.openSeerr, iconAfter: 'ext' };
    }

    var cancellable = view.requests.filter(function (r) {
      return r.cancellable;
    });
    if (!plan.stub && cancellable.length > 0) {
      var first = cancellable.shift();
      plan.stub = {
        kind: 'plain',
        label: cancelLabel(first, view),
        armed: confirmCancelId === first.id,
        disabled: isSubmitting,
        onClick: cancelHandler(first.id)
      };
    }
    cancellable.forEach(function (r) {
      plan.links.push({ label: cancelLabel(r, view), onClick: cancelHandler(r.id), danger: true });
    });

    if (view.form && view.form.collapsed && !formOpen) {
      plan.links.unshift({
        label: view.form.toggleLabel.replace('…', ''),
        onClick: function () {
          formOpen = true;
          render();
        }
      });
    }

    if (!plan.stub) {
      plan.stub = view.seerrUrl
        ? { kind: 'plain', label: 'View in Seerr', url: view.seerrUrl, iconAfter: 'ext' }
        : { kind: 'plain', label: 'Refresh', onClick: refresh };
    }

    return plan;
  }

  function ticketStub(stub) {
    var node;
    if (stub.url) {
      node = externalLink('lbx-t-stub', null, stub.url);
    } else {
      node = el('button', 'lbx-t-stub');
      node.type = 'button';
      node.disabled = Boolean(stub.disabled);
      if (stub.onClick) {
        node.addEventListener('click', stub.onClick);
      }
    }
    if (stub.armed) {
      node.classList.add('lbx-t-armed');
    }
    if (stub.iconBefore) {
      node.appendChild(icon(stub.iconBefore));
    }
    node.appendChild(el('span', null, stub.label));
    if (stub.iconAfter) {
      node.appendChild(icon(stub.iconAfter));
    }
    return node;
  }

  function ticketShell(kind, serverLabel, headline) {
    var ticket = el('div', 'lbx-t lbx-t-' + kind);
    var top = el('div', 'lbx-t-top');
    var line = el('div', 'lbx-t-line');
    line.appendChild(el('span', null, serverLabel));
    line.appendChild(el('span', null, 'Jellyboxd'));
    top.appendChild(line);
    top.appendChild(el('div', 'lbx-t-head', headline));
    ticket.appendChild(top);
    return { ticket: ticket, top: top };
  }

  function ticketClose(root, shell, stubNode, fineItems) {
    var perf = el('div', 'lbx-t-perf');
    perf.setAttribute('aria-hidden', 'true');
    shell.ticket.appendChild(perf);
    shell.ticket.appendChild(stubNode);
    root.appendChild(shell.ticket);
    var fine = el('div', 'lbx-t-fine');
    fineItems.forEach(function (n) {
      fine.appendChild(n);
    });
    root.appendChild(fine);
  }

  function renderTicketSetup(root, setup) {
    if (!setupDraft && setup.url) {
      setupDraft = setup.url;
    }
    var shell = ticketShell('ask', 'Seerr', setup.step === 'address' ? 'Box office closed' : 'Almost open');
    var input = null;
    if (setup.step === 'address') {
      var field = el('label', 'lbx-t-field');
      field.appendChild(el('span', null, 'Address'));
      input = setupInput('lbx-t-input');
      field.appendChild(input);
      shell.top.appendChild(field);
      shell.top.appendChild(el('div', 'lbx-t-note', 'Enter your Seerr address to see this film on your server.'));
    } else {
      shell.top.appendChild(el('div', 'lbx-t-note', setup.text));
    }
    if (setupError) {
      shell.top.appendChild(el('div', 'lbx-t-note lbx-t-msg-error', setupError));
    }
    var stub = setup.step === 'address'
      ? { label: 'Continue', onClick: function () { startSetup(input.value); } }
      : { label: setup.actionLabel, iconBefore: 'lock', onClick: function () { startSetup(setup.url); } };
    var fine = [];
    if (setup.step === 'continue') {
      fine.push(textButton('lbx-link', 'Change server', changeServer));
    }
    fine.push(textButton('lbx-link', 'Settings', openOptions));
    ticketClose(root, shell, ticketStub(stub), fine);
  }

  function renderTicket(root, state) {
    var setup = setupState(state);
    if (setup) {
      renderTicketSetup(root, setup);
      return;
    }
    var msg = messageState(state);
    var view = msg ? null : buildView(state);
    var plan = planTicket(state, view, msg);
    var stub = plan.stub;
    var shell = ticketShell(
      stub.kind,
      view ? view.serverLabel : 'Jellyboxd',
      msg ? (msg.kind === 'loading' ? 'Checking…' : 'Projector trouble') : view.headline
    );
    var top = shell.top;

    // Printed fields: only what Letterboxd does not already show.
    var fields = [];
    var request = null;
    if (view) {
      request = view.requests.filter(function (r) {
        return !r.is4k;
      })[0] || null;
      if (view.watch.length > 0 || view.openSeerr) {
        if (view.quality) {
          fields.push(['Quality', view.quality]);
        }
        if (view.addedAt) {
          fields.push(['Added', formatDate(view.addedAt)]);
        }
      } else if (request) {
        if (request.profileName) {
          fields.push(['Profile', request.profileName]);
        }
        if (request.createdAt) {
          fields.push(['Requested', relativeTime(request.createdAt)]);
        }
      }
    }
    if (fields.length) {
      var grid = el('div', 'lbx-t-fields');
      fields.forEach(function (f) {
        var cell = el('div', 'lbx-t-cell');
        cell.appendChild(el('small', null, f[0]));
        cell.appendChild(el('b', null, f[1]));
        grid.appendChild(cell);
      });
      top.appendChild(grid);
    }

    if (msg) {
      top.appendChild(el('div', 'lbx-t-note lbx-t-msg-' + msg.kind, msg.text));
    } else {
      if (request && !view.watch.length && !view.openSeerr) {
        var by = request.requestedBy ? 'Requested by ' + request.requestedBy : 'Requested';
        var st = state.mediaInfo && state.mediaInfo.status;
        top.appendChild(
          el('div', 'lbx-t-note', st === MEDIA_STATUS.PROCESSING ? by + ', downloading now.' : by + ' · ' + request.statusLabel.toLowerCase() + '.')
        );
      }
      view.extra.forEach(function (x) {
        top.appendChild(el('div', 'lbx-t-note', x.text));
      });
      view.requests.forEach(function (r) {
        if (r !== request) {
          top.appendChild(el('div', 'lbx-t-note', r.title + (r.sub ? ' · ' + r.sub : '')));
        }
      });

      if (plan.showForm) {
        var form = el('div', 'lbx-t-form');
        buildFormFields(state, plan.selectedServer, 'lbx-t-select').forEach(function (f) {
          if (f.note) {
            form.appendChild(el('div', 'lbx-t-note', f.note));
            return;
          }
          var row = el('label', 'lbx-t-field');
          row.appendChild(el('span', null, f.label));
          row.appendChild(f.control);
          form.appendChild(row);
        });
        var adv = buildAdvanced(state, plan.selectedServer, 'lbx-t', 'lbx-t-select');
        if (adv) {
          form.appendChild(adv);
        }
        top.appendChild(form);
      }

      feedbackItems(state).forEach(function (f) {
        top.appendChild(el('div', 'lbx-t-note lbx-t-msg-' + f.kind, f.text));
      });
    }

    if (plan.links.length) {
      var linkRow = el('div', 'lbx-t-links');
      plan.links.forEach(function (l) {
        var node = l.url
          ? externalLink('lbx-link lbx-t-link', l.label, l.url)
          : textButton('lbx-link lbx-t-link' + (l.danger ? ' lbx-t-danger' : ''), l.label, l.onClick);
        linkRow.appendChild(node);
      });
      top.appendChild(linkRow);
    }

    var fine = [];
    if (view && view.seerrUrl && stub.url !== view.seerrUrl) {
      fine.push(externalLink('lbx-link', 'Open in Seerr', view.seerrUrl));
    }
    if (!msg) {
      var refreshBtn = textButton('lbx-link', isLoading ? 'Refreshing…' : 'Refresh', refresh);
      refreshBtn.disabled = isLoading || isSubmitting;
      fine.push(refreshBtn);
    }
    fine.push(textButton('lbx-link', 'Settings', openOptions));
    ticketClose(root, shell, ticketStub(stub), fine);
  }

  function render() {
    var root = ensureRootMounted();
    if (!root) {
      return;
    }
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
    if (widgetStyle === 'ticket') {
      renderTicket(root, currentState);
    } else {
      renderNative(root, currentState);
    }
  }

  async function loadWidgetStyle() {
    try {
      var res = await ns.api.sendMessage({ type: MSG.GET_CONFIG });
      var s = res && res.settings && res.settings.widgetStyle;
      widgetStyle = s === 'native' ? 'native' : 'ticket';
    } catch (_err) {
      // Keep the default style if the settings cannot be read.
    }
  }

  async function loadMediaState(forceRefresh) {
    if (!currentFilm) {
      return;
    }
    isLoading = true;
    render();

    try {
      var res = await ns.api.sendMessage({
        type: MSG.GET_MEDIA_STATE,
        payload: {
          tmdbId: currentFilm.tmdbId,
          mediaType: currentFilm.mediaType,
          title: currentFilm.title,
          originalTitle: currentFilm.originalTitle,
          year: currentFilm.year,
          forceRefresh: Boolean(forceRefresh)
        }
      });

      if (res && res.ok) {
        currentState = res;
        if (res.preferences && res.preferences.widgetStyle) {
          widgetStyle = res.preferences.widgetStyle === 'native' ? 'native' : 'ticket';
        }
      } else {
        feedback = {
          type: 'error',
          text: (res && res.error) || 'Could not fetch the information.'
        };
      }
    } catch (err) {
      feedback = {
        type: 'error',
        text: (err && err.message) || 'Communication error with the extension.'
      };
    } finally {
      isLoading = false;
      render();
    }
  }

  async function handleSubmitRequest(selectedServer) {
    if (!currentFilm || !currentState || isSubmitting) {
      return;
    }

    if (currentState.mediaType === 'tv' && !formSelection.allSeasons && formSelection.seasons.length === 0) {
      feedback = { type: 'error', text: 'Select at least one season to request.' };
      render();
      return;
    }

    isSubmitting = true;
    feedback = null;
    render();

    var payload = {
      tmdbId: currentFilm.tmdbId,
      mediaType: currentState.mediaType,
      title: currentFilm.title,
      originalTitle: currentFilm.originalTitle,
      year: currentFilm.year,
      is4k: selectedServer ? Boolean(selectedServer.is4k) : false
    };

    if (selectedServer) {
      payload.serverId = Number(selectedServer.id);
      if (formSelection.profileId !== null && formSelection.profileId !== undefined) {
        payload.profileId = Number(formSelection.profileId);
      }
      if (formSelection.rootFolder) {
        payload.rootFolder = formSelection.rootFolder;
      }
      if (formSelection.tags.length > 0) {
        payload.tags = formSelection.tags.slice();
      }
    }

    if (currentState.mediaType === 'tv') {
      payload.seasons = formSelection.allSeasons ? 'all' : formSelection.seasons.slice();
    }

    try {
      var res = await ns.api.sendMessage({
        type: MSG.SUBMIT_REQUEST,
        payload: payload
      });

      if (res && res.ok) {
        if (res.state) {
          currentState = res.state;
        }
        formOpen = false;
        feedback = { type: 'success', text: 'Request sent to Seerr.' };
      } else {
        feedback = {
          type: 'error',
          text: (res && res.error) || 'Failed to send the request.'
        };
      }
    } catch (err) {
      feedback = {
        type: 'error',
        text: (err && err.message) || 'Error while sending the request.'
      };
    } finally {
      isSubmitting = false;
      render();
    }
  }

  async function handleCancelRequest(requestId) {
    if (!currentFilm || isSubmitting) {
      return;
    }
    isSubmitting = true;
    feedback = null;
    render();

    try {
      var res = await ns.api.sendMessage({
        type: MSG.CANCEL_REQUEST,
        payload: {
          requestId: requestId,
          tmdbId: currentFilm.tmdbId,
          mediaType: currentState ? currentState.mediaType : currentFilm.mediaType,
          title: currentFilm.title,
          originalTitle: currentFilm.originalTitle,
          year: currentFilm.year
        }
      });

      if (res && res.ok) {
        if (res.state) {
          currentState = res.state;
        }
        feedback = { type: 'success', text: 'Request cancelled.' };
      } else {
        feedback = {
          type: 'error',
          text: (res && res.error) || 'Could not cancel this request.'
        };
      }
    } catch (err) {
      feedback = {
        type: 'error',
        text: (err && err.message) || 'Error while cancelling.'
      };
    } finally {
      isSubmitting = false;
      render();
    }
  }

  // Settings changed (style, server, a finished sign-in): redraw and reload the film's state.
  // The new values come through the background page, which strips secrets.
  function watchSettings() {
    var ext = global.browser || global.chrome;
    var key = ns.STORAGE_KEYS && ns.STORAGE_KEYS.settings;
    if (!ext || !ext.storage || !ext.storage.onChanged || !key) {
      return;
    }
    var timer = null;
    ext.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[key]) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(function () {
        loadWidgetStyle().then(function () {
          render();
          loadMediaState(true);
        });
      }, 300);
    });
  }

  // Summary for the toolbar popup: what this tab's film looks like on the user's servers.
  function tabSummary() {
    var film = currentFilm || {};
    var base = {
      ok: true,
      film: {
        title: film.title || '',
        year: film.year || '',
        poster: film.poster || '',
        directors: film.directors || []
      }
    };
    if (!currentState || setupState(currentState) || messageState(currentState)) {
      return Object.assign(base, { ready: false });
    }
    var view = buildView(currentState);
    var detail = [];
    if (view.watch.length || view.openSeerr) {
      if (view.quality) {
        detail.push(view.quality);
      }
      if (view.addedAt) {
        detail.push('added ' + formatDate(view.addedAt));
      }
    } else if (view.status) {
      detail.push(view.status.text);
    }
    var primary = view.watch[0]
      ? { label: view.watch[0].label, url: view.watch[0].url, kind: 'go' }
      : view.openSeerr
        ? { label: 'Open in Seerr', url: view.openSeerr, kind: 'go' }
        : null;
    return Object.assign(base, {
      ready: true,
      available: Boolean(view.watch.length),
      headline: view.headline,
      server: view.serverLabel,
      detail: detail.join(' · '),
      primary: primary,
      seerrUrl: view.seerrUrl,
      canRequest: Boolean(view.form)
    });
  }

  function answerPopup() {
    var ext = global.browser || global.chrome;
    if (!ext || !ext.runtime || !ext.runtime.onMessage) {
      return;
    }
    ext.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (message && message.type === MSG.TAB_SUMMARY) {
        sendResponse(tabSummary());
      } else if (message && message.type === MSG.TAB_REQUEST) {
        // The popup's Request button: same request as the widget's, with its current choices.
        if (!currentState || isSubmitting || !buildView(currentState).form) {
          sendResponse({ ok: false, error: 'This film cannot be requested from here.' });
          return false;
        }
        handleSubmitRequest(syncFormDefaults(currentState)).then(function () {
          var failed = feedback && feedback.type === 'error';
          sendResponse(Object.assign(tabSummary(), failed ? { ok: false, error: feedback.text } : {}));
        });
        return true;
      }
      return false;
    });
  }

  async function init() {
    currentFilm = await resolveFilm();
    if (!currentFilm) {
      return;
    }

    await loadWidgetStyle();
    watchSettings();
    answerPopup();

    if (!findMountTarget()) {
      var observer = new MutationObserver(function () {
        if (findMountTarget()) {
          observer.disconnect();
          render();
          loadMediaState(false);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
      }, 10000);
      return;
    }

    var recheckTimer = null;
    var sidebarObserver = new MutationObserver(function (mutations) {
      var selfMutation = mutations.every(function (m) {
        var root = document.getElementById(ROOT_ID);
        return root && root.contains(m.target);
      });
      if (selfMutation) {
        return;
      }
      if (!document.getElementById(ROOT_ID) && findMountTarget()) {
        clearTimeout(recheckTimer);
        recheckTimer = setTimeout(render, 50);
      }
    });
    sidebarObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      sidebarObserver.disconnect();
    }, 12000);

    render();
    loadMediaState(false);
  }

  init();
})(globalThis);
