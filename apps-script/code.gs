const SPREADSHEET_ID = '1GZrxajK6vApjG8kQeYKMZS_Dff7lZ52GgE_XFTKveM0';

const SHEETS = {
  SETTINGS: 'Settings',
  PLAYERS: 'Players',
  MATCHES: 'Matches',
  EVENTS: 'Events',
  PLAYER_MATCH: 'Player Match Data',
  VOTES: 'Votes',
  SUBS: 'Subs',
  SUBS_CONFIRM: 'Subs Confirmations',
  LINEUP: 'Lineup Positions'
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  const portal = String(params.portal || '').toLowerCase();
  const page = String(params.page || '').toLowerCase();
  const view = String(params.view || '').toLowerCase();
  const ghostToken = String(params.ghostToken || '').trim();
  const ghostDirect = String(params.ghost || '').trim() === '1';

  // GitHub Match Centre HTML bridge route. This avoids the ContentService/JSONP redirect path
  // that can fail intermittently on iOS/Safari.
  if (page === 'matchrpc') return handleMc2RpcPage_(params);

  // Public read-only API for GitHub-hosted pages. JSONP avoids browser CORS
  // restrictions while keeping all spreadsheet access inside Apps Script.
  const api = String(params.api || '').trim();
  if (api) return handlePublicApi_(api, params);

  let file = 'Home';
  let title = 'Perranporth Control Centre';

  if (page === 'admin') {
    file = 'Admin';
    title = 'Perranporth Match Centre';
  } else if (page === 'bridge') {
    file = 'Bridge';
    title = 'Perranporth Data Bridge';
  } else if (page === 'ghost') {
    file = 'Ghost';
    title = 'Perranporth Ghost Mode';
  } else if (page === 'voting') {
    file = 'VotingAdmin';
    title = 'Perranporth Voting Centre';
  } else if (page === 'vote') {
    file = 'Vote';
    title = 'Perranporth 3–2–1 Voting';
  } else if (page === 'dashboard') {
    file = 'Dashboard';
    title = 'Perranporth Season Dashboard';
  } else if (page === 'subs') {
    file = 'Subs';
    title = 'Perranporth Subs Tracker';
  } else if (page === 'player' || portal === 'player') {
    file = 'PlayerPortal';
    title = 'Perranporth Player Portal';
  }

  const appUrl = ScriptApp.getService().getUrl();
  const query = [];

  if (page) query.push('page=' + encodeURIComponent(page));
  if (portal) query.push('portal=' + encodeURIComponent(portal));
  if (view) query.push('view=' + encodeURIComponent(view));
  if (ghostToken) query.push('ghostToken=' + encodeURIComponent(ghostToken));
  if (ghostDirect) query.push('ghost=1');

  // Preserve the admin section when refreshing, e.g. Voting Centre.
  const section = String((e && e.parameter && e.parameter.section) || '').trim();
  if (section) query.push('section=' + encodeURIComponent(section));

  const refreshUrl = appUrl + (query.length ? '?' + query.join('&') : '');

  const template = HtmlService.createTemplateFromFile(file);
  template.appUrl = appUrl;
  template.refreshUrl = refreshUrl;
  template.initialView = view;
  template.initialSection = section;
  template.initialGhostToken = ghostToken;
  template.initialGhostDirect = ghostDirect ? '1' : '';

  const output = template
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  output.addMetaTag('viewport', 'width=device-width, initial-scale=1');

  return output;
}

function handleMc2RpcPage_(params) {
  const rid = String((params && params.rid) || '').trim();
  const channel = String((params && params.channel) || '').trim();

  let envelope;

  try {
    const payloadRaw = String((params && params.payload) || '');

    if (!payloadRaw) {
      throw new Error('Missing request payload.');
    }

    const payload = JSON.parse(payloadRaw);
    const action = String(payload.action || '').trim();
    const args = Array.isArray(payload.args) ? payload.args : [];

    envelope = {
      ok: true,
      result: runGithubRpc_(action, args)
    };

  } catch (err) {
    envelope = {
      ok: false,
      error: err && err.message
        ? err.message
        : String(err || 'Request failed')
    };
  }

  const message = {
    __pmd_match_bridge: true,
    id: rid,
    channel: channel,
    ok: envelope.ok
  };

  if (envelope.ok) {
    message.result = envelope.result;
  } else {
    message.error = envelope.error;
  }

  const safeJson = JSON.stringify(message).replace(/</g, '\\u003c');

  const html =
    '<!doctype html><meta charset="utf-8">' +
    '<script>' +
    'window.top.postMessage(' +
    safeJson +
    ', "https://PerranporthAFCMens.github.io");' +
    '</script>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}



function handlePublicApi_(api, params) {
  const callback = String((params && params.callback) || '').trim();
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService
      .createTextOutput('Invalid callback')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  let envelope;
  try {
    if (api === 'dashboardCurrent') {
      envelope = { ok: true, result: getPublicDashboardData() };
    } else if (api === 'dashboardHistoric') {
      envelope = { ok: true, result: getHistoricalDashboardData() };
    } else if (api === 'spectator') {
      envelope = { ok: true, result: getPublicSpectatorData() };
    } else if (api === 'rpc') {
      const payloadRaw = String((params && params.payload) || '');
      if (!payloadRaw) throw new Error('Missing request payload.');
      const payload = JSON.parse(payloadRaw);
      const action = String(payload.action || '').trim();
      const args = Array.isArray(payload.args) ? payload.args : [];
      envelope = { ok: true, result: runGithubRpc_(action, args) };
    } else {
      envelope = { ok: false, error: 'Unknown API request' };
    }
  } catch (err) {
    envelope = {
      ok: false,
      error: err && err.message ? err.message : String(err || 'Request failed')
    };
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(envelope) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getPublicSpectatorData() {
  const matchRows = getSS_().getSheetByName(SHEETS.MATCHES).getDataRange().getValues().slice(1);
  const liveMatches = matchRows.map(rowToMatch_).filter(m => m.matchId && String(m.status || '').toLowerCase() === 'live');
  if (!liveMatches.length) {
    return {
      live: false,
      generatedAt: Utilities.formatDate(new Date(), 'Europe/London', 'dd/MM/yyyy HH:mm:ss')
    };
  }

  const match = liveMatches[liveMatches.length - 1];
  const events = getEvents_(match.matchId).slice().sort((a,b) => Number(a.minute || 0) - Number(b.minute || 0));
  const score = calculateScore_(events);
  const clock = getMatchClock_(match.matchId);
  const squad = matchEventSquad_(match.matchId);
  const onPitch = Array.from(onPitchSet_(match.matchId, events));
  const onSet = new Set(onPitch);
  const redSet = new Set(events.filter(e => e.type === 'Red Card' && e.player).map(e => e.player));
  const lineup = getLineup_(match.matchId) || {};
  const positions = Array.isArray(lineup.positions) ? lineup.positions : [];
  const posByPlayer = {};
  positions.forEach(p => { if (p && p.player) posByPlayer[p.player] = p; });

  const allPlayers = squad.map(p => p.player).filter(Boolean);
  const available = allPlayers.filter(p => !onSet.has(p) && !redSet.has(p));
  const dismissed = allPlayers.filter(p => redSet.has(p));

  const publicEvents = events.map(e => ({
    minute: Number(e.minute || 0),
    type: String(e.type || ''),
    team: String(e.team || ''),
    player: String(e.player || ''),
    secondaryPlayer: String(e.secondaryPlayer || ''),
    goalType: String(e.goalType || ''),
    cardReason: String(e.cardReason || '')
  }));

  const home = String(match.venue || '').toLowerCase() !== 'away';
  return {
    live: true,
    match: {
      matchId: match.matchId,
      date: match.date,
      kickoff: match.kickoff,
      opponent: match.opponent,
      venue: match.venue,
      competition: match.competition,
      formation: (lineup && lineup.formation) || match.formation || ''
    },
    homeTeam: home ? 'Perranporth' : match.opponent,
    awayTeam: home ? match.opponent : 'Perranporth',
    homeScore: home ? Number(score.ours || 0) : Number(score.opp || 0),
    awayScore: home ? Number(score.opp || 0) : Number(score.ours || 0),
    clock: clock,
    onPitch: onPitch.map(name => ({
      name: name,
      x: posByPlayer[name] ? Number(posByPlayer[name].x || 0) : 0,
      y: posByPlayer[name] ? Number(posByPlayer[name].y || 0) : 0,
      order: posByPlayer[name] ? Number(posByPlayer[name].order || 0) : 0
    })),
    available: available,
    dismissed: dismissed,
    events: publicEvents,
    generatedAt: Utilities.formatDate(new Date(), 'Europe/London', 'dd/MM/yyyy HH:mm:ss')
  };
}

function openSubsWithPin_(pin) {
  const session = createAdminSession(pin);
  return {
    session: session,
    init: getInitData(session.token),
    subs: getSubsTrackerData(session.token)
  };
}

function resumeSubs_(token) {
  if (!verifyPin(token)) throw new Error('Your management session has expired.');
  return {
    init: getInitData(token),
    subs: getSubsTrackerData(token)
  };
}

function runGithubRpc_(action, args) {
  // Explicit GitHub RPC whitelist for the live Perranporth workbook.
  const handlers = {
    verifyPin: function(a) { return verifyPin(a[0]); },
    createAdminSession: function(a) { return createAdminSession(a[0]); },
    logoutAdminSession: function(a) { return logoutAdminSession(a[0]); },
    getInitData: function(a) { return getInitData(a[0]); },
    getMatches: function(a) { return getMatches(a[0], a[1]); },
    createMatch: function(a) { return createMatch(a[0], a[1]); },
    createTrialMatch: function(a) { return createTrialMatch(a[0]); },
    deleteTrialMatch: function(a) { return deleteTrialMatch(a[0], a[1]); },
    getSquad: function(a) { return getSquad(a[0], a[1]); },
    saveSquad: function(a) { return saveSquad(a[0], a[1], a[2]); },
    addPlayerToLiveSquad: function(a) { return addPlayerToLiveSquad(a[0], a[1], a[2]); },
    getLineup: function(a) { return getLineup(a[0], a[1]); },
    saveLineup: function(a) { return saveLineup(a[0], a[1], a[2]); },
    setStartingLineup: function(a) { return setStartingLineup(a[0], a[1], a[2]); },
    getMatchSummary: function(a) { return getMatchSummary(a[0], a[1]); },
    getFullMatchSummary: function(a) { return getFullMatchSummary(a[0], a[1]); },
    startMatch: function(a) { return startMatch(a[0], a[1]); },
    finishMatch: function(a) { return finishMatch(a[0], a[1]); },
    reopenMatch: function(a) { return reopenMatch(a[0], a[1]); },
    getMatchClock: function(a) { return getMatchClock(a[0], a[1]); },
    toggleMatchClock: function(a) { return toggleMatchClock(a[0], a[1]); },
    resetMatchClock: function(a) { return resetMatchClock(a[0], a[1]); },
    enterHalfTime: function(a) { return enterHalfTime(a[0], a[1]); },
    startSecondHalf: function(a) { return startSecondHalf(a[0], a[1]); },
    logEvent: function(a) { return logEvent(a[0], a[1], a[2]); },
    updateEvent: function(a) { return updateEvent(a[0], a[1], a[2], a[3]); },
    deleteEvent: function(a) { return deleteEvent(a[0], a[1], a[2]); },
    deleteLastEvent: function(a) { return deleteLastEvent(a[0], a[1]); },
    getSeasonStats: function(a) { return getSeasonStats(a[0]); },
    getPlayerMinutesData: function(a) { return getPlayerMinutesData(a[0]); },
    getAllPlayersForAdmin: function(a) { return getAllPlayersForAdmin(a[0]); },
    addPlayer: function(a) { return addPlayer(a[0], a[1]); },
    updatePlayer: function(a) { return updatePlayer(a[0], a[1], a[2]); },
    getPlayerPinAdminData: function(a) { return getPlayerPinAdminData(a[0]); },
    resetPlayerPin: function(a) { return resetPlayerPin(a[0], a[1], a[2]); },
    getManagementAdminData: function(a) { return getManagementAdminData(a[0]); },
    saveManagementUser: function(a) { return saveManagementUser(a[0], a[1]); },
    revokeManagementUser: function(a) { return revokeManagementUser(a[0], a[1]); },
    revokeManagementSessions: function(a) { return revokeManagementSessions(a[0], a[1]); },
    sendManagementPinReset: function(a) { return sendManagementPinReset(a[0], a[1]); },
    validateManagementResetToken: function(a) { return validateManagementResetToken(a[0]); },
    completeManagementPinReset: function(a) { return completeManagementPinReset(a[0], a[1]); },
    getSubsTrackerData: function(a) { return getSubsTrackerData(a[0]); },
    setSubsStatus: function(a) { return setSubsStatus(a[0], a[1], a[2], a[3]); },
    getVotingAdminData: function(a) { return getVotingAdminData(a[0]); },
    openVoting: function(a) { return openVoting(a[0], a[1]); },
    closeVoting: function(a) { return closeVoting(a[0]); },
    getVotingSnapshot: function(a) { return getVotingSnapshot(a[0], a[1]); },

    // Existing portal/public actions kept available for parity testing if needed.
    getPortalPlayers: function() { return getPortalPlayers(); },
    createPlayerSession: function(a) { return createPlayerSession(a[0], a[1]); },
    createPlayerSetupSession: function(a) { return createPlayerSetupSession(a[0], a[1]); },
    verifyPlayerSession: function(a) { return verifyPlayerSession(a[0]); },
    logoutPlayerSession: function(a) { return logoutPlayerSession(a[0]); },
    choosePlayerPin: function(a) { return choosePlayerPin(a[0], a[1]); },
    getPlayerPortalData: function(a) { return getPlayerPortalData(a[0]); },
    getGhostPlayerPortalData: function(a) { return getGhostPlayerPortalData(a[0]); },
    getGhostPlayerPortalDataDirect: function(a) { return getGhostPlayerPortalDataDirect(a[0], a[1]); },
    submitPortalVote: function(a) { return submitPortalVote(a[0], a[1]); },
    getPublicVotingData: function() { return getPublicVotingData(); },
    getPublicSpectatorData: function() { return getPublicSpectatorData(); },
    submitVote: function(a) { return submitVote(a[0], a[1]); }
  };

  if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
    throw new Error('Unsupported Match Centre request: ' + action);
  }
  assertGithubRpcAccess_(action, args);
  return handlers[action](args);
}

const ADMIN_SESSION_HOURS = 24;
const ADMIN_SESSION_PREFIX = 'ADMIN_SESSION_';
const MANAGEMENT_SHEET = 'Management Access';
const MANAGEMENT_RESET_PREFIX = 'MGMT_RESET_';
const MANAGEMENT_RESET_MINUTES = 60;
const MANAGEMENT_RESET_URL = 'https://PerranporthAFCMens.github.io/Perranporth/admin-reset.html';

const MANAGEMENT_ROLES = {
  FULL_ADMIN: ['*'],
  MATCHDAY: ['match', 'read'],
  VOTING: ['voting', 'read'],
  SUBS: ['subs', 'read'],
  READ_ONLY: ['read'],
  CUSTOM: []
};

function pinHash_(id, pin) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(id || '') + '|' + String(pin || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function ensureManagementSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(MANAGEMENT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MANAGEMENT_SHEET);
    sh.getRange(1, 1, 1, 12).setValues([[
      'ID','Name','Email','Role','Custom Access','Player Access Too',
      'Linked Player','PIN Hash','PIN Version','Active','Created At','Updated At'
    ]]);
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function managementRows_() {
  const sh = ensureManagementSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues().map(function(r, i) {
    return {
      row: i + 2,
      id: String(r[0] || '').trim(),
      name: String(r[1] || '').trim(),
      email: String(r[2] || '').trim(),
      role: String(r[3] || 'READ_ONLY').trim() || 'READ_ONLY',
      customAccess: String(r[4] || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean),
      playerAccessToo: bool_(r[5]),
      linkedPlayer: String(r[6] || '').trim(),
      pinHash: String(r[7] || '').trim(),
      pinVersion: Number(r[8] || 1),
      active: bool_(r[9]),
      createdAt: r[10] || '',
      updatedAt: r[11] || ''
    };
  }).filter(function(x){ return x.id; });
}

function getManagementUserById_(id) {
  return managementRows_().find(function(x) { return x.id === String(id || ''); }) || null;
}

function getManagementUserByPin_(pin) {
  pin = String(pin || '').trim();
  if (!pin) return null;
  return managementRows_().find(function(x) {
    return x.active && x.pinHash && x.pinHash === pinHash_(x.id, pin);
  }) || null;
}

function permissionsForManagementUser_(u) {
  if (!u) return [];
  if (u.role === 'FULL_ADMIN') return ['*'];
  if (u.role === 'CUSTOM') return (u.customAccess || []).slice();
  return (MANAGEMENT_ROLES[u.role] || []).slice();
}

function managementContext_(pinOrToken) {
  const value = String(pinOrToken || '').trim();
  if (!value) return null;

  const settings = getSettings_();
  const appPin = String(settings['App PIN'] || '').trim();
  const tempPin = String(settings['Temporary Management PIN'] || '').trim();

  if (appPin && value === appPin) {
    return { source: 'MAIN', id: 'MAIN', name: 'Main Admin', role: 'FULL_ADMIN', permissions: ['*'], pinVersion: 1 };
  }
  if (tempPin && value === tempPin) {
    return { source: 'TEMP', id: 'TEMP', name: 'Temporary Admin', role: 'FULL_ADMIN', permissions: ['*'], pinVersion: 1 };
  }

  const directUser = getManagementUserByPin_(value);
  if (directUser) {
    return {
      source: 'USER', id: directUser.id, name: directUser.name,
      role: directUser.role, permissions: permissionsForManagementUser_(directUser),
      pinVersion: directUser.pinVersion
    };
  }

  return adminSessionContext_(value);
}

function verifyPin(pinOrToken) {
  return !!managementContext_(pinOrToken);
}

function assertPin_(pinOrToken) {
  if (!verifyPin(pinOrToken)) throw new Error('Admin session expired. Please enter the PIN again.');
}

function createAdminSession(pin) {
  const enteredPin = String(pin || '').trim();
  const ctx = managementContext_(enteredPin);
  if (!ctx || ctx.source === 'SESSION') throw new Error('Incorrect PIN.');

  cleanupExpiredAdminSessions_();
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const expiresAt = Date.now() + (ADMIN_SESSION_HOURS * 60 * 60 * 1000);
  let storedValue = String(expiresAt);

  if (ctx.source === 'TEMP') {
    storedValue = String(expiresAt) + '|TEMP|' + enteredPin;
  } else if (ctx.source === 'USER') {
    storedValue = String(expiresAt) + '|USER|' + ctx.id + '|' + String(ctx.pinVersion || 1);
  }

  PropertiesService.getScriptProperties().setProperty(ADMIN_SESSION_PREFIX + token, storedValue);
  return { token: token, expiresAt: expiresAt };
}

function logoutAdminSession(token) {
  token = String(token || '').trim();
  if (token) PropertiesService.getScriptProperties().deleteProperty(ADMIN_SESSION_PREFIX + token);
  return true;
}

function adminSessionContext_(token) {
  const props = PropertiesService.getScriptProperties();
  const key = ADMIN_SESSION_PREFIX + String(token || '');
  const raw = props.getProperty(key);
  if (!raw) return null;

  const parts = String(raw).split('|');
  const expiresAt = Number(parts[0]);
  if (!expiresAt || Date.now() >= expiresAt) {
    props.deleteProperty(key);
    return null;
  }

  if (!parts[1]) {
    return { source: 'SESSION', id: 'MAIN', name: 'Main Admin', role: 'FULL_ADMIN', permissions: ['*'], pinVersion: 1 };
  }

  if (parts[1] === 'TEMP') {
    const current = String(getSettings_()['Temporary Management PIN'] || '').trim();
    if (!current || parts[2] !== current) {
      props.deleteProperty(key);
      return null;
    }
    return { source: 'SESSION', id: 'TEMP', name: 'Temporary Admin', role: 'FULL_ADMIN', permissions: ['*'], pinVersion: 1 };
  }

  if (parts[1] === 'USER') {
    const u = getManagementUserById_(parts[2]);
    if (!u || !u.active || Number(parts[3] || 0) !== Number(u.pinVersion || 1)) {
      props.deleteProperty(key);
      return null;
    }
    return {
      source: 'SESSION', id: u.id, name: u.name, role: u.role,
      permissions: permissionsForManagementUser_(u), pinVersion: u.pinVersion
    };
  }

  props.deleteProperty(key);
  return null;
}

function isValidAdminSession_(token) {
  return !!adminSessionContext_(token);
}

function cleanupExpiredAdminSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(ADMIN_SESSION_PREFIX) !== 0) return;
    const expiresAt = Number(String(all[key] || '').split('|')[0]);
    if (!expiresAt || now >= expiresAt) props.deleteProperty(key);
  });
}

function hasManagementPermission_(ctx, permission) {
  if (!ctx) return false;
  const p = ctx.permissions || [];
  return p.indexOf('*') !== -1 || p.indexOf(permission) !== -1;
}

function assertManagementPermission_(pinOrToken, permission) {
  const ctx = managementContext_(pinOrToken);
  if (!ctx) throw new Error('Admin session expired. Please enter the PIN again.');
  if (!hasManagementPermission_(ctx, permission)) throw new Error('You do not have access to this area.');
  return ctx;
}

function assertFullAdmin_(pinOrToken) {
  const ctx = managementContext_(pinOrToken);
  if (!ctx) throw new Error('Admin session expired. Please enter the PIN again.');
  if (!hasManagementPermission_(ctx, '*')) throw new Error('Full Admin access is required.');
  return ctx;
}

function assertGithubRpcAccess_(action, args) {
  const noAdminAuth = new Set([
    'verifyPin','createAdminSession','logoutAdminSession',
    'getPortalPlayers','createPlayerSession','createPlayerSetupSession','verifyPlayerSession',
    'logoutPlayerSession','choosePlayerPin','getPlayerPortalData','submitPortalVote','submitVote',
    'getPublicVotingData','getPublicSpectatorData',
    'validateManagementResetToken','completeManagementPinReset'
  ]);
  if (noAdminAuth.has(action)) return true;

  const adminActions = new Set([
    'getAllPlayersForAdmin','addPlayer','updatePlayer','getPlayerPinAdminData','resetPlayerPin',
    'getManagementAdminData','saveManagementUser','revokeManagementUser','revokeManagementSessions','sendManagementPinReset'
  ]);
  const votingActions = new Set(['getVotingAdminData','openVoting','closeVoting','getVotingSnapshot']);
  const subsActions = new Set(['getSubsTrackerData','setSubsStatus']);
  const readActions = new Set(['getInitData','getMatches','getSeasonStats','getPlayerMinutesData','getGhostPlayerPortalData','getGhostPlayerPortalDataDirect']);

  let permission = 'match';
  if (adminActions.has(action)) permission = '*';
  else if (votingActions.has(action)) permission = 'voting';
  else if (subsActions.has(action)) permission = 'subs';
  else if (readActions.has(action)) permission = 'read';

  if (permission === '*') assertFullAdmin_(args && args[0]);
  else assertManagementPermission_(args && args[0], permission);
  return true;
}

function getManagementAdminData(pin) {
  assertFullAdmin_(pin);
  return {
    users: managementRows_().filter(function(u){ return u.active; }).map(function(u) {
      return {
        id: u.id, name: u.name, email: u.email, role: u.role,
        customAccess: u.customAccess || [], playerAccessToo: !!u.playerAccessToo,
        linkedPlayer: u.linkedPlayer || '', hasPin: !!u.pinHash
      };
    }).sort(function(a,b){ return a.name.localeCompare(b.name); }),
    players: getPlayers_().map(function(p){ return p.name; })
  };
}

function linkedPlayerPin_(playerName) {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh || sh.getLastRow() < 2) return '';
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 9)).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === String(playerName || '').trim()) {
      return String(rows[i][7] || '').trim();
    }
  }
  return '';
}

function setLinkedPlayerPin_(playerName, newPin) {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh || sh.getLastRow() < 2) throw new Error('Linked player not found.');
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 9)).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === String(playerName || '').trim()) {
      sh.getRange(i + 2, 8).setValue(String(newPin));
      sh.getRange(i + 2, 9).setValue(true);
      return true;
    }
  }
  throw new Error('Linked player not found.');
}

function saveManagementUser(pin, data) {
  assertFullAdmin_(pin);
  data = data || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const role = String(data.role || 'READ_ONLY').trim();
  const playerAccessToo = !!data.playerAccessToo;
  const linkedPlayer = String(data.linkedPlayer || '').trim();
  const allowedRoles = Object.keys(MANAGEMENT_ROLES);
  if (!name) throw new Error('Enter a name.');
  if (allowedRoles.indexOf(role) === -1) throw new Error('Choose a valid access level.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  if (playerAccessToo && !linkedPlayer) throw new Error('Choose the linked player for Player access too.');

  const allowedCustom = ['match','voting','subs','read'];
  const customAccess = (Array.isArray(data.customAccess) ? data.customAccess : []).filter(function(x){ return allowedCustom.indexOf(x) !== -1; });
  const sh = ensureManagementSheet_();
  let existing = data.id ? getManagementUserById_(data.id) : null;
  const now = new Date();

  if (!existing) {
    const id = 'MU-' + Utilities.getUuid();
    let hash = '';
    let version = 1;
    if (playerAccessToo && linkedPlayer) {
      const existingPlayerPin = linkedPlayerPin_(linkedPlayer);
      if (existingPlayerPin) hash = pinHash_(id, existingPlayerPin);
    }
    sh.appendRow([id,name,email,role,customAccess.join(','),playerAccessToo,linkedPlayer,hash,version,true,now,now]);
    return id;
  }

  let hash = existing.pinHash;
  let version = Number(existing.pinVersion || 1);
  const linkChanged = existing.playerAccessToo !== playerAccessToo || existing.linkedPlayer !== linkedPlayer;
  if (playerAccessToo && linkedPlayer && linkChanged) {
    const existingPlayerPin = linkedPlayerPin_(linkedPlayer);
    if (existingPlayerPin) {
      hash = pinHash_(existing.id, existingPlayerPin);
      version += 1;
      revokeManagementSessionsById_(existing.id);
    }
  }
  sh.getRange(existing.row, 2, 1, 9).setValues([[
    name,email,role,customAccess.join(','),playerAccessToo,linkedPlayer,hash,version,true
  ]]);
  sh.getRange(existing.row, 12).setValue(now);
  return existing.id;
}

function revokeManagementSessionsById_(id) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(ADMIN_SESSION_PREFIX) !== 0) return;
    const parts = String(all[key] || '').split('|');
    if (parts[1] === 'USER' && parts[2] === String(id)) props.deleteProperty(key);
  });
}

function revokeManagementSessions(pin, id) {
  assertFullAdmin_(pin);
  const u = getManagementUserById_(id);
  if (!u) throw new Error('Management user not found.');
  revokeManagementSessionsById_(u.id);
  return true;
}

function revokeManagementUser(pin, id) {
  assertFullAdmin_(pin);
  const u = getManagementUserById_(id);
  if (!u) throw new Error('Management user not found.');
  const sh = ensureManagementSheet_();
  sh.getRange(u.row, 8).setValue('');
  sh.getRange(u.row, 9).setValue(Number(u.pinVersion || 1) + 1);
  sh.getRange(u.row, 10).setValue(false);
  sh.getRange(u.row, 12).setValue(new Date());
  revokeManagementSessionsById_(u.id);
  return true;
}

function createManagementResetToken_(u) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const payload = {
    id: u.id,
    expiresAt: Date.now() + MANAGEMENT_RESET_MINUTES * 60 * 1000
  };
  PropertiesService.getScriptProperties().setProperty(MANAGEMENT_RESET_PREFIX + token, JSON.stringify(payload));
  return token;
}

function sendManagementPinReset(pin, id) {
  assertFullAdmin_(pin);
  const u = getManagementUserById_(id);
  if (!u || !u.active) throw new Error('Management user not found.');
  if (!u.email) throw new Error('Add an email address first.');
  const token = createManagementResetToken_(u);
  const link = MANAGEMENT_RESET_URL + '?token=' + encodeURIComponent(token);
  const subject = 'Perranporth AFC management PIN reset';
  const plain = 'Hi ' + u.name + ',\n\nUse this link to choose a new Perranporth management PIN. The link expires in ' + MANAGEMENT_RESET_MINUTES + ' minutes:\n\n' + link + '\n\nIf you did not expect this email, you can ignore it.';
  const html = '<p>Hi ' + escapeHtmlEmail_(u.name) + ',</p><p>Use the button below to choose a new Perranporth management PIN. The link expires in ' + MANAGEMENT_RESET_MINUTES + ' minutes.</p><p><a href="' + link + '" style="display:inline-block;background:#0b5ea8;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Reset management PIN</a></p><p>If you did not expect this email, you can ignore it.</p>';
  MailApp.sendEmail({to:u.email,subject:subject,body:plain,htmlBody:html,name:'Perranporth AFC'});
  return true;
}

function escapeHtmlEmail_(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function resetTokenPayload_(token) {
  token = String(token || '').trim();
  if (!token) throw new Error('This reset link is invalid.');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(MANAGEMENT_RESET_PREFIX + token);
  if (!raw) throw new Error('This reset link is invalid or has already been used.');
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { payload = null; }
  if (!payload || !payload.id || !payload.expiresAt || Date.now() >= Number(payload.expiresAt)) {
    props.deleteProperty(MANAGEMENT_RESET_PREFIX + token);
    throw new Error('This reset link has expired.');
  }
  const u = getManagementUserById_(payload.id);
  if (!u || !u.active) throw new Error('Management access is no longer active.');
  return { token: token, user: u };
}

function validateManagementResetToken(token) {
  const x = resetTokenPayload_(token);
  return { name: x.user.name, playerAccessToo: !!x.user.playerAccessToo };
}

function completeManagementPinReset(token, newPin) {
  const x = resetTokenPayload_(token);
  newPin = String(newPin || '').trim();
  const required = x.user.playerAccessToo ? /^\d{4}$/ : /^\d{4,8}$/;
  if (!required.test(newPin)) {
    throw new Error(x.user.playerAccessToo ? 'Choose a 4-digit PIN.' : 'Choose a 4 to 8 digit PIN.');
  }
  return withLock_(function() {
    const current = getManagementUserById_(x.user.id);
    if (!current || !current.active) throw new Error('Management access is no longer active.');
    const sh = ensureManagementSheet_();
    const nextVersion = Number(current.pinVersion || 1) + 1;
    sh.getRange(current.row, 8).setValue(pinHash_(current.id, newPin));
    sh.getRange(current.row, 9).setValue(nextVersion);
    sh.getRange(current.row, 12).setValue(new Date());
    if (current.playerAccessToo) {
      if (!current.linkedPlayer) throw new Error('No player is linked to this management account.');
      setLinkedPlayerPin_(current.linkedPlayer, newPin);
    }
    revokeManagementSessionsById_(current.id);
    PropertiesService.getScriptProperties().deleteProperty(MANAGEMENT_RESET_PREFIX + x.token);
    return true;
  });
}

function getSS_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSettings_() {
  const sh = getSS_().getSheetByName(SHEETS.SETTINGS);
  const rows = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
  const out = {};
  rows.forEach(r => {
    const k = String(r[0] || '').trim();
    if (k) out[k] = r[1];
  });
  return out;
}

function setSetting_(key, value) {
  const sh = getSS_().getSheetByName(SHEETS.SETTINGS);
  const last = Math.max(sh.getLastRow(), 1);
  const vals = sh.getRange(1, 1, last, 2).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}


/* =========================
   SHARED MATCH CLOCK
   =========================
   The clock is stored in Script Properties rather than in one browser.
   That means any authorised user/device opening the live match sees the
   same current match time, including half-time state.
*/
function matchClockKey_(matchId) {
  return 'MATCH_CLOCK_' + String(matchId);
}

function defaultMatchClockState_(matchId) {
  return {
    matchId: String(matchId || ''),
    startedAt: null,
    baseSeconds: 0,
    runningSince: null,
    onBreak: false,
    half: 1,
    firstHalfAddedMinutes: 0,
    finishedAt: null,
    updatedAt: Date.now()
  };
}

function readMatchClockState_(matchId) {
  const raw = PropertiesService.getScriptProperties().getProperty(matchClockKey_(matchId));
  if (!raw) return defaultMatchClockState_(matchId);
  try {
    return Object.assign(defaultMatchClockState_(matchId), JSON.parse(raw));
  } catch (err) {
    return defaultMatchClockState_(matchId);
  }
}

function writeMatchClockState_(matchId, state) {
  state.matchId = String(matchId);
  state.updatedAt = Date.now();
  PropertiesService.getScriptProperties().setProperty(
    matchClockKey_(matchId),
    JSON.stringify(state)
  );
  return state;
}

function elapsedSecondsFromClockState_(state, nowMs) {
  const now = Number(nowMs || Date.now());
  const base = Number(state.baseSeconds || 0);
  if (!state.runningSince) return Math.max(0, base);
  return Math.max(0, base + Math.floor((now - Number(state.runningSince)) / 1000));
}

function firstHalfAddedFromElapsed_(elapsedSeconds) {
  if (Number(elapsedSeconds || 0) <= 2700) return 0;
  return Math.max(0, Math.floor((Number(elapsedSeconds) - 2700) / 60) + 1);
}

function publicClockState_(state) {
  const now = Date.now();
  const elapsedSeconds = elapsedSecondsFromClockState_(state, now);
  return {
    matchId: String(state.matchId || ''),
    started: !!state.startedAt,
    startedAt: state.startedAt || null,
    startedAtText: state.startedAt
      ? Utilities.formatDate(new Date(Number(state.startedAt)), 'Europe/London', 'HH:mm:ss')
      : '',
    elapsedSeconds,
    running: !!state.runningSince,
    onBreak: !!state.onBreak,
    half: Number(state.half || 1),
    firstHalfAddedMinutes: Number(state.firstHalfAddedMinutes || 0),
    finishedAt: state.finishedAt || null,
    finishedAtText: state.finishedAt
      ? Utilities.formatDate(new Date(Number(state.finishedAt)), 'Europe/London', 'HH:mm:ss')
      : '',
    serverNow: now
  };
}

function getMatchClock_(matchId) {
  return publicClockState_(readMatchClockState_(matchId));
}

function getMatchClock(pin, matchId) {
  assertPin_(pin);
  return getMatchClock_(matchId);
}

function startMatchClockState_(matchId) {
  const now = Date.now();
  const state = defaultMatchClockState_(matchId);
  state.startedAt = now;
  state.runningSince = now;
  state.baseSeconds = 0;
  state.onBreak = false;
  state.half = 1;
  state.firstHalfAddedMinutes = 0;
  state.finishedAt = null;
  return writeMatchClockState_(matchId, state);
}

function toggleMatchClock(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => {
    assertMatchNotCompleted_(matchId);
    const state = readMatchClockState_(matchId);
    if (!state.startedAt) return publicClockState_(startMatchClockState_(matchId));
    if (state.onBreak) throw new Error('Start the second half using the Half Time button.');

    if (state.runningSince) {
      state.baseSeconds = elapsedSecondsFromClockState_(state, Date.now());
      state.runningSince = null;
    } else {
      state.runningSince = Date.now();
    }
    return publicClockState_(writeMatchClockState_(matchId, state));
  });
}

function resetMatchClock(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => {
    assertMatchNotCompleted_(matchId);
    const state = defaultMatchClockState_(matchId);
    return publicClockState_(writeMatchClockState_(matchId, state));
  });
}

function enterHalfTime(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => {
    assertMatchNotCompleted_(matchId);
    const state = readMatchClockState_(matchId);
    if (!state.startedAt) throw new Error('The match clock has not been started.');

    const elapsed = elapsedSecondsFromClockState_(state, Date.now());
    state.baseSeconds = elapsed;
    state.runningSince = null;
    state.onBreak = true;
    state.half = 1;
    state.firstHalfAddedMinutes = firstHalfAddedFromElapsed_(elapsed);
    return publicClockState_(writeMatchClockState_(matchId, state));
  });
}

function startSecondHalf(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => {
    assertMatchNotCompleted_(matchId);
    const state = readMatchClockState_(matchId);
    if (!state.startedAt) throw new Error('The match clock has not been started.');
    if (!state.onBreak) throw new Error('The match is not currently at half time.');

    state.half = 2;
    state.baseSeconds = 2700;
    state.runningSince = Date.now();
    state.onBreak = false;
    return publicClockState_(writeMatchClockState_(matchId, state));
  });
}

function stopMatchClock_(matchId) {
  const state = readMatchClockState_(matchId);
  const now = Date.now();
  state.baseSeconds = elapsedSecondsFromClockState_(state, now);
  state.runningSince = null;
  state.onBreak = false;
  state.finishedAt = now;
  return writeMatchClockState_(matchId, state);
}

function storedMinuteParts_(minuteValue) {
  const n = Number(minuteValue || 0);
  if (!Number.isFinite(n)) return { base: 0, added: 0, stoppage: false };
  if (Number.isInteger(n)) return { base: n, added: 0, stoppage: false };
  const base = Math.floor(n);
  const added = Math.round((n - base) * 100);
  return { base, added, stoppage: added > 0 && (base === 45 || base === 90) };
}

// Converts the stored sortable event value (e.g. 45.04 = 45+4)
// into the minute used for PLAYER MINUTES.
//
// Stoppage time is deliberately ignored for player-minute totals:
// 45+4 counts as 45, 90+6 counts as 90.
// The event still keeps its true 45+4 / 90+6 timestamp for match reporting.
function cumulativeMatchMinute_(minuteValue, firstHalfAddedMinutes) {
  const p = storedMinuteParts_(minuteValue);
  if (p.stoppage && p.base === 45) return 45;
  if (p.stoppage && p.base === 90) return 90;
  return Math.max(0, Math.min(90, p.base));
}

function clockEndMinuteForStats_(clock) {
  if (!clock || !clock.started) return 90;

  // A completed first half is worth a maximum of 45 player-minutes.
  if (Number(clock.half || 1) === 1) {
    return Math.max(0, Math.min(45, Math.ceil(Number(clock.elapsedSeconds || 0) / 60)));
  }

  // Once the match has reached the second half, a normal completed match
  // finishes at 90 player-minutes regardless of stoppage time.
  return 90;
}

function assertMatchNotCompleted_(matchId) {
  const mr = getMatchRow_(matchId);
  if (String(mr.values[6]) === 'Completed') {
    throw new Error('This match is already finished.');
  }
}

function bool_(v) {
  return v === true || String(v).toLowerCase() === 'true';
}

function normaliseName_(s) {
  return String(s || '').trim().toLowerCase();
}

function fmtDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/London', 'dd/MM/yyyy');
  return String(v);
}

function fmtTime_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/London', 'HH:mm');
  return String(v);
}

function matchLabel_(m) {
  const suffix = m.venue === 'Home' ? 'H' : m.venue === 'Away' ? 'A' : 'N';
  return `${m.opponent} (${suffix})`;
}

function defaultPaymentIdentifier_(m) {
  const suffix = m.venue === 'Home' ? 'H' : m.venue === 'Away' ? 'A' : 'N';

  const friendlyNames = {
    'Perranporth Inter-club': 'Interclub',
    'Illogan Rbl 2nd': 'Illogan2nds',
    'Wendron United 3rd': 'Wendron3rds',
    'Dropship FC 1st': 'Dropship1st',
    'RNAS Culdrose 1st': 'Culdrose1st',
    'Falmouth United 1st': 'Falmouth1st',
    'Porthleven 2nd': 'Porthleven2nds',
    'West Cornwall Football Club 1st': 'WestCornwall1st',
    'Newlyn Non-Athletico 1st': 'Newlyn1st',
    'Frogpool & Cusgarne 1st': 'FrogpoolCusgarne1st',
    'Goonhavern Athletic 1st': 'Goonhavern1st',
    'Lizard Argyle 1st': 'Lizard1st',
    'Holman Sports Club 1st': 'Holman1st'
  };

  let base = friendlyNames[m.opponent] || String(m.opponent || '')
    .replace(/\b2nd\b/gi, '2nds')
    .replace(/\b3rd\b/gi, '3rds')
    .replace(/[^A-Za-z0-9]/g, '');

  return base + suffix;
}

function paymentLinkFromIdentifier_(identifier) {
  return 'https://monzo.me/adamturner4/3.00?h=CmJ3lb&d=' +
    encodeURIComponent(String(identifier || '')) +
    '&account_type=personal';
}

function ensureSubsPlayerColumn_(playerName) {
  const sh = getSS_().getSheetByName(SHEETS.SUBS);
  if (!sh) return;

  const lastCol = Math.max(sh.getLastColumn(), 8);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.some(h => normaliseName_(h) === normaliseName_(playerName))) return;

  const col = lastCol + 1;
  sh.getRange(1, col).setValue(playerName);
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Paid', 'Not Paid', 'N/A'], true)
      .setAllowInvalid(false)
      .build()
  );
}

function ensureSubsRow_(matchId) {
  const ss = getSS_();
  const sh = ss.getSheetByName(SHEETS.SUBS);
  if (!sh) throw new Error('Subs sheet is missing.');

  const lastRow = Math.max(sh.getLastRow(), 1);
  const ids = lastRow > 1
    ? sh.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String)
    : [];

  const idx = ids.indexOf(String(matchId));
  if (idx >= 0) {
    const row = idx + 2;
    const identifier = String(sh.getRange(row, 4).getDisplayValue() || '');
    let link = String(sh.getRange(row, 5).getDisplayValue() || '');
    if (!link && identifier) {
      link = paymentLinkFromIdentifier_(identifier);
      sh.getRange(row, 5).setFormula(
        '=IF($D' + row + '="","","https://monzo.me/adamturner4/3.00?h=CmJ3lb&d="&ENCODEURL($D' + row + ')&"&account_type=personal")'
      );
    }
    return { row, identifier, link };
  }

  const m = rowToMatch_(getMatchRow_(matchId).values);
  const identifier = defaultPaymentIdentifier_(m);
  const row = sh.getLastRow() + 1;

  sh.getRange(row, 1, 1, 4).setValues([[
    matchId,
    m.date,
    matchLabel_(m),
    identifier
  ]]);

  sh.getRange(row, 5).setFormula(
    '=IF($D' + row + '="","","https://monzo.me/adamturner4/3.00?h=CmJ3lb&d="&ENCODEURL($D' + row + ')&"&account_type=personal")'
  );
  sh.getRange(row, 6).setFormula('=COUNTIF($H' + row + ':$X' + row + ',"Paid")');
  sh.getRange(row, 7).setFormula('=COUNTIF($H' + row + ':$X' + row + ',"Not Paid")');

  return {
    row,
    identifier,
    link: paymentLinkFromIdentifier_(identifier)
  };
}

function getSubsPayment_(matchId) {
  if (!matchId) return { identifier: '', link: '' };
  return ensureSubsRow_(matchId);
}

function recordSubsResponse_(matchId, voterName, paidAnswer) {
  if (!matchId || !voterName || !paidAnswer) return;

  const players = getPlayers_();
  const aliasMap = {};
  players.forEach(p => {
    aliasMap[normaliseName_(p.name)] = p.name;
    if (p.alias) aliasMap[normaliseName_(p.alias)] = p.name;
  });

  const canonical = aliasMap[normaliseName_(voterName)];
  if (!canonical) return;

  const sh = getSS_().getSheetByName(SHEETS.SUBS);
  if (!sh) return;

  const subs = ensureSubsRow_(matchId);
  ensureSubsPlayerColumn_(canonical);

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIndex = headers.findIndex(h => normaliseName_(h) === normaliseName_(canonical));

  if (colIndex < 0) return;

  sh.getRange(subs.row, colIndex + 1).setValue(
    String(paidAnswer) === 'Yes' ? 'Paid' : 'Not Paid'
  );
}


/* =========================
   LINEUP BUILDER
   ========================= */

function ensureLineupSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(SHEETS.LINEUP);

  if (!sh) {
    sh = ss.insertSheet(SHEETS.LINEUP);
    sh.getRange(1, 1, 1, 8).setValues([[
      'Match ID', 'Player', 'Area', 'X', 'Y', 'Order', 'Formation', 'Updated At'
    ]]);
    sh.setFrozenRows(1);
    sh.hideSheet();
  }

  return sh;
}

function getLineup(pin, matchId) {
  assertPin_(pin);
  return getLineup_(matchId);
}

function getLineup_(matchId) {
  const sh = ensureLineupSheet_();
  const rows = sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0] || '') === String(matchId));

  const mr = getMatchRow_(matchId);
  const matchFormation = String(mr.values[9] || '');

  const positions = rows.map(r => ({
    player: String(r[1] || ''),
    area: String(r[2] || ''),
    x: Number(r[3] || 0),
    y: Number(r[4] || 0),
    order: Number(r[5] || 0)
  })).filter(x => x.player && (x.area === 'Pitch' || x.area === 'Bench'));

  const storedFormation = rows.length ? String(rows[0][6] || '') : '';

  return {
    matchId: String(matchId),
    formation: storedFormation || matchFormation || 'Custom',
    positions: positions
  };
}

function saveLineup(pin, matchId, payload) {
  assertPin_(pin);
  return withLock_(() => saveLineup_(matchId, payload || {}));
}

function saveLineup_(matchId, payload) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || 'Scheduled');

  const activeNames = new Set(getPlayers_().map(p => p.name));
  const seen = new Set();
  const formation = String(payload.formation || 'Custom').trim() || 'Custom';

  const positions = (payload.positions || []).map((p, i) => ({
    player: String(p.player || '').trim(),
    area: String(p.area || '').trim(),
    x: Number(p.x || 0),
    y: Number(p.y || 0),
    order: Number(p.order || i + 1)
  })).filter(p => {
    if (!p.player || seen.has(p.player) || !activeNames.has(p.player)) return false;
    if (p.area !== 'Pitch' && p.area !== 'Bench') return false;
    seen.add(p.player);
    return true;
  });

  const sh = ensureLineupSheet_();
  const values = sh.getDataRange().getValues();

  for (let r = values.length; r >= 2; r--) {
    if (String(values[r - 1][0] || '') === String(matchId)) {
      sh.deleteRow(r);
    }
  }

  if (positions.length) {
    const now = new Date();
    const rows = positions.map(p => [
      matchId,
      p.player,
      p.area,
      p.area === 'Pitch' ? Math.max(0, Math.min(100, p.x)) : '',
      p.area === 'Pitch' ? Math.max(0, Math.min(100, p.y)) : '',
      p.order,
      formation,
      now
    ]);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  }

  // Before kickoff / after full time, the lineup establishes the saved squad:
  // pitch = Starter, bench = Sub.
  //
  // While LIVE, the lineup is a visual/tactical board only. Actual substitutions
  // must still be recorded with the Substitution event button, so we do not
  // rewrite Player Match Data while the match is live.
  if (status !== 'Live') {
    const squad = positions.map(p => ({
      player: p.player,
      status: p.area === 'Pitch' ? 'Starter' : 'Sub',
      position: '',
      shirtNo: ''
    }));
    saveSquad_(matchId, squad);
  }

  if (formation && formation !== 'Custom') {
    mr.sheet.getRange(mr.row, 10).setValue(formation);
  }

  return getLineup_(matchId);
}

function getPlayers(pin) {
  assertPin_(pin);
  return getPlayers_();
}

function getPlayers_() {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  const rows = sh.getDataRange().getValues();
  return rows.slice(1)
    .filter(r => bool_(r[1]))
    .map(r => ({
      name: String(r[0] || '').trim(),
      active: bool_(r[1]),
      position: String(r[2] || ''),
      shirtNo: r[3] || '',
      goalkeeper: bool_(r[4]),
      notes: String(r[5] || ''),
      alias: String(r[6] || '')
    }))
    .filter(p => p.name)
    .sort((a,b) => a.name.localeCompare(b.name));
}

function getMatches(pin, includeCompleted) {
  assertPin_(pin);
  return getMatches_(includeCompleted);
}

function getMatches_(includeCompleted) {
  const sh = getSS_().getSheetByName(SHEETS.MATCHES);
  const rows = sh.getDataRange().getValues();
  const out = rows.slice(1).map(r => ({
    matchId: String(r[0] || ''),
    date: fmtDate_(r[1]),
    opponent: String(r[2] || ''),
    venue: String(r[3] || ''),
    competition: String(r[4] || ''),
    kickoff: fmtTime_(r[5]),
    status: String(r[6] || ''),
    ourScore: r[7] === '' ? '' : r[7],
    oppScore: r[8] === '' ? '' : r[8],
    formation: String(r[9] || ''),
    captain: String(r[10] || ''),
    notes: String(r[11] || ''),
    include: r.length < 13 ? true : bool_(r[12]),
    source: String(r[13] || ''),
    calendarKey: String(r[14] || ''),
    ground: String(r[15] || '')
  }))
  .filter(m => {
    if (!m.matchId || !m.include) return false;
    if (!includeCompleted && m.status === 'Completed') return false;

    // Keep demo/test data out of the real Match Centre.
    if (String(m.source || '').toLowerCase() === 'trial') return false;
    if (/pre[- ]?season/i.test(String(m.calendarKey || '') + ' ' + String(m.notes || ''))) return false;
    if (String(m.source || '').toLowerCase() === 'manual' && /^(test|testing|trial)\b/i.test(String(m.opponent || '').trim())) return false;

    return true;
  })
  .sort((a,b) => {
    const pa = a.date.split('/').reverse().join('-') + ' ' + (a.kickoff || '');
    const pb = b.date.split('/').reverse().join('-') + ' ' + (b.kickoff || '');
    return pa.localeCompare(pb);
  });
  return out;
}

function getInitData(pin) {
  assertPin_(pin);
  const s = getSettings_();
  return {
    teamName: String(s['Team Name'] || 'Perranporth AFC'),
    season: String(s['Season'] || '2026/27'),
    badgeUrl: String(s['Voting Badge URL'] || ''),
    players: getPlayers_(),
    allPlayers: getAllPlayersForAdmin(pin),
    matches: getMatches_(true)
  };
}

function addPlayer(pin, data) {
  assertPin_(pin);
  return withLock_(() => addPlayer_(data));
}

function addPlayer_(data) {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Enter a player name.');
  const existing = sh.getDataRange().getValues().slice(1)
    .some(r => normaliseName_(r[0]) === normaliseName_(name));
  if (existing) throw new Error('That player already exists.');
  ensurePlayerPinChosenColumn_();
  ensurePlayerDobColumn_();
  sh.appendRow([
    name,
    true,
    data.position || '',
    data.shirtNo || '',
    !!data.goalkeeper,
    data.notes || '',
    data.alias || '',
    '',
    false,
    ''
  ]);
  if (data.dateOfBirth) setPlayerDob_(sh, sh.getLastRow(), data.dateOfBirth);
  ensureSubsPlayerColumn_(name);
  return {
    name,
    active: true,
    position: data.position || '',
    shirtNo: data.shirtNo || '',
    goalkeeper: !!data.goalkeeper,
    notes: data.notes || '',
    alias: data.alias || ''
  };
}


function getAllPlayersForAdmin(pin) {
  assertPin_(pin);
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  ensurePlayerDobColumn_();
  return sh.getDataRange().getValues().slice(1)
    .map(r => ({
      name: String(r[0] || '').trim(),
      active: bool_(r[1]),
      position: String(r[2] || ''),
      shirtNo: r[3] || '',
      goalkeeper: bool_(r[4]),
      notes: String(r[5] || ''),
      alias: String(r[6] || ''),
      dateOfBirth: formatPlayerDob_(r[9])
    }))
    .filter(p => p.name)
    .sort((a,b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function updatePlayer(pin, originalName, data) {
  assertPin_(pin);
  return withLock_(() => updatePlayer_(originalName, data));
}

function updatePlayer_(originalName, data) {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  const rows = sh.getDataRange().getValues();
  const originalKey = normaliseName_(originalName);
  const newName = String(data.name || '').trim();

  if (!originalKey) throw new Error('Player not found.');
  if (!newName) throw new Error('Player name cannot be blank.');

  let rowNumber = -1;
  for (let i = 1; i < rows.length; i++) {
    if (normaliseName_(rows[i][0]) === originalKey) {
      rowNumber = i + 1;
      break;
    }
  }
  if (rowNumber === -1) throw new Error('Player not found.');

  const duplicate = rows.slice(1).some((r, i) =>
    (i + 2) !== rowNumber &&
    normaliseName_(r[0]) === normaliseName_(newName)
  );
  if (duplicate) throw new Error('Another player already has that name.');

  sh.getRange(rowNumber, 1, 1, 7).setValues([[
    newName,
    data.active !== false,
    data.position || '',
    data.shirtNo || '',
    !!data.goalkeeper,
    data.notes || '',
    data.alias || ''
  ]]);
  setPlayerDob_(sh, rowNumber, data.dateOfBirth || '');

  if (typeof ensureSubsPlayerColumn_ === 'function') {
    ensureSubsPlayerColumn_(newName);
  }

  return {
    name: newName,
    active: data.active !== false,
    position: data.position || '',
    shirtNo: data.shirtNo || '',
    goalkeeper: !!data.goalkeeper,
    notes: data.notes || '',
    alias: data.alias || ''
  };
}


function deleteRowsForMatch_(sheetName, matchIdColumn, matchId) {
  const sh = getSS_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;

  const values = sh.getRange(2, matchIdColumn, sh.getLastRow() - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '') === String(matchId)) {
      sh.deleteRow(i + 2);
    }
  }
}

function deleteTrialMatchData_(matchId) {
  const id = String(matchId || '');
  if (!id) return;

  deleteRowsForMatch_(SHEETS.EVENTS, 2, id);
  deleteRowsForMatch_(SHEETS.PLAYER_MATCH, 1, id);
  deleteRowsForMatch_(SHEETS.SUBS, 1, id);
  deleteRowsForMatch_(SHEETS.LINEUP, 1, id);
  deleteRowsForMatch_(SHEETS.VOTES, 2, id);
  deleteRowsForMatch_(SHEETS.MATCHES, 1, id);

  PropertiesService.getScriptProperties().deleteProperty(matchClockKey_(id));
}

function clearExistingTrialMatches_() {
  const sh = getSS_().getSheetByName(SHEETS.MATCHES);
  if (!sh || sh.getLastRow() < 2) return;

  const rows = sh.getDataRange().getValues().slice(1);
  const trialIds = rows
    .filter(r => String(r[13] || '').toLowerCase() === 'trial')
    .map(r => String(r[0] || ''))
    .filter(Boolean);

  trialIds.forEach(deleteTrialMatchData_);
}

function createTrialMatch(pin) {
  assertPin_(pin);

  return withLock_(() => {
    clearExistingTrialMatches_();

    const sh = getSS_().getSheetByName(SHEETS.MATCHES);
    const now = new Date();
    const id = 'TRIAL-' + Utilities.formatDate(now, 'Europe/London', 'yyyyMMdd-HHmmss');
    const kick = new Date(1899, 11, 30, now.getHours(), now.getMinutes(), 0);

    sh.appendRow([
      id,
      now,
      'Demo / Trial Match',
      'Home',
      'Trial',
      kick,
      'Scheduled',
      '',
      '',
      '',
      '',
      'Temporary demo match — excluded from real match lists and season data.',
      true,
      'Trial',
      '',
      ''
    ]);

    return id;
  });
}

function deleteTrialMatch(pin, matchId) {
  assertPin_(pin);

  return withLock_(() => {
    const mr = getMatchRow_(matchId);
    const source = String(mr.values[13] || '').toLowerCase();
    if (source !== 'trial') throw new Error('Only trial matches can be deleted with this button.');

    deleteTrialMatchData_(matchId);
    return true;
  });
}

function createMatch(pin, d) {
  assertPin_(pin);
  return withLock_(() => createMatch_(d));
}

function createMatch_(d) {
  const sh = getSS_().getSheetByName(SHEETS.MATCHES);
  const id = 'M' + Utilities.formatDate(new Date(), 'Europe/London', 'yyyyMMdd-HHmmss');
  const dt = d.date ? new Date(d.date + 'T12:00:00') : new Date();
  let kick = '';
  if (d.kickoff) {
    const parts = String(d.kickoff).split(':');
    kick = new Date(1899, 11, 30, Number(parts[0]), Number(parts[1] || 0), 0);
  }
  sh.appendRow([
    id, dt, d.opponent || '', d.venue || 'Home', d.competition || 'Other',
    kick, 'Scheduled', '', '', d.formation || '', d.captain || '', d.notes || '',
    true, 'Manual', '', ''
  ]);
  return id;
}

function getMatchRow_(matchId) {
  const sh = getSS_().getSheetByName(SHEETS.MATCHES);
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(matchId)) {
      return { sheet: sh, row: i + 1, values: vals[i] };
    }
  }
  throw new Error('Match not found.');
}

function rowToMatch_(r) {
  return {
    matchId: String(r[0] || ''),
    date: fmtDate_(r[1]),
    opponent: String(r[2] || ''),
    venue: String(r[3] || ''),
    competition: String(r[4] || ''),
    kickoff: fmtTime_(r[5]),
    status: String(r[6] || ''),
    ourScore: r[7] === '' ? 0 : r[7],
    oppScore: r[8] === '' ? 0 : r[8],
    formation: String(r[9] || ''),
    captain: String(r[10] || ''),
    notes: String(r[11] || ''),
    include: r.length < 13 ? true : bool_(r[12]),
    ground: String(r[15] || '')
  };
}

function getSquad(pin, matchId) {
  assertPin_(pin);
  return getSquad_(matchId);
}

function getSquad_(matchId) {
  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]) === String(matchId))
    .map(r => ({
      player: String(r[1] || ''),
      status: String(r[2] || ''),
      starter: bool_(r[3]),
      position: String(r[4] || ''),
      shirtNo: r[5] || '',
      minuteOn: r[6],
      minuteOff: r[7],
      minutesPlayed: Number(r[8] || 0),
      goals: Number(r[9] || 0),
      assists: Number(r[10] || 0),
      yellows: Number(r[11] || 0),
      reds: Number(r[12] || 0),
      notes: String(r[13] || '')
    }));
}

function saveSquad(pin, matchId, squad) {
  assertPin_(pin);
  return withLock_(() => saveSquad_(matchId, squad));
}

function saveSquad_(matchId, squad) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || 'Scheduled');

  if (status === 'Live') {
    throw new Error('The match is live. Edit the squad before kickoff or after full time.');
  }

  const ss = getSS_();
  const sh = ss.getSheetByName(SHEETS.PLAYER_MATCH);
  const all = sh.getDataRange().getValues();

  for (let r = all.length; r >= 2; r--) {
    if (String(all[r - 1][0]) === String(matchId)) sh.deleteRow(r);
  }

  (squad || []).forEach(p => {
    const starter = p.status === 'Starter';
    sh.appendRow([
      matchId, p.player, p.status, starter, p.position || '', p.shirtNo || '',
      starter ? 0 : '', '', 0, 0, 0, 0, 0, ''
    ]);
  });

  if (status === 'Completed') {
    recalculateCompletedMatchPlayerStats_(matchId);
  }

  return getMatchSummary_(matchId);
}

function setStartingLineup(pin, matchId, lineup) {
  assertPin_(pin);
  return withLock_(() => setStartingLineup_(matchId, lineup));
}

function setStartingLineup_(matchId, lineup) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || 'Scheduled');
  if (status === 'Completed') throw new Error('The match is already finished.');

  const positions = Array.isArray(lineup && lineup.positions) ? lineup.positions : [];
  const pitch = positions.filter(p => p && p.area === 'Pitch' && p.player).map(p => String(p.player).trim()).filter(Boolean);
  const bench = positions.filter(p => p && p.area === 'Bench' && p.player).map(p => String(p.player).trim()).filter(Boolean);

  const uniquePitch = [...new Set(pitch)];
  const uniqueBench = [...new Set(bench.filter(name => !uniquePitch.includes(name)))];
  if (!uniquePitch.length) throw new Error('Put the starting players on the pitch first.');
  if (uniquePitch.length > 11) throw new Error('A starting lineup cannot have more than 11 players.');

  const activeByName = {};
  getPlayers_().forEach(p => { activeByName[p.name] = p; });
  const existing = getSquad_(matchId);
  const existingByName = {};
  existing.forEach(p => { existingByName[p.player] = p; });

  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  const all = sh.getDataRange().getValues();
  for (let r = all.length; r >= 2; r--) {
    if (String(all[r - 1][0]) === String(matchId)) sh.deleteRow(r);
  }

  const writePlayer = (name, playerStatus) => {
    const old = existingByName[name] || {};
    const meta = activeByName[name] || {};
    const starter = playerStatus === 'Starter';
    sh.appendRow([
      matchId,
      name,
      playerStatus,
      starter,
      old.position || meta.position || '',
      old.shirtNo || meta.shirtNo || '',
      starter ? 0 : '',
      old.minuteOff || '',
      Number(old.minutesPlayed || 0),
      Number(old.goals || 0),
      Number(old.assists || 0),
      Number(old.yellows || 0),
      Number(old.reds || 0),
      old.notes || ''
    ]);
  };

  uniquePitch.forEach(name => writePlayer(name, 'Starter'));
  uniqueBench.forEach(name => writePlayer(name, 'Sub'));

  if (lineup) saveLineup_(matchId, lineup);
  return getMatchSummary_(matchId);
}

function addPlayerToLiveSquad(pin, matchId, playerName) {
  assertPin_(pin);
  return withLock_(() => addPlayerToLiveSquad_(matchId, playerName));
}

function addPlayerToLiveSquad_(matchId, playerName) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || 'Scheduled');
  if (status !== 'Live') throw new Error('Players can only be added this way while the match is live.');

  playerName = String(playerName || '').trim();
  if (!playerName) throw new Error('Select a player to add.');

  const activePlayers = getPlayers_();
  const player = activePlayers.find(p => p.name === playerName);
  if (!player) throw new Error('That player is not currently active in Manage Players.');

  const squad = getSquad_(matchId);
  if (!squad.length) {
    throw new Error('No squad is saved for this match. All active players are already available for events.');
  }
  if (squad.some(p => p.player === playerName)) return getMatchSummary_(matchId);

  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  sh.appendRow([
    matchId, playerName, 'Sub', false, player.position || '', player.shirtNo || '',
    '', '', 0, 0, 0, 0, 0, 'Added to live squad'
  ]);

  return getMatchSummary_(matchId);
}

function startMatch(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => startMatch_(matchId));
}

function startMatch_(matchId) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || 'Scheduled');

  if (status === 'Completed') {
    throw new Error('This match has already been completed.');
  }
  if (status === 'Live') {
    return getMatchSummary_(matchId);
  }

  // Squad is optional. The match can start with no squad saved.
  mr.sheet.getRange(mr.row, 7).setValue('Live');
  startMatchClockState_(matchId);

  return getMatchSummary_(matchId);
}

function getEvents_(matchId) {
  const sh = getSS_().getSheetByName(SHEETS.EVENTS);
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]) === String(matchId))
    .map(r => ({
      eventId: String(r[0] || ''),
      matchId: String(r[1] || ''),
      minute: Number(r[2] || 0),
      type: String(r[3] || ''),
      team: String(r[4] || ''),
      player: String(r[5] || ''),
      secondaryPlayer: String(r[6] || ''),
      goalType: String(r[7] || ''),
      touches: r[8] || '',
      zone: String(r[9] || ''),
      originZone: String(r[10] || ''),
      cardReason: String(r[11] || ''),
      notes: String(r[12] || ''),
      timestamp: r[13] instanceof Date
        ? Utilities.formatDate(r[13], 'Europe/London', 'dd/MM/yyyy HH:mm:ss')
        : String(r[13] || '')
    }))
    .sort((a,b) => a.minute - b.minute);
}

function calculateScore_(events) {
  let ours = 0, opp = 0;
  events.forEach(e => {
    if (e.type === 'Goal' && e.team !== 'Opposition') ours++;
    if (e.type === 'Conceded Goal' || (e.type === 'Goal' && e.team === 'Opposition')) opp++;
  });
  return { ours, opp };
}

function getMatchSummary(pin, matchId) {
  assertPin_(pin);
  return getMatchSummary_(matchId);
}

function getMatchSummary_(matchId) {
  const mr = getMatchRow_(matchId);
  const events = getEvents_(matchId);
  const score = calculateScore_(events);
  if (Number(mr.values[7] || 0) !== score.ours || Number(mr.values[8] || 0) !== score.opp) {
    mr.sheet.getRange(mr.row, 8, 1, 2).setValues([[score.ours, score.opp]]);
    mr.values[7] = score.ours;
    mr.values[8] = score.opp;
  }
  return {
    match: rowToMatch_(mr.values),
    events,
    squad: getSquad_(matchId),
    clock: getMatchClock_(matchId)
  };
}

function getFullMatchSummary(pin, matchId) {
  assertPin_(pin);
  return getMatchSummary_(matchId);
}

function logEvent(pin, e) {
  assertPin_(pin);
  return withLock_(() => logEvent_(e));
}


function matchEventSquad_(matchId) {
  return getSquad_(matchId).filter(p => p.status === 'Starter' || p.status === 'Sub');
}

function onPitchSet_(matchId, events) {
  const squad = matchEventSquad_(matchId);
  const onPitch = new Set(squad.filter(p => p.status === 'Starter').map(p => p.player));

  (events || []).forEach(ev => {
    if (ev.type === 'Substitution') {
      if (ev.player) onPitch.delete(ev.player);
      if (ev.secondaryPlayer) onPitch.add(ev.secondaryPlayer);
    }
    if (ev.type === 'Red Card' && ev.player) {
      onPitch.delete(ev.player);
    }
  });

  return onPitch;
}

function validateEvent_(e) {
  // The saved squad/lineup is optional context only.
  // Event recording always allows any currently active player.
  const allowedNames = new Set(getPlayers_().map(p => p.name));

  if (!Number.isFinite(Number(e.minute)) || Number(e.minute) <= 0) {
    throw new Error('Enter a valid match minute.');
  }

  if (e.eventType === 'Goal') {
    if (!e.player) throw new Error('Select a scorer.');
    if (!allowedNames.has(e.player)) throw new Error('Select an active player.');
    if (e.secondaryPlayer) {
      if (!allowedNames.has(e.secondaryPlayer)) throw new Error('Select an active assist player.');
      if (e.secondaryPlayer === e.player) throw new Error('The scorer and assist player cannot be the same.');
    }
  }

  if (e.eventType === 'Yellow Card' || e.eventType === 'Red Card') {
    if (!e.player) throw new Error('Select the player who received the card.');
    if (!allowedNames.has(e.player)) throw new Error('Select an active player.');
  }

  if (e.eventType === 'Substitution') {
    if (!e.player || !e.secondaryPlayer) throw new Error('Select both the player off and the player on.');
    if (e.player === e.secondaryPlayer) throw new Error('The player off and player on cannot be the same.');
    if (!allowedNames.has(e.player) || !allowedNames.has(e.secondaryPlayer)) {
      throw new Error('Select active players for the substitution.');
    }
  }
}

function logEvent_(e) {
  if (!e || !e.matchId || !e.eventType) throw new Error('Incomplete event.');
  assertMatchNotCompleted_(e.matchId);
  validateEvent_(e);
  const sh = getSS_().getSheetByName(SHEETS.EVENTS);
  const id = 'E' + Utilities.getUuid().slice(0, 12);
  sh.appendRow([
    id,
    e.matchId,
    Number(e.minute || 0),
    e.eventType,
    e.team || '',
    e.player || '',
    e.secondaryPlayer || '',
    e.goalType || e.restartPhase || '',
    e.touches || '',
    e.zone || '',
    e.originZone || '',
    e.cardReason || '',
    e.notes || '',
    new Date()
  ]);
  return getMatchSummary_(e.matchId);
}


function updateEvent(pin, e) {
  assertPin_(pin);
  return withLock_(() => updateEvent_(e));
}

function updateEvent_(e) {
  if (!e || !e.eventId || !e.matchId || !e.eventType) {
    throw new Error('Incomplete event update.');
  }

  // Editing is deliberately allowed after Full Time so post-match review can
  // correct zones, scorer/assist, notes, cards, etc.
  validateEvent_(e);

  const sh = getSS_().getSheetByName(SHEETS.EVENTS);
  const vals = sh.getDataRange().getValues();
  let row = 0;

  for (let r = 2; r <= vals.length; r++) {
    if (
      String(vals[r - 1][0] || '') === String(e.eventId) &&
      String(vals[r - 1][1] || '') === String(e.matchId)
    ) {
      row = r;
      break;
    }
  }

  if (!row) throw new Error('Event not found.');

  sh.getRange(row, 3, 1, 11).setValues([[
    Number(e.minute || 0),
    e.eventType,
    e.team || '',
    e.player || '',
    e.secondaryPlayer || '',
    e.goalType || e.restartPhase || '',
    e.touches || '',
    e.zone || '',
    e.originZone || '',
    e.cardReason || '',
    e.notes || ''
  ]]);

  // Keep player goal/assist/card totals aligned without disturbing recorded
  // minutes, which may have been entered/reconstructed separately.
  refreshCompletedMatchEventStats_(e.matchId);

  return getMatchSummary_(e.matchId);
}

function refreshCompletedMatchEventStats_(matchId) {
  const pmd = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  if (!pmd || pmd.getLastRow() < 2) return;

  const events = getEvents_(matchId);
  const vals = pmd.getDataRange().getValues();

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0] || '') !== String(matchId)) continue;
    const player = String(vals[i][1] || '');
    if (!player) continue;

    const goals = events.filter(e => e.type === 'Goal' && e.player === player && e.team !== 'Opposition').length;
    const assists = events.filter(e => e.type === 'Goal' && e.secondaryPlayer === player && e.team !== 'Opposition').length;
    const yellows = events.filter(e => e.type === 'Yellow Card' && e.player === player).length;
    const reds = events.filter(e => e.type === 'Red Card' && e.player === player).length;

    pmd.getRange(i + 1, 10, 1, 4).setValues([[goals, assists, yellows, reds]]);
  }
}

function deleteEvent(pin, eventId, matchId) {
  assertPin_(pin);
  return withLock_(() => deleteEvent_(eventId, matchId));
}

function deleteEvent_(eventId, matchId) {
  if (!eventId || !matchId) throw new Error('Missing event details.');

  const sh = getSS_().getSheetByName(SHEETS.EVENTS);
  const vals = sh.getDataRange().getValues();
  let row = 0;

  for (let r = 2; r <= vals.length; r++) {
    if (
      String(vals[r - 1][0] || '') === String(eventId) &&
      String(vals[r - 1][1] || '') === String(matchId)
    ) {
      row = r;
      break;
    }
  }

  if (!row) throw new Error('Event not found.');

  sh.deleteRow(row);

  // Keep completed player goal/assist/card totals aligned after a deletion.
  refreshCompletedMatchEventStats_(matchId);

  return getMatchSummary_(matchId);
}

function deleteLastEvent(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => deleteLastEvent_(matchId));
}

function deleteLastEvent_(matchId) {
  assertMatchNotCompleted_(matchId);
  const sh = getSS_().getSheetByName(SHEETS.EVENTS);
  const vals = sh.getDataRange().getValues();
  for (let r = vals.length; r >= 2; r--) {
    if (String(vals[r - 1][1]) === String(matchId)) {
      sh.deleteRow(r);
      break;
    }
  }
  return getMatchSummary_(matchId);
}

function finishMatch(pin, matchId, matchLength) {
  assertPin_(pin);
  return withLock_(() => finishMatch_(matchId, matchLength));
}

function finishMatch_(matchId, matchLength) {
  assertMatchNotCompleted_(matchId);
  const events = getEvents_(matchId);
  const score = calculateScore_(events);
  const mr = getMatchRow_(matchId);
  mr.sheet.getRange(mr.row, 7, 1, 3).setValues([['Completed', score.ours, score.opp]]);

  const clockBeforeFinish = getMatchClock_(matchId);
  stopMatchClock_(matchId);

  recalculateCompletedMatchPlayerStats_(matchId, clockBeforeFinish, matchLength);

  return getMatchSummary_(matchId);
}

function reopenMatch(pin, matchId) {
  assertPin_(pin);
  return withLock_(() => reopenMatch_(matchId));
}

function reopenMatch_(matchId) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || '');

  if (status !== 'Completed') {
    throw new Error('Only a completed match can be reopened.');
  }

  // Return the match to Live.
  mr.sheet.getRange(mr.row, 7).setValue('Live');

  // Reopen for editing, but keep the clock frozen at the exact time
  // Full Time was originally pressed. The user can explicitly resume it
  // afterwards if this is genuinely a live match continuation.
  const state = readMatchClockState_(matchId);
  state.finishedAt = null;
  state.onBreak = false;
  state.runningSince = null;
  writeMatchClockState_(matchId, state);

  return getMatchSummary_(matchId);
}

function recalculateCompletedMatchPlayerStats_(matchId, clockSnapshot, fallbackMatchLength) {
  const ss = getSS_();
  const pmd = ss.getSheetByName(SHEETS.PLAYER_MATCH);
  const vals = pmd.getDataRange().getValues();
  const rows = vals.slice(1).filter(r => String(r[0]) === String(matchId));

  // No squad saved: nothing to calculate yet.
  if (!rows.length) return;

  const events = getEvents_(matchId);
  const clock = clockSnapshot || getMatchClock_(matchId);
  const firstHalfAdded = Number((clock && clock.firstHalfAddedMinutes) || 0);
  const endMinute = clock && clock.started
    ? clockEndMinuteForStats_(clock)
    : cumulativeMatchMinute_(Number(fallbackMatchLength || 90), firstHalfAdded);

  const ordered = events.slice().sort((a,b) =>
    cumulativeMatchMinute_(a.minute, firstHalfAdded) -
    cumulativeMatchMinute_(b.minute, firstHalfAdded)
  );

  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) !== String(matchId)) continue;

    const player = String(vals[i][1] || '');
    const starter = bool_(vals[i][3]);
    let active = starter;
    let currentOn = starter ? 0 : null;
    let firstOn = starter ? 0 : null;
    let lastOff = null;
    let minutes = 0;

    ordered.forEach(e => {
      const minute = cumulativeMatchMinute_(e.minute, firstHalfAdded);

      if (e.type === 'Substitution') {
        if (e.player === player && active) {
          minutes += Math.max(0, minute - currentOn);
          active = false;
          currentOn = null;
          lastOff = minute;
        }
        if (e.secondaryPlayer === player && !active) {
          active = true;
          currentOn = minute;
          if (firstOn === null) firstOn = minute;
        }
      }

      if (e.type === 'Red Card' && e.player === player && active) {
        minutes += Math.max(0, minute - currentOn);
        active = false;
        currentOn = null;
        lastOff = minute;
      }
    });

    if (active && currentOn !== null) {
      minutes += Math.max(0, endMinute - currentOn);
    }

    const goals = events.filter(e => e.type === 'Goal' && e.player === player).length;
    const assists = events.filter(e => e.type === 'Goal' && e.secondaryPlayer === player).length;
    const yellows = events.filter(e => e.type === 'Yellow Card' && e.player === player).length;
    const reds = events.filter(e => e.type === 'Red Card' && e.player === player).length;

    pmd.getRange(i + 1, 7, 1, 7).setValues([[
      firstOn === null ? '' : firstOn,
      lastOff === null ? '' : lastOff,
      minutes,
      goals,
      assists,
      yellows,
      reds
    ]]);
  }
}


function getSeasonStats(pin) {
  assertPin_(pin);
  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  const rows = sh.getDataRange().getValues().slice(1);
  const completedIds = new Set(
    getMatches_(true).filter(m => m.status === 'Completed').map(m => m.matchId)
  );
  const map = {};
  rows.forEach(r => {
    const matchId = String(r[0] || '');
    if (!completedIds.has(matchId)) return;
    const player = String(r[1] || '');
    if (!player) return;
    if (!map[player]) map[player] = {player, appearances:0, goals:0, assists:0, minutes:0, yellows:0, reds:0};
    const x = map[player];
    if (String(r[2] || '') !== 'Unused') x.appearances++;
    x.minutes += Number(r[8] || 0);
    x.goals += Number(r[9] || 0);
    x.assists += Number(r[10] || 0);
    x.yellows += Number(r[11] || 0);
    x.reds += Number(r[12] || 0);
  });
  return Object.values(map).sort((a,b) =>
    b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes || a.player.localeCompare(b.player)
  );
}


function getPlayerMinutesData(pin) {
  assertPin_(pin);

  const matches = getMatches_(true)
    .filter(m => m.status === 'Completed');

  const matchMap = {};
  matches.forEach(m => {
    matchMap[String(m.matchId)] = {
      matchId: String(m.matchId),
      date: m.date || '',
      opponent: m.opponent || '',
      venue: m.venue || '',
      competition: m.competition || ''
    };
  });

  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  const rows = sh.getDataRange().getValues().slice(1);
  const seasonMap = {};
  const perMatch = {};

  rows.forEach(r => {
    const matchId = String(r[0] || '');
    const match = matchMap[matchId];
    if (!match) return;

    const player = String(r[1] || '');
    if (!player) return;

    const status = String(r[2] || '');
    const starter = bool_(r[3]);
    const appeared = status !== 'Unused' && status !== 'Not in Squad';

    if (!seasonMap[player]) {
      seasonMap[player] = {
        player,
        starts: 0,
        subApps: 0,
        appearances: 0,
        minutes: 0
      };
    }

    const season = seasonMap[player];
    if (appeared) {
      season.appearances++;
      if (starter) season.starts++;
      else season.subApps++;
    }
    season.minutes += Number(r[8] || 0);

    if (!perMatch[matchId]) {
      perMatch[matchId] = {
        ...match,
        players: []
      };
    }

    perMatch[matchId].players.push({
      player,
      status,
      starter,
      minuteOn: r[6] === '' ? '' : Number(r[6]),
      minuteOff: r[7] === '' ? '' : Number(r[7]),
      minutesPlayed: Number(r[8] || 0)
    });
  });

  const season = Object.values(seasonMap)
    .map(x => ({
      ...x,
      averageMinutes: x.appearances ? Math.round((x.minutes / x.appearances) * 10) / 10 : 0
    }))
    .sort((a,b) =>
      b.minutes - a.minutes ||
      b.appearances - a.appearances ||
      a.player.localeCompare(b.player)
    );

  const matchRows = Object.values(perMatch)
    .map(m => ({
      ...m,
      players: m.players.sort((a,b) =>
        Number(b.starter) - Number(a.starter) ||
        Number(a.minuteOn || 999) - Number(b.minuteOn || 999) ||
        a.player.localeCompare(b.player)
      )
    }))
    .sort((a,b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(a.opponent || '').localeCompare(String(b.opponent || ''))
    );

  return {
    season,
    matches: matchRows
  };
}




/* =========================
   SUBS TRACKER
   ========================= */


function ensureSubsConfirmSheet_() {
  let sh = getSS_().getSheetByName(SHEETS.SUBS_CONFIRM);
  if (!sh) {
    sh = getSS_().insertSheet(SHEETS.SUBS_CONFIRM);
    sh.getRange(1, 1, 1, 4).setValues([[
      'Match ID', 'Player', 'Confirmed At', 'Confirmed By'
    ]]);
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function getSubsConfirmSet_() {
  const sh = ensureSubsConfirmSheet_();
  const set = new Set();
  if (sh.getLastRow() < 2) return set;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const matchId = String(r[0] || '').trim();
    const player = normaliseName_(r[1]);
    if (matchId && player) set.add(matchId + '|' + player);
  });
  return set;
}

function isSubsConfirmed_(matchId, playerName, confirmSet) {
  const set = confirmSet || getSubsConfirmSet_();
  return set.has(String(matchId || '').trim() + '|' + normaliseName_(playerName));
}

function setSubsConfirmation_(matchId, playerName, confirmed) {
  const sh = ensureSubsConfirmSheet_();
  const key = String(matchId || '').trim() + '|' + normaliseName_(playerName);
  const rows = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    : [];

  let foundRow = 0;
  rows.some((r, i) => {
    const rowKey = String(r[0] || '').trim() + '|' + normaliseName_(r[1]);
    if (rowKey === key) {
      foundRow = i + 2;
      return true;
    }
    return false;
  });

  if (confirmed) {
    if (foundRow) {
      sh.getRange(foundRow, 3, 1, 2).setValues([[new Date(), 'Management']]);
    } else {
      sh.appendRow([matchId, playerName, new Date(), 'Management']);
    }
  } else if (foundRow) {
    sh.deleteRow(foundRow);
  }
}

function subsDisplayStatus_(rawStatus, confirmed) {
  rawStatus = String(rawStatus || '').trim();
  if (confirmed) return 'Confirmed Paid';
  if (rawStatus === 'Paid') return 'Claims Paid';
  if (rawStatus === 'Not Paid') return 'Not Paid';
  if (rawStatus === 'N/A') return 'N/A';
  return 'Unconfirmed';
}

function getSubsMatrix_() {
  const sh = getSS_().getSheetByName(SHEETS.SUBS);
  if (!sh) throw new Error('Subs sheet is missing.');

  const values = sh.getDataRange().getValues();
  if (!values.length) return { sh, headers: [], rows: [] };

  return {
    sh,
    headers: values[0].map(v => String(v || '').trim()),
    rows: values.slice(1)
  };
}

function getPlayedMatchIdsByPlayer_() {
  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;

  sh.getDataRange().getValues().slice(1).forEach(r => {
    const matchId = String(r[0] || '').trim();
    const player = String(r[1] || '').trim();
    const starter = bool_(r[3]);
    const mins = Number(r[8] || 0);
    const notes = String(r[13] || '').toLowerCase();
    const knownUsedSub = notes.includes('used sub');
    if (!matchId || !player || (!starter && mins <= 0 && !knownUsedSub)) return;
    if (!out[player]) out[player] = new Set();
    out[player].add(matchId);
  });
  return out;
}

function getSubsTrackerData(pin) {
  assertPin_(pin);

  const matrix = getSubsMatrix_();
  const confirmSet = getSubsConfirmSet_();
  const realMatches = getMatches_(true)
    .filter(m => m.status === 'Completed' && String(m.source || '') !== 'Trial');

  const playedByPlayer = getPlayedMatchIdsByPlayer_();
  const players = getPlayers_().filter(p => p.active !== false);
  const rowByMatch = {};
  matrix.rows.forEach((r, i) => rowByMatch[String(r[0] || '')] = { row: r, sheetRow: i + 2 });

  const result = players.map(p => {
    const headerIdx = matrix.headers.findIndex(h => normaliseName_(h) === normaliseName_(p.name));
    const played = playedByPlayer[p.name] || new Set();
    const matches = [];

    realMatches.forEach(m => {
      const matchId = String(m.matchId);
      if (!played.has(matchId)) return;

      const subRow = rowByMatch[matchId];
      let rawStatus = '';
      let link = '';
      if (subRow) {
        if (headerIdx >= 0) rawStatus = String(subRow.row[headerIdx] || '').trim();
        link = String(subRow.row[4] || '').trim();
      }
      if (!link) {
        try { link = getSubsPayment_(matchId).link || ''; } catch (e) {}
      }

      const confirmed = isSubsConfirmed_(matchId, p.name, confirmSet);
      matches.push({
        matchId,
        date: m.date,
        match: matchLabel_(m),
        rawStatus: rawStatus || '',
        status: subsDisplayStatus_(rawStatus, confirmed),
        confirmed,
        paymentLink: link
      });
    });

    matches.sort((a,b) => String(b.date).localeCompare(String(a.date)));

    const confirmedPaid = matches.filter(x => x.status === 'Confirmed Paid').length;
    const claimsPaid = matches.filter(x => x.status === 'Claims Paid').length;
    const notPaid = matches.filter(x => x.status === 'Not Paid').length;
    const unconfirmed = matches.filter(x => x.status === 'Unconfirmed').length;
    const outstanding = matches.filter(x => !['Confirmed Paid','N/A'].includes(x.status)).length;

    // Do not ask somebody to pay again when they have already said they paid.
    // Claims Paid stays outstanding for management confirmation, but is not
    // included in the player's payment total.
    const unpaidMatches = matches.filter(x =>
      x.status === 'Not Paid' || x.status === 'Unconfirmed'
    );
    const paymentDue = unpaidMatches.length;
    const amountDue = paymentDue * 3;
    const paymentIdentifier = String(p.name || '').replace(/[^A-Za-z0-9]/g, '') + 'Subs';
    const totalPaymentLink = amountDue > 0
      ? 'https://monzo.me/adamturner4/' + amountDue.toFixed(2) +
        '?h=CmJ3lb&d=' + encodeURIComponent(paymentIdentifier) +
        '&account_type=personal'
      : '';

    return {
      name: p.name,
      confirmedPaid,
      claimsPaid,
      notPaid,
      unconfirmed,
      outstanding,
      paymentDue,
      amountDue,
      totalPaymentLink,
      unpaidMatches,
      matches
    };
  }).filter(p => p.matches.length);

  result.sort((a,b) =>
    b.outstanding - a.outstanding ||
    b.claimsPaid - a.claimsPaid ||
    a.name.localeCompare(b.name)
  );

  const byMatchMap = {};
  result.forEach(p => {
    p.matches.forEach(m => {
      if (!byMatchMap[m.matchId]) {
        byMatchMap[m.matchId] = {
          matchId: m.matchId,
          date: m.date,
          match: m.match,
          paymentLink: m.paymentLink || '',
          players: [],
          confirmedPaid: 0,
          claimsPaid: 0,
          notPaid: 0,
          unconfirmed: 0
        };
      }
      const entry = byMatchMap[m.matchId];
      entry.players.push({ name: p.name, status: m.status, rawStatus: m.rawStatus, confirmed: m.confirmed });
      if (m.status === 'Confirmed Paid') entry.confirmedPaid++;
      else if (m.status === 'Claims Paid') entry.claimsPaid++;
      else if (m.status === 'Not Paid') entry.notPaid++;
      else if (m.status === 'Unconfirmed') entry.unconfirmed++;
    });
  });

  const matches = Object.values(byMatchMap)
    .sort((a,b) => String(b.date).localeCompare(String(a.date)));

  const debtors = result
    .filter(p => p.paymentDue > 0 || p.claimsPaid > 0)
    .map(p => ({
      name: p.name,
      outstandingGames: p.outstanding,
      paymentDue: p.paymentDue,
      amountDue: p.amountDue,
      totalPaymentLink: p.totalPaymentLink,
      claimsPaid: p.claimsPaid,
      notPaid: p.notPaid,
      unconfirmed: p.unconfirmed,
      matches: p.unpaidMatches,
      claimsMatches: p.matches.filter(m => m.status === 'Claims Paid')
    }))
    .sort((a,b) => b.amountDue - a.amountDue || a.name.localeCompare(b.name));

  const pendingConfirmation = [];
  result.forEach(p => {
    p.matches
      .filter(m => m.status === 'Claims Paid')
      .forEach(m => pendingConfirmation.push({
        player: p.name,
        matchId: m.matchId,
        date: m.date,
        match: m.match,
        paymentLink: m.paymentLink
      }));
  });
  pendingConfirmation.sort((a,b) => String(b.date).localeCompare(String(a.date)) || a.player.localeCompare(b.player));

  return {
    players: result,
    matches,
    debtors,
    pendingConfirmation,
    totalOutstandingGames: result.reduce((n,p) => n + p.outstanding, 0),
    totalPaymentDueGames: result.reduce((n,p) => n + p.paymentDue, 0),
    totalOutstandingAmount: result.reduce((n,p) => n + p.amountDue, 0),
    totalClaimsPaid: result.reduce((n,p) => n + p.claimsPaid, 0),
    totalNotPaid: result.reduce((n,p) => n + p.notPaid, 0)
  };
}

function setSubsStatus(pin, matchId, playerName, status) {
  assertPin_(pin);
  matchId = String(matchId || '').trim();
  playerName = String(playerName || '').trim();
  status = String(status || '').trim();

  if (!matchId || !playerName) throw new Error('Match and player are required.');
  if (!['Confirmed Paid','Not Paid','N/A','Claims Paid',''].includes(status)) {
    throw new Error('Invalid subs status.');
  }

  ensureSubsRow_(matchId);
  ensureSubsPlayerColumn_(playerName);

  const sh = getSS_().getSheetByName(SHEETS.SUBS);
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const col = headers.findIndex(h => normaliseName_(h) === normaliseName_(playerName)) + 1;
  if (!col) throw new Error('Player column not found.');

  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow()-1,1), 1).getValues().flat().map(String);
  const idx = ids.indexOf(matchId);
  if (idx < 0) throw new Error('Subs row not found.');
  const row = idx + 2;

  if (status === 'Confirmed Paid') {
    sh.getRange(row, col).setValue('Paid');
    setSubsConfirmation_(matchId, playerName, true);
  } else if (status === 'Claims Paid') {
    sh.getRange(row, col).setValue('Paid');
    setSubsConfirmation_(matchId, playerName, false);
  } else {
    sh.getRange(row, col).setValue(status);
    setSubsConfirmation_(matchId, playerName, false);
  }

  return getSubsTrackerData(pin);
}

function getPlayerSubs_(playerName) {
  const matrix = getSubsMatrix_();
  const confirmSet = getSubsConfirmSet_();
  const realMatches = getMatches_(true)
    .filter(m => m.status === 'Completed' && String(m.source || '') !== 'Trial');
  const playedByPlayer = getPlayedMatchIdsByPlayer_();
  const played = playedByPlayer[playerName] || new Set();
  const headerIdx = matrix.headers.findIndex(h => normaliseName_(h) === normaliseName_(playerName));
  const rowByMatch = {};
  matrix.rows.forEach(r => rowByMatch[String(r[0] || '')] = r);

  const matches = [];
  realMatches.forEach(m => {
    const matchId = String(m.matchId);
    if (!played.has(matchId)) return;

    const r = rowByMatch[matchId] || [];
    const rawStatus = headerIdx >= 0 ? String(r[headerIdx] || '').trim() : '';
    let link = String(r[4] || '').trim();
    if (!link) {
      try { link = getSubsPayment_(matchId).link || ''; } catch (e) {}
    }
    const confirmed = isSubsConfirmed_(matchId, playerName, confirmSet);
    matches.push({
      matchId,
      date: m.date,
      match: matchLabel_(m),
      rawStatus,
      status: subsDisplayStatus_(rawStatus, confirmed),
      confirmed,
      paymentLink: link
    });
  });

  matches.sort((a,b) => String(b.date).localeCompare(String(a.date)));

  // Player should only be asked to pay for games that are genuinely unpaid:
  // Not Paid or no response yet. "Claims Paid" is awaiting management check,
  // so we do not ask them to pay that amount again.
  const unpaidMatches = matches.filter(x =>
    x.status === 'Not Paid' || x.status === 'Unconfirmed'
  );

  const amountDue = unpaidMatches.length * 3;
  const paymentIdentifier = String(playerName || '')
    .replace(/[^A-Za-z0-9]/g, '') + 'Subs';

  const totalPaymentLink = amountDue > 0
    ? 'https://monzo.me/adamturner4/' + amountDue.toFixed(2) +
      '?h=CmJ3lb&d=' + encodeURIComponent(paymentIdentifier) +
      '&account_type=personal'
    : '';

  return {
    owed: unpaidMatches.length,
    amountDue,
    totalPaymentLink,
    unpaidMatches,
    awaitingConfirmation: matches.filter(x => x.status === 'Claims Paid').length,
    notPaid: matches.filter(x => x.status === 'Not Paid').length,
    unconfirmed: matches.filter(x => x.status === 'Unconfirmed').length,
    matches
  };
}


function getPlayerPinAdminData(pin) {
  assertPin_(pin);
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh) throw new Error('Players sheet is missing.');

  const chosenCol = ensurePlayerPinChosenColumn_();
  return sh.getDataRange().getValues().slice(1)
    .map(r => ({
      name: String(r[0] || '').trim(),
      active: bool_(r[1]),
      pinChosen: bool_(r[chosenCol - 1])
    }))
    .filter(p => p.name)
    .sort((a,b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function resetPlayerPin(pin, playerName, temporaryPin) {
  assertPin_(pin);

  playerName = String(playerName || '').trim();
  temporaryPin = String(temporaryPin || '').trim();

  if (!playerName) throw new Error('Select a player.');
  if (!/^\d{4}$/.test(temporaryPin)) {
    throw new Error('Temporary PIN must be exactly 4 digits.');
  }

  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh) throw new Error('Players sheet is missing.');

  const chosenCol = ensurePlayerPinChosenColumn_();
  const names = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1)
    .getValues().flat().map(v => String(v || '').trim());
  const idx = names.indexOf(playerName);
  if (idx < 0) throw new Error('Player not found.');

  const row = idx + 2;
  sh.getRange(row, 8).setValue(temporaryPin);
  sh.getRange(row, chosenCol).setValue(false);

  // Revoke any existing portal sessions for this player so the reset takes effect immediately.
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (!key.startsWith(PLAYER_SESSION_PREFIX)) return;
    try {
      const obj = JSON.parse(all[key]);
      if (String(obj.playerName || '') === playerName) props.deleteProperty(key);
    } catch (e) {}
  });

  return {
    ok: true,
    playerName,
    pinChosen: false
  };
}

/* =========================
   PLAYER PORTAL
   ========================= */

const PLAYER_SESSION_HOURS = 24 * 30;
const PLAYER_SESSION_PREFIX = 'PLAYER_SESSION_';

function getPortalPlayers() {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh) throw new Error('Players sheet is missing.');
  const chosenCol = ensurePlayerPinChosenColumn_();
  const rows = sh.getDataRange().getValues().slice(1);
  return rows
    .filter(r => String(r[0] || '').trim() && bool_(r[1]))
    .map(r => ({
      name: String(r[0] || '').trim(),
      alias: String(r[6] || ''),
      pinChosen: bool_(r[chosenCol - 1])
    }))
    .sort((a,b) => a.name.localeCompare(b.name));
}


function ensurePlayerPinChosenColumn_() {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh) throw new Error('Players sheet is missing.');

  const lastCol = Math.max(sh.getLastColumn(), 9);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(v => String(v || '').trim());

  let col = headers.findIndex(h => h === 'PIN Chosen') + 1;
  if (!col) {
    col = 9; // I
    sh.getRange(1, col).setValue('PIN Chosen');
  }
  return col;
}

function ensurePlayerDobColumn_() {
  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh) throw new Error('Players sheet is missing.');
  const lastCol = Math.max(sh.getLastColumn(), 10);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(v => String(v || '').trim());
  let col = headers.findIndex(h => h === 'Date of Birth') + 1;
  if (!col) {
    col = 10;
    sh.getRange(1, col).setValue('Date of Birth');
    sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('dd/mm/yyyy');
  }
  return col;
}

function normalisePlayerDob_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Europe/London', 'yyyy-MM-dd');
  }
  const s = String(value || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0');
  return '';
}

function formatPlayerDob_(value) {
  return normalisePlayerDob_(value);
}

function setPlayerDob_(sh, row, value) {
  const col = ensurePlayerDobColumn_();
  const dob = normalisePlayerDob_(value);
  if (!dob) {
    sh.getRange(row, col).clearContent();
    return;
  }
  const d = new Date(dob + 'T12:00:00');
  sh.getRange(row, col).setValue(d).setNumberFormat('dd/mm/yyyy');
}

function createPlayerSetupSession(playerName, dateOfBirth) {
  playerName = String(playerName || '').trim();
  const suppliedDob = normalisePlayerDob_(dateOfBirth);
  if (!playerName || !suppliedDob) throw new Error('Select your name and enter your date of birth.');

  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  if (!sh) throw new Error('Players sheet is missing.');
  const chosenCol = ensurePlayerPinChosenColumn_();
  const dobCol = ensurePlayerDobColumn_();
  const rows = sh.getDataRange().getValues().slice(1);
  const idx = rows.findIndex(r => String(r[0] || '').trim() === playerName && bool_(r[1]));
  if (idx < 0) throw new Error('Player not found.');

  const row = rows[idx];
  if (bool_(row[chosenCol - 1])) {
    throw new Error('You already have a PIN. Use the normal login above, or ask management to reset it.');
  }

  const savedDob = normalisePlayerDob_(row[dobCol - 1]);
  if (!savedDob) {
    throw new Error('Your date of birth has not been added yet. Ask management to update your player record.');
  }
  if (savedDob !== suppliedDob) {
    throw new Error('That date of birth does not match our records.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  const expiresAt = Date.now() + PLAYER_SESSION_HOURS * 60 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty(
    PLAYER_SESSION_PREFIX + token,
    JSON.stringify({ playerName, expiresAt })
  );

  return { token, playerName, expiresAt, pinChosen: false, mustChoosePin: true };
}

function createPlayerSession(playerName, pin) {
  playerName = String(playerName || '').trim();
  pin = String(pin || '').trim();

  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  const chosenCol = ensurePlayerPinChosenColumn_();
  const rows = sh.getDataRange().getValues().slice(1);

  const idx = rows.findIndex(r =>
    String(r[0] || '').trim() === playerName &&
    bool_(r[1])
  );

  const row = idx >= 0 ? rows[idx] : null;

  if (!row || String(row[7] || '').trim() !== pin) {
    throw new Error('Player name or PIN is incorrect.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  const expiresAt = Date.now() + PLAYER_SESSION_HOURS * 60 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty(
    PLAYER_SESSION_PREFIX + token,
    JSON.stringify({ playerName, expiresAt })
  );

  const pinChosen = bool_(row[chosenCol - 1]);

  return {
    token,
    playerName,
    expiresAt,
    pinChosen,
    mustChoosePin: !pinChosen
  };
}
function getPlayerSession_(token) {
  token = String(token || '').trim();
  if (!token) return null;

  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(PLAYER_SESSION_PREFIX + token);
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw);
    if (!obj.playerName || Number(obj.expiresAt || 0) < Date.now()) {
      props.deleteProperty(PLAYER_SESSION_PREFIX + token);
      return null;
    }
    return obj;
  } catch (e) {
    props.deleteProperty(PLAYER_SESSION_PREFIX + token);
    return null;
  }
}

function verifyPlayerSession(token) {
  const s = getPlayerSession_(token);
  return s ? { ok: true, playerName: s.playerName, expiresAt: s.expiresAt } : { ok: false };
}

function logoutPlayerSession(token) {
  PropertiesService.getScriptProperties().deleteProperty(PLAYER_SESSION_PREFIX + String(token || ''));
  return true;
}


function choosePlayerPin(token, newPin) {
  const session = getPlayerSession_(token);
  if (!session) throw new Error('Your player session has expired. Please log in again.');

  newPin = String(newPin || '').trim();
  if (!/^\d{4}$/.test(newPin)) {
    throw new Error('Choose a 4-digit PIN.');
  }

  const sh = getSS_().getSheetByName(SHEETS.PLAYERS);
  const chosenCol = ensurePlayerPinChosenColumn_();
  const names = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1)
    .getValues().flat().map(v => String(v || '').trim());

  const idx = names.indexOf(session.playerName);
  if (idx < 0) throw new Error('Player not found.');

  const row = idx + 2;
  sh.getRange(row, 8).setValue(newPin);
  sh.getRange(row, chosenCol).setValue(true);

  return { ok: true, playerName: session.playerName };
}

function getPlayerPortalData(token) {
  const session = getPlayerSession_(token);
  if (!session) throw new Error('Your player session has expired. Please log in again.');
  return buildPlayerPortalData_(session.playerName, false);
}

const GHOST_SESSION_HOURS = 2;
const GHOST_SESSION_PREFIX = 'GHOST_PLAYER_SESSION_';
const GHOST_PORTAL_CACHE_PREFIX = 'GHOST_PORTAL_DATA_';

function createGhostPlayerSession(pin, playerName) {
  assertPin_(pin);

  playerName = String(playerName || '').trim();
  const player = getPlayers_().find(p => p.name === playerName && p.active !== false);
  if (!player) throw new Error('Select an active player.');

  const token = Utilities.getUuid() + Utilities.getUuid();
  const expiresAt = Date.now() + GHOST_SESSION_HOURS * 60 * 60 * 1000;

  PropertiesService.getScriptProperties().setProperty(
    GHOST_SESSION_PREFIX + token,
    JSON.stringify({ playerName, expiresAt })
  );

  // Build the portal while management is on the "Preparing Ghost Mode" screen.
  // The next page can then render from cache instead of reopening all of the
  // current + historic sheets again.
  try {
    const data = buildPlayerPortalData_(playerName, true);
    const json = JSON.stringify(data);
    if (json.length < 95000) {
      CacheService.getScriptCache().put(
        GHOST_PORTAL_CACHE_PREFIX + token,
        json,
        600
      );
    }
  } catch (e) {
    // Do not block Ghost Mode if caching fails. The portal can still build
    // normally on the next page.
  }

  return { token, playerName, expiresAt };
}

function getGhostPlayerSession_(token) {
  token = String(token || '').trim();
  if (!token) return null;

  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(GHOST_SESSION_PREFIX + token);
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw);
    if (!obj.playerName || Number(obj.expiresAt || 0) < Date.now()) {
      props.deleteProperty(GHOST_SESSION_PREFIX + token);
      return null;
    }
    return obj;
  } catch (e) {
    props.deleteProperty(GHOST_SESSION_PREFIX + token);
    return null;
  }
}

function getGhostPlayerPortalData(token) {
  const session = getGhostPlayerSession_(token);
  if (!session) throw new Error('Ghost Mode has expired. Return to the management console and open it again.');

  const cache = CacheService.getScriptCache();
  const cacheKey = GHOST_PORTAL_CACHE_PREFIX + String(token || '');
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  const data = buildPlayerPortalData_(session.playerName, true);
  try {
    const json = JSON.stringify(data);
    if (json.length < 95000) cache.put(cacheKey, json, 600);
  } catch (e) {}
  return data;
}


function getGhostPlayerPortalDataDirect(adminToken, playerName) {
  assertPin_(adminToken);

  playerName = String(playerName || '').trim();
  const player = getPlayers_().find(p => p.name === playerName && p.active !== false);
  if (!player) throw new Error('Select an active player.');

  return buildPlayerPortalData_(playerName, true);
}


const HISTORIC_GAME_DATA_ID = '1BR_Xy0ehyFeHBLgJbKMNOYrja4bVuoRbDmi9RW8iRYA';

function historicalNameKey_(name) {
  return String(name || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


function historicalMatchKey_(label) {
  let s = String(label || '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .trim();

  let venue = '';
  const venueMatches = [...s.matchAll(/\((h|a|n)\)/g)];
  if (venueMatches.length) venue = venueMatches[venueMatches.length - 1][1];

  s = s
    .replace(/\((h|a|n)\)/g, ' ')
    .replace(/\([^)]*(ge cup|gec|jnr cup|junior cup|jc)[^)]*\)/g, ' ')
    .replace(/\b(ge cup|gec|jnr cup|junior cup|jc)\b/g, ' ')
    .replace(/\b(first|second|third|1st|2nd|2nds|3rd|3rds)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return venue + '|' + s;
}

function getHistoricalPlayerSameStageStats_(playerName, gameCount) {
  gameCount = Math.max(0, Number(gameCount || 0));
  if (!gameCount) return null;

  try {
    const ss = SpreadsheetApp.openById(HISTORIC_GAME_DATA_ID);
    const eventsSh = ss.getSheetByName('Sheet1');
    const minsSh = ss.getSheetByName('Players Minutes');
    const historicDashboard = getHistoricalDashboardData_();

    if (!eventsSh || !minsSh || !historicDashboard) return null;

    const targetMatches = (historicDashboard.matches || []).slice(0, gameCount);
    if (!targetMatches.length) return null;

    const targetKeys = new Set(targetMatches.map(m => historicalMatchKey_(m.opponent)));

    const minuteData = minsSh.getDataRange().getValues();
    if (!minuteData.length) return null;

    const headers = minuteData[0];
    const wantedName = historicalNameKey_(playerName) === 'gav counter'
      ? 'gavin counter'
      : historicalNameKey_(playerName);

    const playerRow = minuteData.slice(1).find(r =>
      historicalNameKey_(r[0]) === wantedName
    ) || [];

    const minuteColsByKey = {};
    headers.forEach((h, idx) => {
      if (idx < 15 || !h) return;
      const key = historicalMatchKey_(h);
      if (key && !minuteColsByKey[key]) minuteColsByKey[key] = idx;
    });

    let appearances = 0;
    let minutes = 0;
    let full90s = 0;
    const appearedByKey = {};

    targetMatches.forEach(m => {
      const key = historicalMatchKey_(m.opponent);
      const col = minuteColsByKey[key];
      if (col == null) return;

      const raw = playerRow[col];
      const mins = Number(raw);
      if (Number.isFinite(mins) && mins > 0) {
        appearances++;
        minutes += mins;
        if (mins >= 90) full90s++;
        appearedByKey[key] = true;
      }
    });

    const eventRows = eventsSh.getRange(2, 1, Math.max(eventsSh.getLastRow() - 1, 1), 12).getValues();
    let goals = 0;
    let assists = 0;

    eventRows.forEach(r => {
      const matchKey = historicalMatchKey_(r[1]);
      if (!targetKeys.has(matchKey)) return;

      const type = String(r[3] || '').trim();
      if (type !== 'Goal') return;

      const scorer = historicalNameKey_(r[4]);
      const assister = historicalNameKey_(r[5]);

      if (scorer === wantedName) {
        goals++;
        if (!appearedByKey[matchKey]) {
          appearances++;
          appearedByKey[matchKey] = true;
        }
      }
      if (assister === wantedName) {
        assists++;
        if (!appearedByKey[matchKey]) {
          appearances++;
          appearedByKey[matchKey] = true;
        }
      }
    });

    const cleanSheets = targetMatches.filter(m => {
      const key = historicalMatchKey_(m.opponent);
      return appearedByKey[key] && Number(m.oppScore || 0) === 0;
    }).length;

    return {
      season: '2025/26',
      gamesCompared: targetMatches.length,
      appearances,
      minutes,
      goals,
      assists,
      goalContributions: goals + assists,
      full90s,
      cleanSheets
    };
  } catch (e) {
    return null;
  }
}


function getHistoricalPlayerCleanSheets_(playerName) {
  try {
    const ss = SpreadsheetApp.openById(HISTORIC_GAME_DATA_ID);
    const minsSh = ss.getSheetByName('Players Minutes');
    const historicDashboard = getHistoricalDashboardData_();
    if (!minsSh || !historicDashboard) return 0;

    const data = minsSh.getDataRange().getValues();
    if (!data.length) return 0;

    const headers = data[0];
    const wantedName = historicalNameKey_(playerName) === 'gav counter'
      ? 'gavin counter'
      : historicalNameKey_(playerName);

    const playerRow = data.slice(1).find(r =>
      historicalNameKey_(r[0]) === wantedName
    ) || [];

    const minuteColsByKey = {};
    headers.forEach((h, idx) => {
      if (idx < 15 || !h) return;
      const key = historicalMatchKey_(h);
      if (key && !minuteColsByKey[key]) minuteColsByKey[key] = idx;
    });

    return (historicDashboard.matches || []).filter(m => {
      const key = historicalMatchKey_(m.opponent);
      const col = minuteColsByKey[key];
      if (col == null) return false;
      const mins = Number(playerRow[col]);
      return Number.isFinite(mins) && mins > 0 && Number(m.oppScore || 0) === 0;
    }).length;
  } catch (e) {
    return 0;
  }
}

function getHistoricalSeasonStats_(playerName) {
  const aliases = {
    'gav counter': 'gavin counter'
  };

  const wanted = aliases[historicalNameKey_(playerName)] || historicalNameKey_(playerName);

  try {
    const ss = SpreadsheetApp.openById(HISTORIC_GAME_DATA_ID);
    const sh = ss.getSheetByName('Players Minutes');
    if (!sh || sh.getLastRow() < 2) return null;

    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 15).getValues();
    const row = rows.find(r => {
      const key = historicalNameKey_(r[0]);
      return key && key === wanted;
    });

    if (!row) return null;

    const appearances = Number(row[13] || 0);
    const minutes = Number(row[10] || 0);
    const goals = Number(row[1] || 0);
    const assists = Number(row[3] || 0);
    const full90s = Number(row[12] || 0);

    // Only expose the historic season when this player genuinely has data.
    if (!appearances && !minutes && !goals && !assists && !full90s) return null;

    return {
      season: '2025/26',
      appearances,
      minutes,
      goals,
      assists,
      goalContributions: goals + assists,
      full90s
    };
  } catch (e) {
    return null;
  }
}


function parseHistoricDate_(value) {
  if (value instanceof Date) return value;
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return new Date(0);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  return new Date(y, Number(m[2]) - 1, Number(m[1]));
}

function getHistoricalTeamData_() {
  try {
    const ss = SpreadsheetApp.openById(HISTORIC_GAME_DATA_ID);
    const sh = ss.getSheetByName('Sheet1');
    if (!sh || sh.getLastRow() < 2) return null;

    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
    const byMatch = {};
    const goals = {};
    const assists = {};

    rows.forEach(r => {
      const date = r[0];
      const match = String(r[1] || '').trim();
      const eventType = String(r[3] || '').trim();
      const player = String(r[4] || '').trim();
      const assist = String(r[5] || '').trim();
      const competition = String(r[11] || '').trim();

      if (!match) return;

      const key = String(date) + '|' + match;
      if (!byMatch[key]) {
        const displayDate = date instanceof Date
          ? Utilities.formatDate(date, 'Europe/London', 'dd/MM/yyyy')
          : String(date || '');

        byMatch[key] = {
          date: displayDate,
          sortDate: parseHistoricDate_(displayDate).getTime(),
          opponent: match,
          competition,
          ourScore: 0,
          oppScore: 0
        };
      }

      if (eventType === 'Goal') {
        byMatch[key].ourScore++;
        if (player && historicalNameKey_(player) !== 'own goal') {
          goals[player] = (goals[player] || 0) + 1;
        }
        if (assist) assists[assist] = (assists[assist] || 0) + 1;
      } else if (eventType === 'Conceded') {
        byMatch[key].oppScore++;
      }
    });

    const matches = Object.values(byMatch)
      .sort((a,b) => Number(a.sortDate || 0) - Number(b.sortDate || 0))
      .map(m => ({
        date: m.date,
        opponent: m.opponent,
        competition: m.competition,
        ourScore: m.ourScore,
        oppScore: m.oppScore
      }));

    if (!matches.length) return null;

    const top = obj => Object.entries(obj)
      .map(([player,total]) => ({ player, total }))
      .sort((a,b) => b.total - a.total || a.player.localeCompare(b.player))
      .slice(0,5);

    return {
      season: '2025/26',
      games: matches.length,
      goals: matches.reduce((n,m) => n + Number(m.ourScore || 0), 0),
      conceded: matches.reduce((n,m) => n + Number(m.oppScore || 0), 0),
      cleanSheets: matches.filter(m => Number(m.oppScore || 0) === 0).length,
      topScorers: top(goals),
      topAssists: top(assists),
      matches: matches.slice().reverse().slice(0,5)
    };
  } catch (e) {
    return null;
  }
}


function getHistoricalTeamSameStage_(gameCount) {
  gameCount = Math.max(0, Number(gameCount || 0));
  if (!gameCount) return null;

  const hist = getHistoricalDashboardData_();
  if (!hist || !(hist.matches || []).length) return null;

  const matches = hist.matches.slice(0, gameCount);
  const goals = {};
  const assists = {};

  matches.forEach(m => {
    (m.events || []).forEach(e => {
      if (e.type === 'Goal' && String(e.team || '').toLowerCase() !== 'opposition') {
        if (e.player) goals[e.player] = (goals[e.player] || 0) + 1;
        if (e.secondaryPlayer) assists[e.secondaryPlayer] = (assists[e.secondaryPlayer] || 0) + 1;
      }
    });
  });

  const top = obj => Object.entries(obj)
    .map(([player,total]) => ({ player,total }))
    .sort((a,b) => b.total-a.total || a.player.localeCompare(b.player))
    .slice(0,5);

  return {
    season: '2025/26',
    games: matches.length,
    goals: matches.reduce((n,m) => n + Number(m.ourScore || 0), 0),
    conceded: matches.reduce((n,m) => n + Number(m.oppScore || 0), 0),
    cleanSheets: matches.filter(m => Number(m.oppScore || 0) === 0).length,
    topScorers: top(goals),
    topAssists: top(assists),
    matches: matches.slice().reverse().slice(0,5)
  };
}

function buildPlayerPortalData_(playerName, ghostMode) {
  const historicalSeason = getHistoricalSeasonStats_(playerName);
  const historicalTeam = getHistoricalTeamData_();
  const realMatches = getMatches_(true);
  const realMatchIds = new Set(realMatches.map(m => String(m.matchId)));

  const pmSh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  const pmRows = pmSh.getDataRange().getValues().slice(1)
    .filter(r =>
      String(r[1] || '').trim() === playerName &&
      realMatchIds.has(String(r[0] || ''))
    );

  const my = {
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellow: 0,
    red: 0,
    cleanSheets: 0
  };

  pmRows.forEach(r => {
    const mins = Number(r[8] || 0);
    const starter = bool_(r[3]);
    const knownUsedSub = String(r[13] || '').toLowerCase().includes('used sub');
    if (starter || mins > 0 || knownUsedSub) my.appearances++;
    if (starter) my.starts++;
    my.minutes += mins;
    my.goals += Number(r[9] || 0);
    my.assists += Number(r[10] || 0);
    my.yellow += Number(r[11] || 0);
    my.red += Number(r[12] || 0);
  });

  const dashboard = getPublicDashboardData();

  if (historicalSeason) {
    historicalSeason.sameStage = getHistoricalPlayerSameStageStats_(
      playerName,
      dashboard.matches.length
    );
  }

  if (historicalTeam) {
    historicalTeam.sameStage = getHistoricalTeamSameStage_(dashboard.matches.length);
  }

  const playerFriendlyMatches = dashboard.matches.map(m => ({
    matchId: m.matchId,
    date: m.date,
    opponent: m.opponent,
    venue: m.venue,
    competition: m.competition,
    ourScore: m.ourScore,
    oppScore: m.oppScore
  }));

  const goalTotals = {};
  const assistTotals = {};
  dashboard.matches.forEach(m => {
    (m.events || []).forEach(e => {
      if (e.type === 'Goal' && String(e.team || '').toLowerCase() !== 'opposition') {
        if (e.player) goalTotals[e.player] = (goalTotals[e.player] || 0) + 1;
        if (e.secondaryPlayer) assistTotals[e.secondaryPlayer] = (assistTotals[e.secondaryPlayer] || 0) + 1;
      }
    });
  });

  const top = obj => Object.entries(obj)
    .map(([player,total]) => ({ player,total }))
    .sort((a,b) => b.total-a.total || a.player.localeCompare(b.player))
    .slice(0,5);

  const vote = getPublicVotingData();
  const votesSh = getSS_().getSheetByName(SHEETS.VOTES);
  const voteRows = votesSh.getDataRange().getValues().slice(1);
  const alreadyVoted = vote.matchId ? voteRows.some(r =>
    String(r[1] || '') === String(vote.matchId) &&
    normaliseName_(r[8]) === normaliseName_(playerName)
  ) : false;

  const playersSh = getSS_().getSheetByName(SHEETS.PLAYERS);
  const chosenCol = ensurePlayerPinChosenColumn_();
  const playerRows = playersSh.getDataRange().getValues().slice(1);
  const playerRow = playerRows.find(r => String(r[0] || '').trim() === playerName) || [];
  const pinChosen = bool_(playerRow[chosenCol - 1]);

  // A clean sheet belongs to every player who actually appeared in that match,
  // not just the goalkeeper.
  const appearedMatchIds = new Set(
    pmRows
      .filter(r => {
        const mins = Number(r[8] || 0);
        const starter = bool_(r[3]);
        const knownUsedSub = String(r[13] || '').toLowerCase().includes('used sub');
        return starter || mins > 0 || knownUsedSub;
      })
      .map(r => String(r[0] || ''))
  );

  my.cleanSheets = dashboard.matches.filter(m =>
    appearedMatchIds.has(String(m.matchId)) &&
    Number(m.oppScore || 0) === 0
  ).length;

  if (historicalSeason) {
    historicalSeason.cleanSheets = getHistoricalPlayerCleanSheets_(playerName);
    if (historicalSeason.sameStage && historicalSeason.sameStage.cleanSheets == null) {
      historicalSeason.sameStage.cleanSheets = 0;
    }
  }

  return {
    playerName,
    ghostMode: !!ghostMode,
    pinChosen,
    badgeUrl: String(getSettings_()['Voting Badge URL'] || ''),
    season: String(getSettings_()['Season'] || '2026/27'),
    historicalSeason,
    historicalTeam,
    my,
    team: {
      games: dashboard.matches.length,
      goals: dashboard.matches.reduce((a,m) => a + Number(m.ourScore || 0), 0),
      conceded: dashboard.matches.reduce((a,m) => a + Number(m.oppScore || 0), 0),
      cleanSheets: dashboard.matches.filter(m => Number(m.oppScore || 0) === 0).length,
      topScorers: top(goalTotals),
      topAssists: top(assistTotals),
      matches: playerFriendlyMatches.slice().reverse().slice(0,5)
    },
    voting: {
      open: vote.open,
      matchId: vote.matchId,
      matchName: vote.matchName,
      players: vote.players,
      paymentIdentifier: vote.paymentIdentifier,
      paymentLink: vote.paymentLink,
      alreadyVoted
    },
    subs: getPlayerSubs_(playerName)
  };
}

function submitPortalVote(token, vote) {
  const session = getPlayerSession_(token);
  if (!session) throw new Error('Your player session has expired. Please log in again.');

  vote = Object.assign({}, vote || {});
  vote.name = session.playerName;
  return submitVote(vote);
}

/* =========================
   VOTING
   ========================= */

function getVotingAdminData(pin) {
  assertPin_(pin);
  const s = getSettings_();
  const openMatchId = String(s['Voting Open Match ID'] || '');
  return {
    votingOpen: bool_(s['Voting Open']),
    openMatchId,
    matchName: String(s['Voting Match Name'] || ''),
    badgeUrl: String(s['Voting Badge URL'] || ''),
    votingUrl: 'https://PerranporthAFCMens.github.io/Perranporth/vote.html',
    matches: getMatches_(true),
    players: getPlayers_()
  };
}

function openVoting(pin, matchId) {
  assertPin_(pin);
  const mr = getMatchRow_(matchId);
  const m = rowToMatch_(mr.values);
  setSetting_('Voting Open Match ID', matchId);
  setSetting_('Voting Match Name', matchLabel_(m));
  ensureSubsRow_(matchId);
  setSetting_('Voting Open', true);
  return getVotingAdminData(pin);
}

function closeVoting(pin) {
  assertPin_(pin);
  setSetting_('Voting Open', false);
  return getVotingAdminData(pin);
}

function getPublicVotingData() {
  const s = getSettings_();
  const open = bool_(s['Voting Open']);
  const matchId = String(s['Voting Open Match ID'] || '');
  let matchName = String(s['Voting Match Name'] || '');
  if (matchId) {
    try {
      matchName = matchLabel_(rowToMatch_(getMatchRow_(matchId).values));
    } catch (err) {}
  }
  const players = getPlayers_().map(p => p.name);

  const payment = matchId ? getSubsPayment_(matchId) : { identifier: '', link: '' };

  return {
    open,
    matchId,
    matchName,
    badgeUrl: String(s['Voting Badge URL'] || ''),
    players: [...new Set(players)],
    paymentIdentifier: payment.identifier || '',
    paymentLink: payment.link || ''
  };
}

function submitVote(vote) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const s = getSettings_();
    if (!bool_(s['Voting Open'])) throw new Error('Voting is currently closed.');

    const matchId = String(s['Voting Open Match ID'] || '');
    if (!matchId) throw new Error('No voting match is selected.');

    const m = rowToMatch_(getMatchRow_(matchId).values);
    const matchName = matchLabel_(m);
    const allowed = getPublicVotingData().players;

    ['three','two','one','dick','reason','name','subs'].forEach(k => {
      if (!String(vote[k] || '').trim()) throw new Error('Please complete all required fields.');
    });

    if ([vote.three, vote.two, vote.one, vote.dick].some(p => String(p).trim().toUpperCase() === 'N/A')) {
      throw new Error('You must select a player for every voting category.');
    }

    if (new Set([vote.three, vote.two, vote.one]).size !== 3) {
      throw new Error('Your 3, 2 and 1 point selections must be three different players.');
    }

    [vote.three, vote.two, vote.one, vote.dick].forEach(p => {
      if (!allowed.includes(p)) throw new Error('Invalid player selection.');
    });

    const voterName = String(vote.name).trim();
    const voterKey = normaliseName_(voterName);
    const sh = getSS_().getSheetByName(SHEETS.VOTES);
    const rows = sh.getDataRange().getValues();
    let existingRow = 0;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1] || '') !== matchId) continue;
      if (normaliseName_(rows[i][8]) === voterKey) {
        existingRow = i + 1;
        break;
      }
    }

    const rowValues = [[
      new Date(), matchId, matchName,
      vote.three, vote.two, vote.one,
      vote.dick, String(vote.reason).trim(),
      voterName, vote.subs, 'Combined web app'
    ]];

    if (existingRow) {
      sh.getRange(existingRow, 1, 1, 11).setValues(rowValues);
    } else {
      sh.appendRow(rowValues[0]);
    }

    recordSubsResponse_(matchId, voterName, vote.subs);
    return {ok:true, match:matchName, updated:!!existingRow};
  } finally {
    lock.releaseLock();
  }
}

function getVotingSnapshot(pin, matchId) {
  assertPin_(pin);
  const votesSh = getSS_().getSheetByName(SHEETS.VOTES);
  const rows = votesSh.getDataRange().getValues().slice(1);

  const targetMatch = rowToMatch_(getMatchRow_(matchId).values);
  const targetName = matchLabel_(targetMatch);
  const matching = rows.filter(r =>
    String(r[1] || '') === String(matchId) ||
    (!String(r[1] || '') && normaliseName_(r[2]) === normaliseName_(targetName))
  );

  const points = {};
  const counts = {};
  const dotd = {};
  const reasons = {};
  const voters = [];

  function addPts(name, pts) {
    name = String(name || '').trim();
    if (!name) return;
    points[name] = (points[name] || 0) + pts;
    if (!counts[name]) counts[name] = {three:0,two:0,one:0};
    if (pts === 3) counts[name].three++;
    if (pts === 2) counts[name].two++;
    if (pts === 1) counts[name].one++;
  }

  matching.forEach(r => {
    addPts(r[3], 3);
    addPts(r[4], 2);
    addPts(r[5], 1);
    const d = String(r[6] || '').trim();
    if (d && d !== 'N/A') {
      dotd[d] = (dotd[d] || 0) + 1;
      const reason = String(r[7] || '').trim();
      if (reason) {
        if (!reasons[d]) reasons[d] = [];
        reasons[d].push(reason);
      }
    }
    const voter = String(r[8] || '').trim();
    if (voter) voters.push(voter);
  });

  const ranked = Object.entries(points)
    .map(([player, score]) => ({
      player,
      score,
      three: (counts[player] || {}).three || 0,
      two: (counts[player] || {}).two || 0,
      one: (counts[player] || {}).one || 0
    }))
    .sort((a,b) =>
      b.score - a.score ||
      b.three - a.three ||
      b.two - a.two ||
      b.one - a.one ||
      a.player.localeCompare(b.player)
    );

  let previous = null;
  ranked.forEach((x, i) => {
    const sameAsPrevious = previous &&
      x.score === previous.score &&
      x.three === previous.three &&
      x.two === previous.two &&
      x.one === previous.one;
    x.rank = sameAsPrevious ? previous.rank : i + 1;
    x.joint = sameAsPrevious || (i + 1 < ranked.length &&
      ranked[i + 1].score === x.score &&
      ranked[i + 1].three === x.three &&
      ranked[i + 1].two === x.two &&
      ranked[i + 1].one === x.one);
    previous = x;
  });

  const top3 = ranked.filter(x => x.rank <= 3);

  const dotdRows = Object.entries(dotd)
    .map(([player, votes]) => ({player, votes, reasons: reasons[player] || []}))
    .sort((a,b) => b.votes - a.votes || a.player.localeCompare(b.player));

  const maxDotd = dotdRows.length ? dotdRows[0].votes : 0;
  const shownDotd = dotdRows.filter(x => x.votes >= Math.max(1, maxDotd - 2));

  const players = getPlayers_();
  const votedCanonical = new Set();
  const aliasMap = {};
  players.forEach(p => {
    aliasMap[normaliseName_(p.name)] = p.name;
    if (p.alias) aliasMap[normaliseName_(p.alias)] = p.name;
  });

  voters.forEach(v => {
    const key = normaliseName_(v);
    if (aliasMap[key]) votedCanonical.add(aliasMap[key]);
  });

  const stillToVote = players.map(p => p.name).filter(name => !votedCanonical.has(name));

  return {
    matchId,
    matchName: targetName,
    ballots: matching.length,
    top3,
    dotd: shownDotd,
    dotdValidVotes: Object.values(dotd).reduce((a,b) => a+b, 0),
    voters,
    stillToVote
  };
}


/* =========================
   PUBLIC SEASON DASHBOARD
   ========================= */

function dashboardMinute_(minuteValue) {
  const p = storedMinuteParts_(minuteValue);
  if (p.stoppage && p.base === 45) return 45 + p.added;
  if (p.stoppage && p.base === 90) return 90 + p.added;
  return p.base;
}


function getHistoricalDashboardData_() {
  try {
    const ss = SpreadsheetApp.openById(HISTORIC_GAME_DATA_ID);
    const sh = ss.getSheetByName('Sheet1');
    if (!sh || sh.getLastRow() < 2) return null;

    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
    const byMatch = {};

    rows.forEach((r, idx) => {
      const rawDate = r[0];
      const matchLabel = String(r[1] || '').trim();
      if (!matchLabel) return;

      const eventTypeRaw = String(r[3] || '').trim();
      const competition = String(r[11] || 'Other').trim() || 'Other';

      const venueMatch = matchLabel.match(/\((H|A|N)\)\s*$/i);
      const venueCode = venueMatch ? venueMatch[1].toUpperCase() : '';
      const venue = venueCode === 'H' ? 'Home' : venueCode === 'A' ? 'Away' : venueCode === 'N' ? 'Neutral' : '';

      const key = fmtDate_(rawDate) + '|' + matchLabel;
      if (!byMatch[key]) {
        byMatch[key] = {
          matchId: 'HIST-' + (Object.keys(byMatch).length + 1),
          date: fmtDate_(rawDate),
          opponent: matchLabel,
          venue,
          competition,
          events: []
        };
      }

      let type = eventTypeRaw;
      let team = 'Perranporth';

      if (eventTypeRaw === 'Conceded') {
        type = 'Conceded Goal';
        team = 'Opposition';
      } else if (eventTypeRaw === 'Goal') {
        type = 'Goal';
      } else {
        // The historic dashboard focuses on the same scoring-event data used
        // by the current dashboard. Subs / missed penalties are not needed.
        return;
      }

      const displayMinute = dashboardMinute_(r[2]);
      const minute = Number.isFinite(Number(displayMinute)) ? Number(displayMinute) : 0;

      let touches = null;
      if (type === 'Goal' && r[7] !== '' && r[7] != null) {
        const parsedTouches = Number(r[7]);
        touches = Number.isFinite(parsedTouches) ? parsedTouches : null;
      }

      byMatch[key].events.push({
        minute,
        displayMinute: minute,
        type,
        team,
        player: type === 'Goal' ? String(r[4] || '').trim() : '',
        secondaryPlayer: type === 'Goal' ? String(r[5] || '').trim() : '',
        goalType: type === 'Goal' ? String(r[6] || '').trim() : '',
        touches,
        goalZone: String(r[8] || '').trim(),
        assistZone: type === 'Goal' ? String(r[9] || '').trim() : ''
      });
    });

    const matches = Object.values(byMatch).map(m => {
      const score = calculateScore_(m.events.map(e => ({ type: e.type, team: e.team })));
      return Object.assign({}, m, {
        ourScore: Number(score.ours || 0),
        oppScore: Number(score.opp || 0)
      });
    });

    matches.sort((a,b) => {
      const da = a.date.split('/').reverse().join('-');
      const db = b.date.split('/').reverse().join('-');
      return da.localeCompare(db);
    });

    const currentSettings = getSettings_();
    return {
      teamName: String(currentSettings['Team Name'] || 'Perranporth AFC'),
      season: '2025/26',
      badgeUrl: String(currentSettings['Voting Badge URL'] || ''),
      matches,
      zones: [],
      generatedAt: Utilities.formatDate(new Date(), 'Europe/London', 'dd/MM/yyyy HH:mm')
    };
  } catch (e) {
    return null;
  }
}

function getHistoricalDashboardData() {
  const data = getHistoricalDashboardData_();
  if (!data) return null;

  // Force a plain JSON-safe object before it is sent through google.script.run.
  // This strips any Spreadsheet/App Script values that the browser transport
  // cannot serialise.
  return JSON.parse(JSON.stringify(data));
}

function getPublicDashboardBundle() {
  return {
    current: getPublicDashboardData(),
    historic: getHistoricalDashboardData_()
  };
}

function getPublicDashboardData() {
  const ss = getSS_();
  const settings = getSettings_();

  const matchesSh = ss.getSheetByName(SHEETS.MATCHES);
  const matchRows = matchesSh.getDataRange().getValues().slice(1);

  const eventsSh = ss.getSheetByName(SHEETS.EVENTS);
  const eventRows = eventsSh.getDataRange().getValues().slice(1);

  const eventsByMatch = {};
  eventRows.forEach(r => {
    const matchId = String(r[1] || '');
    if (!matchId) return;
    if (!eventsByMatch[matchId]) eventsByMatch[matchId] = [];
    eventsByMatch[matchId].push({
      minute: Number(r[2] || 0),
      displayMinute: dashboardMinute_(r[2]),
      type: String(r[3] || ''),
      team: String(r[4] || ''),
      player: String(r[5] || ''),
      secondaryPlayer: String(r[6] || ''),
      goalType: String(r[7] || ''),
      touches: r[8] === '' ? null : Number(r[8]),
      goalZone: String(r[9] || ''),
      assistZone: String(r[10] || '')
    });
  });

  const matches = [];
  matchRows.forEach(r => {
    const matchId = String(r[0] || '');
    const opponent = String(r[2] || '');
    const competition = String(r[4] || '');
    const source = String(r[13] || '');

    if (!matchId || String(r[6] || '') !== 'Completed') return;
    if (r.length >= 13 && !bool_(r[12])) return;
    if (source.toLowerCase() === 'trial') return;
    if (competition.toLowerCase() === 'trial') return;
    if (/\b(test|testing|trial|demo)\b/i.test(opponent)) return;

    const events = eventsByMatch[matchId] || [];

    // Dashboard rule: a match only appears once detailed event data exists.
    // This deliberately excludes old/pre-season completed fixtures that may
    // have a score or legacy player data but were not captured in this app.
    // As soon as we add Events rows for a match (e.g. Illogan), it will
    // automatically appear on the dashboard.
    if (!events.length) return;

    const score = calculateScore_(events.map(e => ({
      type: e.type,
      team: e.team
    })));
    const ours = score.ours;
    const opp = score.opp;

    matches.push({
      matchId,
      date: fmtDate_(r[1]),
      opponent: String(r[2] || ''),
      venue: String(r[3] || ''),
      competition: String(r[4] || 'Other'),
      ourScore: Number(ours || 0),
      oppScore: Number(opp || 0),
      events
    });
  });

  matches.sort((a,b) => {
    const da = a.date.split('/').reverse().join('-');
    const db = b.date.split('/').reverse().join('-');
    return da.localeCompare(db);
  });

  const zonesSh = ss.getSheetByName('Zones');
  const zones = zonesSh
    ? zonesSh.getDataRange().getValues().slice(1)
      .filter(r => String(r[0] || '').trim())
      .map(r => ({ zone: String(r[0] || ''), description: String(r[1] || '') }))
    : [];

  return {
    teamName: String(settings['Team Name'] || 'Perranporth AFC'),
    season: String(settings['Season'] || '2026/27'),
    badgeUrl: String(settings['Voting Badge URL'] || ''),
    matches,
    zones,
    generatedAt: Utilities.formatDate(new Date(), 'Europe/London', 'dd/MM/yyyy HH:mm')
  };
}
