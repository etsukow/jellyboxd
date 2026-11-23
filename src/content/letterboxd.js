(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  if (!ns || !ns.api || !ns.utils || !ns.ui) {
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

  var formSelection = {
    serverId: null,
    profileId: null,
    rootFolder: '',
    tags: [],
    allSeasons: true,
    seasons: []
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

  function brandSvg() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'lbx-seerr-brand-icon');
    svg.setAttribute('aria-hidden', 'true');

    var dots = [
      { cx: '5.5', cy: '6', r: '2.3', fill: '#ff8000' },
      { cx: '12', cy: '6', r: '2.3', fill: '#00e054' },
      { cx: '18.5', cy: '6', r: '2.3', fill: '#40bcf4' }
    ];
    dots.forEach(function (d) {
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', d.cx);
      c.setAttribute('cy', d.cy);
      c.setAttribute('r', d.r);
      c.setAttribute('fill', d.fill);
      svg.appendChild(c);
    });

    var pill = document.createElementNS(SVG_NS, 'rect');
    pill.setAttribute('x', '3.5');
    pill.setAttribute('y', '11');
    pill.setAttribute('width', '17');
    pill.setAttribute('height', '10');
    pill.setAttribute('rx', '3');
    pill.setAttribute('fill', '#6366f1');
    svg.appendChild(pill);

    var play = document.createElementNS(SVG_NS, 'polygon');
    play.setAttribute('points', '10.3,13.6 15.2,16 10.3,18.4');
    play.setAttribute('fill', '#ffffff');
    svg.appendChild(play);

    return svg;
  }

  function extractFilmMeta() {
    var tmdbId = document.body ? document.body.getAttribute('data-tmdb-id') : '';
    var tmdbType = document.body ? document.body.getAttribute('data-tmdb-type') : '';

    if (!tmdbId || !/^\d+$/.test(tmdbId.trim())) {
      var tmdbLink = document.querySelector(
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

    var titleNode = document.querySelector('h1.headline-1, .film-title-wrapper h1, h1');
    var title = titleNode ? titleNode.textContent.trim() : '';
    if (!title) {
      var ogTitle = document.querySelector('meta[property="og:title"]');
      title = ogTitle ? ogTitle.getAttribute('content') || '' : document.title;
    }

    var origNode = document.querySelector('.originalname, h2.originalname');
    var originalTitle = origNode ? origNode.textContent.trim() : '';

    var yearNode = document.querySelector('.releaseyear a, .film-header-group .number a');
    var year = yearNode ? yearNode.textContent.trim() : '';

    return {
      tmdbId: tmdbId.trim(),
      mediaType: tmdbType && tmdbType.toLowerCase() === 'tv' ? 'tv' : 'movie',
      title: title,
      originalTitle: originalTitle,
      year: year
    };
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
    var target = findMountTarget();
    if (!target) {
      return existing;
    }

    if (existing && document.body.contains(existing)) {
      ns.ui.attachMagicCard(existing);
      return existing;
    }

    var root = existing || el('section');
    root.id = ROOT_ID;
    root.className = 'lbx-magic-card lbx-seerr-card';
    ns.ui.attachMagicCard(root);

    if (target.mode === 'after') {
      target.node.insertAdjacentElement('afterend', root);
    } else if (target.mode === 'before') {
      target.node.insertAdjacentElement('beforebegin', root);
    } else {
      target.node.insertBefore(root, target.node.firstChild);
    }

    return root;
  }

  function resolveBeamTone(state) {
    if (!state || !state.configured) {
      return 'default';
    }
    if (state.permissionMissing || state.authMissing) {
      return 'pending';
    }
    if (state.seerrError && !state.jellyfin?.url && !state.mediaInfo) {
      return 'blocked';
    }
    var info = state.mediaInfo || {};
    var s1 = info.status || MEDIA_STATUS.UNKNOWN;
    var s2 = info.status4k || MEDIA_STATUS.UNKNOWN;
    if (s1 === MEDIA_STATUS.AVAILABLE || s2 === MEDIA_STATUS.AVAILABLE || (state.jellyfin && state.jellyfin.url)) {
      return 'available';
    }
    if (s1 === MEDIA_STATUS.PROCESSING || s2 === MEDIA_STATUS.PROCESSING) {
      return 'processing';
    }
    if (s1 === MEDIA_STATUS.PENDING || s2 === MEDIA_STATUS.PENDING || s1 === MEDIA_STATUS.PARTIAL || s2 === MEDIA_STATUS.PARTIAL) {
      return 'pending';
    }
    if (s1 === MEDIA_STATUS.BLOCKLISTED || s2 === MEDIA_STATUS.BLOCKLISTED) {
      return 'blocked';
    }
    return 'default';
  }

  function buildHeader(state) {
    var header = el('div', 'lbx-seerr-header lbx-card-layer');
    var brand = el('div', 'lbx-seerr-brand');
    brand.appendChild(brandSvg());
    brand.appendChild(el('span', null, 'Seerr / Jellyfin'));
    if (state && state.mediaType) {
      brand.appendChild(
        el('span', 'lbx-seerr-type-tag', state.mediaType === 'tv' ? 'Série' : 'Film')
      );
    }
    header.appendChild(brand);

    var actions = el('div', 'lbx-seerr-header-actions');

    if (state && ns.utils.isSafeHttpUrl(state.seerrMediaUrl)) {
      var openLink = el('a', 'lbx-btn-icon-tactile');
      openLink.href = state.seerrMediaUrl;
      openLink.target = '_blank';
      openLink.rel = 'noopener noreferrer';
      openLink.title = 'Ouvrir la fiche sur Seerr';
      openLink.setAttribute('aria-label', 'Ouvrir la fiche sur Seerr');
      openLink.appendChild(
        svgIcon([
          { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
          { tag: 'polyline', points: '15 3 21 3 21 9' },
          { tag: 'line', x1: '10', y1: '14', x2: '21', y2: '3' }
        ])
      );
      actions.appendChild(openLink);
    }

    var refreshBtn = el('button', 'lbx-btn-icon-tactile');
    refreshBtn.type = 'button';
    refreshBtn.title = 'Actualiser le statut et les profils';
    refreshBtn.setAttribute('aria-label', 'Actualiser');
    refreshBtn.disabled = isLoading || isSubmitting;
    refreshBtn.appendChild(
      svgIcon([
        { tag: 'polyline', points: '23 4 23 10 17 10' },
        { tag: 'polyline', points: '1 20 1 14 7 14' },
        { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }
      ])
    );
    refreshBtn.addEventListener('click', function () {
      feedback = null;
      loadMediaState(true);
    });
    actions.appendChild(refreshBtn);

    var settingsBtn = el('button', 'lbx-btn-icon-tactile');
    settingsBtn.type = 'button';
    settingsBtn.title = 'Paramètres de l’extension';
    settingsBtn.setAttribute('aria-label', 'Paramètres de l’extension');
    settingsBtn.appendChild(
      svgIcon([
        { tag: 'circle', cx: '12', cy: '12', r: '3' },
        {
          d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'
        }
      ])
    );
    settingsBtn.addEventListener('click', function () {
      ns.api.sendMessage({ type: MSG.OPEN_OPTIONS });
    });
    actions.appendChild(settingsBtn);

    header.appendChild(actions);
    return header;
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

  function renderRequestsSection(body, state) {
    var requests = (state.mediaInfo && state.mediaInfo.requests) || [];
    if (requests.length === 0) {
      return;
    }

    var container = el('div', 'lbx-seerr-requests');
    requests.forEach(function (req) {
      var item = el('div', 'lbx-seerr-request-item');
      var meta = el('div', 'lbx-seerr-request-meta');

      var reqStatusMeta = ns.utils.getRequestStatusMeta(req.status);
      var titleParts = [];
      if (req.is4k) {
        titleParts.push('[4K]');
      }
      titleParts.push(reqStatusMeta.label);
      if (req.profileName) {
        titleParts.push('· ' + req.profileName);
      }
      meta.appendChild(el('div', 'lbx-seerr-request-title', titleParts.join(' ')));
      meta.appendChild(el('div', 'lbx-seerr-request-sub', 'Par ' + req.requestedByName));
      item.appendChild(meta);

      var cancellable =
        req.status === REQUEST_STATUS.PENDING_APPROVAL || req.status === REQUEST_STATUS.APPROVED;
      if (cancellable && req.id) {
        var isConfirming = confirmCancelId === req.id;
        var cancelBtn = el(
          'button',
          'lbx-btn-tactile lbx-btn-danger lbx-seerr-cancel-sm' +
            (isConfirming ? ' lbx-btn-danger-armed' : ''),
          isConfirming ? 'Confirmer ?' : 'Annuler'
        );
        cancelBtn.type = 'button';
        cancelBtn.disabled = isSubmitting;
        cancelBtn.addEventListener('click', function () {
          if (confirmCancelId !== req.id) {
            confirmCancelId = req.id;
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
          handleCancelRequest(req.id);
        });
        item.appendChild(cancelBtn);
      }

      container.appendChild(item);
    });

    body.appendChild(container);
  }

  function renderServerControl(form, servers, selectedServer) {
    if (servers.length <= 1 && !(servers.length === 1 && servers[0].is4k)) {
      return;
    }

    var srvField = el('div', 'lbx-seerr-field');
    srvField.appendChild(el('label', 'lbx-seerr-label', 'Serveur'));

    if (servers.length >= 2 && servers.length <= 3) {
      var seg = el('div', 'lbx-segmented');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Choix du serveur');

      servers.forEach(function (srv) {
        var isActive = selectedServer && Number(srv.id) === Number(selectedServer.id);
        var label = (srv.is4k ? '4K' : 'HD') + ' · ' + srv.name;
        var segBtn = el(
          'button',
          'lbx-seg-btn' + (isActive ? ' lbx-seg-active' : ''),
          label
        );
        segBtn.type = 'button';
        segBtn.title = (srv.is4k ? '[4K] ' : '[HD] ') + srv.name;
        segBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        segBtn.addEventListener('click', function () {
          if (Number(formSelection.serverId) === Number(srv.id)) {
            return;
          }
          formSelection.serverId = Number(srv.id);
          formSelection.profileId = null;
          formSelection.rootFolder = '';
          formSelection.tags = [];
          render();
        });
        seg.appendChild(segBtn);
      });
      srvField.appendChild(seg);
    } else {
      var srvSelect = el('select');
      servers.forEach(function (srv) {
        var opt = el('option', null, (srv.is4k ? '[4K] ' : '[HD] ') + srv.name);
        opt.value = String(srv.id);
        if (selectedServer && Number(srv.id) === Number(selectedServer.id)) {
          opt.selected = true;
        }
        srvSelect.appendChild(opt);
      });
      srvSelect.addEventListener('change', function () {
        formSelection.serverId = Number(srvSelect.value);
        formSelection.profileId = null;
        formSelection.rootFolder = '';
        formSelection.tags = [];
        render();
      });
      srvField.appendChild(ns.ui.createSelectWrap(srvSelect));
    }

    form.appendChild(srvField);
  }

  function renderRequestForm(body, state) {
    if (!state.hasSeerr) {
      return;
    }

    var servers = getRequestableServers(state);
    var allServers = (state.services && state.services.servers) || [];
    var info = state.mediaInfo || {};
    var statusHd = info.status || MEDIA_STATUS.UNKNOWN;
    var advancedAllowed = !state.services || state.services.advancedAllowed !== false;

    if (allServers.length > 0 && servers.length === 0) {
      return;
    }
    if (allServers.length === 0 && !ns.utils.canRequestStatus(statusHd)) {
      return;
    }

    var selectedServer = syncFormDefaults(state);
    var form = el('div', 'lbx-seerr-form');

    renderServerControl(form, servers, selectedServer);

    if (selectedServer && Array.isArray(selectedServer.profiles) && selectedServer.profiles.length > 0) {
      var profField = el('div', 'lbx-seerr-field');
      profField.appendChild(el('label', 'lbx-seerr-label', 'Profil de qualité'));
      var profSelect = el('select');
      selectedServer.profiles.forEach(function (prof) {
        var opt = el('option', null, prof.name);
        opt.value = String(prof.id);
        if (Number(prof.id) === Number(formSelection.profileId)) {
          opt.selected = true;
        }
        profSelect.appendChild(opt);
      });
      profSelect.addEventListener('change', function () {
        formSelection.profileId = Number(profSelect.value);
      });
      profField.appendChild(ns.ui.createSelectWrap(profSelect));
      form.appendChild(profField);
    } else if (!advancedAllowed || (selectedServer && selectedServer.detailError)) {
      form.appendChild(
        el(
          'p',
          'lbx-seerr-note',
          'Profil géré par défaut par Seerr (permission avancée requise pour le choisir ici).'
        )
      );
    }

    var hasFolders =
      selectedServer && Array.isArray(selectedServer.rootFolders) && selectedServer.rootFolders.length > 0;
    var hasTags = selectedServer && Array.isArray(selectedServer.tags) && selectedServer.tags.length > 0;
    var hasSeasons = state.mediaType === 'tv' && Array.isArray(state.seasons) && state.seasons.length > 0;

    if (hasFolders || hasTags || hasSeasons) {
      var details = el('details', 'lbx-seerr-advanced');
      if (state.preferences && state.preferences.expandAdvancedByDefault) {
        details.open = true;
      }
      details.appendChild(el('summary', null, 'Options avancées'));
      var advBody = el('div', 'lbx-seerr-advanced-body');

      if (hasFolders) {
        var folderField = el('div', 'lbx-seerr-field');
        folderField.appendChild(el('label', 'lbx-seerr-label', 'Dossier racine'));
        var folderSelect = el('select');
        selectedServer.rootFolders.forEach(function (folder) {
          var spaceStr =
            typeof folder.freeSpace === 'number'
              ? ' (' + ns.utils.formatBytes(folder.freeSpace) + ' libres)'
              : '';
          var opt = el('option', null, folder.path + spaceStr);
          opt.value = folder.path;
          if (folder.path === formSelection.rootFolder) {
            opt.selected = true;
          }
          folderSelect.appendChild(opt);
        });
        folderSelect.addEventListener('change', function () {
          formSelection.rootFolder = folderSelect.value;
        });
        folderField.appendChild(ns.ui.createSelectWrap(folderSelect));
        advBody.appendChild(folderField);
      }

      if (hasTags) {
        var tagsField = el('div', 'lbx-seerr-field');
        tagsField.appendChild(el('label', 'lbx-seerr-label', 'Tags'));
        var chips = el('div', 'lbx-seerr-chips');
        selectedServer.tags.forEach(function (tag) {
          var chip = el('label', 'lbx-seerr-chip');
          var cb = el('input');
          cb.type = 'checkbox';
          cb.value = String(tag.id);
          cb.checked = formSelection.tags.indexOf(Number(tag.id)) !== -1;
          cb.addEventListener('change', function () {
            var idNum = Number(tag.id);
            if (cb.checked) {
              if (formSelection.tags.indexOf(idNum) === -1) {
                formSelection.tags.push(idNum);
              }
            } else {
              formSelection.tags = formSelection.tags.filter(function (v) {
                return v !== idNum;
              });
            }
          });
          chip.appendChild(cb);
          chip.appendChild(el('span', null, tag.label));
          chips.appendChild(chip);
        });
        tagsField.appendChild(chips);
        advBody.appendChild(tagsField);
      }

      if (hasSeasons) {
        var seasonField = el('div', 'lbx-seerr-field');
        seasonField.appendChild(el('label', 'lbx-seerr-label', 'Saisons'));
        var seasonChips = el('div', 'lbx-seerr-chips');

        var allLabel = el('label', 'lbx-seerr-chip');
        var allCb = el('input');
        allCb.type = 'checkbox';
        allCb.checked = formSelection.allSeasons;
        allCb.addEventListener('change', function () {
          formSelection.allSeasons = allCb.checked;
          if (allCb.checked) {
            formSelection.seasons = state.seasons.map(function (s) {
              return Number(s.seasonNumber);
            });
          }
          render();
        });
        allLabel.appendChild(allCb);
        allLabel.appendChild(el('span', null, 'Toutes'));
        seasonChips.appendChild(allLabel);

        if (!formSelection.allSeasons) {
          state.seasons.forEach(function (s) {
            var sLabel = el('label', 'lbx-seerr-chip');
            var sCb = el('input');
            sCb.type = 'checkbox';
            sCb.checked = formSelection.seasons.indexOf(Number(s.seasonNumber)) !== -1;
            sCb.addEventListener('change', function () {
              var num = Number(s.seasonNumber);
              if (sCb.checked) {
                if (formSelection.seasons.indexOf(num) === -1) {
                  formSelection.seasons.push(num);
                }
              } else {
                formSelection.seasons = formSelection.seasons.filter(function (n) {
                  return n !== num;
                });
              }
            });
            sLabel.appendChild(sCb);
            sLabel.appendChild(el('span', null, 'S' + s.seasonNumber));
            seasonChips.appendChild(sLabel);
          });
        }

        seasonField.appendChild(seasonChips);
        advBody.appendChild(seasonField);
      }

      details.appendChild(advBody);
      form.appendChild(details);
    }

    var ctaLabel = 'Demander le film';
    if (selectedServer && selectedServer.is4k) {
      ctaLabel = state.mediaType === 'tv' ? 'Demander la série en 4K' : 'Demander en 4K';
    } else if (state.mediaType === 'tv') {
      ctaLabel = 'Demander la série';
    }

    var submitBtn = ns.ui.createShimmerButton({
      variant: 'indigo',
      label: isSubmitting ? 'Envoi en cours…' : ctaLabel,
      loading: isSubmitting,
      disabled: isSubmitting,
      iconNode: svgIcon([
        { tag: 'line', x1: '12', y1: '5', x2: '12', y2: '19' },
        { tag: 'line', x1: '5', y1: '12', x2: '19', y2: '12' }
      ])
    });
    submitBtn.addEventListener('click', function () {
      handleSubmitRequest(selectedServer);
    });
    form.appendChild(submitBtn);

    body.appendChild(form);
  }

  function render() {
    var root = ensureRootMounted();
    if (!root) {
      return;
    }

    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }

    root.appendChild(ns.ui.createBorderBeam(resolveBeamTone(currentState)));
    root.appendChild(buildHeader(currentState));

    var body = el('div', 'lbx-seerr-body lbx-card-layer');

    if (isLoading && !currentState) {
      body.appendChild(el('div', 'lbx-seerr-skeleton'));
      body.appendChild(el('p', 'lbx-seerr-note', 'Vérification sur Seerr / Jellyfin…'));
      root.appendChild(body);
      return;
    }

    if (!currentState) {
      if (feedback) {
        body.appendChild(el('div', 'lbx-seerr-alert lbx-seerr-alert-error', feedback.text));
      }
      var retryBtn = el('button', 'lbx-btn-tactile lbx-btn-full', 'Réessayer');
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', function () {
        loadMediaState(true);
      });
      body.appendChild(retryBtn);
      root.appendChild(body);
      return;
    }

    if (!currentState.configured) {
      body.appendChild(
        el('p', 'lbx-seerr-note', 'Configurez votre serveur Seerr ou Jellyfin pour demander ce film.')
      );
      var cfgBtn = ns.ui.createShimmerButton({
        variant: 'indigo',
        label: 'Configurer l’extension'
      });
      cfgBtn.addEventListener('click', function () {
        ns.api.sendMessage({ type: MSG.OPEN_OPTIONS });
      });
      body.appendChild(cfgBtn);
      root.appendChild(body);
      return;
    }

    if (currentState.permissionMissing) {
      body.appendChild(
        el(
          'div',
          'lbx-seerr-alert lbx-seerr-alert-warn',
          'Permission réseau requise pour accéder à ' + currentState.seerrUrl + '.'
        )
      );
      var permBtn = ns.ui.createShimmerButton({
        variant: 'indigo',
        label: 'Autoriser dans les paramètres'
      });
      permBtn.addEventListener('click', function () {
        ns.api.sendMessage({ type: MSG.OPEN_OPTIONS });
      });
      body.appendChild(permBtn);
      root.appendChild(body);
      return;
    }

    if (currentState.authMissing) {
      body.appendChild(
        el(
          'div',
          'lbx-seerr-alert lbx-seerr-alert-warn',
          'Clé API Seerr manquante dans la configuration.'
        )
      );
      var keyBtn = ns.ui.createShimmerButton({
        variant: 'indigo',
        label: 'Configurer la clé API'
      });
      keyBtn.addEventListener('click', function () {
        ns.api.sendMessage({ type: MSG.OPEN_OPTIONS });
      });
      body.appendChild(keyBtn);
      root.appendChild(body);
      return;
    }

    if (currentState.seerrError && !currentState.jellyfin?.url && !currentState.mediaInfo) {
      body.appendChild(el('div', 'lbx-seerr-alert lbx-seerr-alert-error', currentState.seerrError));
      var errRetry = el('button', 'lbx-btn-tactile lbx-btn-full', 'Réessayer');
      errRetry.type = 'button';
      errRetry.addEventListener('click', function () {
        loadMediaState(true);
      });
      body.appendChild(errRetry);
      root.appendChild(body);
      return;
    }

    var info = currentState.mediaInfo || {
      status: MEDIA_STATUS.UNKNOWN,
      status4k: MEDIA_STATUS.UNKNOWN,
      requests: []
    };
    var servers = (currentState.services && currentState.services.servers) || [];
    var has4kServer = servers.some(function (s) {
      return Boolean(s.is4k);
    });
    var showDual4k =
      has4kServer ||
      (info.status4k && info.status4k !== MEDIA_STATUS.UNKNOWN) ||
      Boolean(currentState.jellyfin && currentState.jellyfin.url4k);

    var statusGroup = el('div', 'lbx-seerr-status-group');
    if (showDual4k) {
      var rowHd = el('div', 'lbx-seerr-status-row');
      rowHd.appendChild(el('span', 'lbx-seerr-track-label', 'HD'));
      rowHd.appendChild(ns.ui.createStatusPlate(info.status, { fullWidth: false }));
      statusGroup.appendChild(rowHd);

      var row4k = el('div', 'lbx-seerr-status-row');
      row4k.appendChild(el('span', 'lbx-seerr-track-label', '4K'));
      row4k.appendChild(ns.ui.createStatusPlate(info.status4k, { fullWidth: false }));
      statusGroup.appendChild(row4k);
    } else {
      statusGroup.appendChild(ns.ui.createStatusPlate(info.status, { fullWidth: true }));
    }
    body.appendChild(statusGroup);

    if (currentState.jellyfin && ns.utils.isSafeHttpUrl(currentState.jellyfin.url)) {
      var ctaStack = el('div', 'lbx-seerr-cta-stack');
      var has4kLink = ns.utils.isSafeHttpUrl(currentState.jellyfin.url4k);

      var watchBtn = ns.ui.createShimmerButton({
        tag: 'a',
        href: currentState.jellyfin.url,
        variant: 'jellyfin',
        label: has4kLink ? 'Regarder sur Jellyfin (HD)' : 'Regarder sur Jellyfin',
        iconNode: svgIcon([
          { tag: 'polygon', points: '6 4 20 12 6 20 6 4', fill: 'currentColor', stroke: 'none' }
        ])
      });
      ctaStack.appendChild(watchBtn);

      if (has4kLink) {
        var watch4kBtn = ns.ui.createShimmerButton({
          tag: 'a',
          href: currentState.jellyfin.url4k,
          variant: '4k',
          label: 'Regarder en 4K',
          iconNode: svgIcon([
            { tag: 'polygon', points: '6 4 20 12 6 20 6 4', fill: 'currentColor', stroke: 'none' }
          ])
        });
        ctaStack.appendChild(watch4kBtn);
      }
      body.appendChild(ctaStack);
    }

    renderRequestsSection(body, currentState);
    renderRequestForm(body, currentState);

    if (currentState.seerrError) {
      body.appendChild(el('div', 'lbx-seerr-alert lbx-seerr-alert-warn', currentState.seerrError));
    }

    if (feedback) {
      body.appendChild(
        el(
          'div',
          'lbx-seerr-alert ' +
            (feedback.type === 'success' ? 'lbx-seerr-alert-success' : 'lbx-seerr-alert-error'),
          feedback.text
        )
      );
    }

    root.appendChild(body);
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
      } else {
        feedback = {
          type: 'error',
          text: (res && res.error) || 'Impossible de récupérer les informations.'
        };
      }
    } catch (err) {
      feedback = {
        type: 'error',
        text: (err && err.message) || 'Erreur de communication avec l’extension.'
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
      feedback = { type: 'error', text: 'Sélectionnez au moins une saison à demander.' };
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
        feedback = { type: 'success', text: 'Demande envoyée sur Seerr !' };
      } else {
        feedback = {
          type: 'error',
          text: (res && res.error) || 'Échec de l’envoi de la demande.'
        };
      }
    } catch (err) {
      feedback = {
        type: 'error',
        text: (err && err.message) || 'Erreur lors de l’envoi de la demande.'
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
        feedback = { type: 'success', text: 'Demande annulée.' };
      } else {
        feedback = {
          type: 'error',
          text: (res && res.error) || 'Impossible d’annuler cette demande.'
        };
      }
    } catch (err) {
      feedback = {
        type: 'error',
        text: (err && err.message) || 'Erreur lors de l’annulation.'
      };
    } finally {
      isSubmitting = false;
      render();
    }
  }

  function init() {
    currentFilm = extractFilmMeta();
    if (!currentFilm) {
      return;
    }

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
