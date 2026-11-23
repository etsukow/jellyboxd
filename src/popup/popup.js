(function (global) {
  'use strict';

  var ns = global.LbxSeerr;
  var MSG = ns.MSG;
  var ext = ns.api.raw;

  var ticket = document.getElementById('ticket');
  var left = document.getElementById('ticketLeft');
  var right = document.getElementById('ticketRight');
  var title = document.getElementById('ticketTitle');
  var text = document.getElementById('ticketText');
  var action = document.getElementById('ticketAction');
  var connection = document.getElementById('connection');
  var onAction = null;

  function showTicket(opts) {
    ticket.className = 'gt' + (opts.kind ? ' is-' + opts.kind : '');
    left.textContent = opts.left || 'Jellyboxd';
    right.textContent = opts.right || '';
    title.textContent = opts.title || '';
    text.textContent = opts.text || '';
    text.hidden = !opts.text;
    action.hidden = !opts.action;
    action.textContent = opts.action || '';
    onAction = opts.onAction || null;
  }

  function openUrl(url) {
    ns.api.createTab(url).then(function () {
      global.close();
    });
  }

  function openSetup() {
    ns.api.openWindow(ns.api.getUrl('src/setup/setup.html'), 400, 640).then(function () {
      global.close();
    });
  }

  action.addEventListener('click', function () {
    if (onAction) {
      onAction();
    }
  });

  document.getElementById('openSettings').addEventListener('click', function () {
    ns.api.openOptionsPage().then(function () {
      global.close();
    });
  });

  function activeTab() {
    return ns.api.call(ext.tabs, 'query', [{ active: true, currentWindow: true }]).then(function (tabs) {
      return tabs && tabs[0];
    });
  }

  function askTab(tab) {
    return ns.api.call(ext.tabs, 'sendMessage', [tab.id, { type: MSG.TAB_SUMMARY }]).catch(function () {
      return null;
    });
  }

  async function start() {
    var session = await ns.api.sendMessage({ type: MSG.CHECK_SESSION, payload: {} });
    if (!session || !session.configured) {
      connection.hidden = true;
      showTicket({
        kind: 'ask',
        right: 'Box office',
        title: 'Connect your Seerr',
        text: 'Jellyboxd shows on Letterboxd film pages once your Seerr is connected.',
        action: 'Connect Seerr',
        onAction: openSetup
      });
      return;
    }

    if (session.signedIn) {
      connection.textContent = 'Signed in as ' + ((session.user && session.user.displayName) || 'you') + ' on ' + session.host;
      connection.className = 'dark-state is-ok';
    } else {
      connection.textContent = session.permissionMissing ? 'Jellyboxd cannot reach ' + session.host + ' yet' : 'Not signed in to ' + session.host;
      connection.className = 'dark-state is-err';
      showTicket({ kind: 'ask', right: 'Box office', title: 'Sign in to Seerr', text: 'Your Seerr session is missing or ended.', action: 'Sign in', onAction: openSetup });
      return;
    }

    var tab = await activeTab();
    var onFilm = tab && tab.url && /^https:\/\/letterboxd\.com\/film\//.test(tab.url);
    var summary = onFilm ? await askTab(tab) : null;

    if (summary && summary.ready) {
      var film = summary.film.title + (summary.film.year ? ' (' + summary.film.year + ')' : '');
      showTicket({
        kind: summary.primary ? 'go' : '',
        left: 'This tab',
        right: summary.server,
        title: summary.headline,
        text: [film, summary.detail].filter(Boolean).join(' · '),
        action: summary.primary ? summary.primary.label : summary.seerrUrl ? 'Open in Seerr' : '',
        onAction: function () {
          openUrl(summary.primary ? summary.primary.url : summary.seerrUrl);
        }
      });
      return;
    }

    showTicket({
      right: 'Seerr',
      title: onFilm ? 'Loading this film…' : 'Open a film on Letterboxd',
      text: onFilm ? 'Reopen this popup in a moment.' : 'Jellyboxd shows on each film page, under the actions panel.',
      action: onFilm ? '' : 'Go to Letterboxd',
      onAction: function () {
        openUrl('https://letterboxd.com/');
      }
    });
  }

  start().catch(function (err) {
    showTicket({ title: 'Something went wrong', text: (err && err.message) || '' });
  });
})(globalThis);
