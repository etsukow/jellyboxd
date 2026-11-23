(function (global) {
  'use strict';

  // Shared by the setup window and the options page: sign in with the user's own Seerr session.
  // The caller must already hold the host permission (it can only be requested from a click).
  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var POLL_MS = 2000;
  var MAX_WAIT_MS = 10 * 60 * 1000;

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // onStatus(state, detail): 'checking' | 'waiting' | 'signed-in' (detail = user) | 'error' (detail = text) | 'timeout'
  async function signInWithSession(seerrUrl, onStatus) {
    var MSG = ns.MSG;
    onStatus('checking');
    var first = await ns.api.sendMessage({ type: MSG.SETUP_SIGNIN, payload: { seerrUrl: seerrUrl, method: 'cookie' } });
    if (!first || !first.ok) {
      onStatus('error', (first && first.error) || 'Could not reach Seerr.');
      return false;
    }
    if (first.signedIn) {
      onStatus('signed-in', first.user);
      return true;
    }
    await ns.api.createTab(seerrUrl);
    onStatus('waiting');
    var started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      await wait(POLL_MS);
      var res = await ns.api.sendMessage({ type: MSG.CHECK_SESSION, payload: { markComplete: true } });
      if (res && res.signedIn) {
        onStatus('signed-in', res.user);
        return true;
      }
    }
    onStatus('timeout');
    return false;
  }

  ns.connect = { signInWithSession: signInWithSession };
})(globalThis);
