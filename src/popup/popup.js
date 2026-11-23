(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;
  var ext = ns.api.raw;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var el = {
    film: $('film'),
    poster: $('poster'),
    filmTitle: $('filmTitle'),
    filmMeta: $('filmMeta'),
    filmState: $('filmState'),
    filmDetail: $('filmDetail'),
    message: $('message'),
    messageTitle: $('messageTitle'),
    messageText: $('messageText'),
    actions: $('actions'),
    primary: $('primary'),
    feedback: $('feedback'),
    accounts: $('accounts'),
    seerrAccount: $('seerrAccount'),
    jellyfinRow: $('jellyfinRow'),
    jellyfinAccount: $('jellyfinAccount')
  };
  var onPrimary = null;
  // The widget's ticket headlines, said plainly for the popup.
  var STATE_TEXT = {
    'Not showing yet': 'Not on your server',
    'Not showing': 'Not on your server',
    'Coming soon': 'Requested',
    'Partly showing': 'Partly on your server'
  };

  function icon(id) {
    return $(id).content.firstElementChild.cloneNode(true);
  }

  function host(url) {
    try {
      return new URL(url).host;
    } catch (_err) {
      return '';
    }
  }

  function showAction(kind, label, handler, withIcon) {
    el.actions.hidden = !label;
    el.feedback.hidden = true;
    el.primary.disabled = false;
    onPrimary = label ? handler : null;
    if (!label) {
      return;
    }
    el.primary.className =
      'btn btn-wide stub ' + (kind === 'watch' ? 'btn-watch' : kind === 'ask' ? 'btn-ask' : 'btn-plain');
    el.primary.textContent = '';
    if (withIcon) {
      el.primary.appendChild(icon('iconPlay'));
    }
    var span = document.createElement('span');
    span.textContent = label;
    el.primary.appendChild(span);
  }

  function showMessage(title, text) {
    el.film.hidden = true;
    el.message.hidden = false;
    el.messageTitle.textContent = title;
    el.messageText.textContent = text || '';
    el.messageText.hidden = !text;
  }

  function showFilm(film, summary) {
    el.message.hidden = true;
    el.film.hidden = false;
    el.filmTitle.textContent = film.title || 'This film';
    el.filmMeta.textContent = [film.year, (film.directors || []).join(', ')].filter(Boolean).join(' · ');
    el.poster.hidden = !film.poster;
    el.film.classList.toggle('no-poster', !film.poster);
    if (film.poster) {
      el.poster.src = film.poster;
      el.poster.alt = (film.title || 'Film') + ' poster';
    }
    el.filmState.textContent = '';
    if (!summary) {
      el.filmState.className = 'status';
      el.filmState.textContent = 'Checking your servers…';
      el.filmDetail.textContent = '';
      return;
    }
    el.filmState.className = 'status' + (summary.available ? ' is-ok' : '');
    if (summary.available) {
      el.filmState.appendChild(icon('iconCheck'));
    }
    var span = document.createElement('span');
    var where = summary.server && summary.server !== 'Seerr' ? summary.server : 'server';
    span.textContent = summary.available ? 'On your ' + where : STATE_TEXT[summary.headline] || summary.headline || '';
    el.filmState.appendChild(span);
    el.filmDetail.textContent = summary.detail === 'Not available' ? '' : summary.detail || '';
  }

  function close() {
    global.close();
  }

  function openUrl(url) {
    ns.api.createTab(url).then(close);
  }

  function openSetup(seerrUrl) {
    var path = 'src/setup/setup.html' + (seerrUrl ? '?seerr=' + encodeURIComponent(seerrUrl) : '');
    ns.api.openWindow(ns.api.getUrl(path), 400, 600).then(close);
  }

  function activeTab() {
    return ns.api.call(ext.tabs, 'query', [{ active: true, currentWindow: true }]).then(function (tabs) {
      return tabs && tabs[0];
    });
  }

  function askTab(tab, type) {
    return ns.api.call(ext.tabs, 'sendMessage', [tab.id, { type: type }]).catch(function () {
      return null;
    });
  }

  function showAccounts(session, settings) {
    el.accounts.hidden = false;
    el.seerrAccount.textContent = session.signedIn
      ? (session.user && session.user.displayName) || 'Signed in'
      : 'Not signed in';
    var jf = settings && settings.jellyfinUrl;
    el.jellyfinRow.hidden = !jf;
    el.jellyfinAccount.textContent = jf ? host(jf) : '';
  }

  function showSummary(tab, summary) {
    showFilm(summary.film, summary);
    if (summary.available && summary.primary && summary.primary.url) {
      showAction('watch', summary.primary.label, function () {
        openUrl(summary.primary.url);
      }, true);
    } else if (summary.canRequest) {
      showAction('ask', 'Request ' + (summary.film.title || 'this film'), function () {
        requestFromTab(tab);
      });
    } else if (summary.seerrUrl) {
      showAction('plain', 'Open in Seerr', function () {
        openUrl(summary.seerrUrl);
      });
    } else {
      showAction('', '');
    }
  }

  async function requestFromTab(tab) {
    el.primary.disabled = true;
    el.feedback.hidden = true;
    var res = await askTab(tab, MSG.TAB_REQUEST);
    if (res && res.ok !== false && res.ready) {
      showSummary(tab, res);
      el.feedback.hidden = false;
      el.feedback.className = 'status is-ok';
      el.feedback.textContent = 'Request sent to Seerr.';
      return;
    }
    el.primary.disabled = false;
    el.feedback.hidden = false;
    el.feedback.className = 'status is-err';
    el.feedback.textContent = (res && res.error) || 'The request did not go through. Try from the film page.';
  }

  el.primary.addEventListener('click', function () {
    if (onPrimary) {
      onPrimary();
    }
  });

  $('openSettings').addEventListener('click', function () {
    ns.api.openOptionsPage().then(close);
  });

  async function start() {
    var results = await Promise.all([
      ns.api.sendMessage({ type: MSG.CHECK_SESSION, payload: {} }),
      ns.api.sendMessage({ type: MSG.GET_CONFIG }).catch(function () {
        return null;
      })
    ]);
    var session = results[0] || {};
    var settings = results[1] && results[1].settings;

    if (!session.configured) {
      showMessage('Connect your Seerr', 'Jellyboxd shows on Letterboxd film pages once your Seerr is connected.');
      showAction('ask', 'Connect Seerr', function () {
        openSetup('');
      });
      return;
    }

    showAccounts(session, settings);

    if (!session.signedIn) {
      showMessage(
        'Sign in to Seerr',
        session.permissionMissing
          ? 'Jellyboxd needs your permission to reach ' + session.host + '.'
          : 'Your session on ' + session.host + ' is missing or ended.'
      );
      showAction('ask', 'Sign in', function () {
        openSetup(settings && settings.seerrUrl);
      });
      return;
    }

    var tab = await activeTab();
    var onFilm = Boolean(tab && tab.url && /^https:\/\/letterboxd\.com\/(?:film\/|[^/]+\/film\/)/.test(tab.url));
    var summary = onFilm ? await askTab(tab, MSG.TAB_SUMMARY) : null;

    if (summary && summary.ready) {
      showSummary(tab, summary);
      return;
    }
    if (summary && summary.film && summary.film.title) {
      showFilm(summary.film, null);
      showAction('', '');
      return;
    }

    showMessage(
      onFilm ? 'Loading this film…' : 'Open a film on Letterboxd',
      onFilm ? 'Reopen this popup in a moment.' : 'Jellyboxd shows on every film page and review, under the actions panel.'
    );
    showAction(onFilm ? '' : 'plain', onFilm ? '' : 'Go to Letterboxd', function () {
      openUrl('https://letterboxd.com/');
    });
  }

  start().catch(function (err) {
    showMessage('Something went wrong', (err && err.message) || '');
    showAction('', '');
  });
})(globalThis);
