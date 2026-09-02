'use strict';

const { GameRoom } = require('../server/game-room');
const { MODE_SEATS, normalizeWordLocale } = require('../server/matchmaker');
const {
  MatchApiError,
  assertSameOrigin,
  environment,
  identityForRequest,
  identityForSession,
  rpc,
  serviceRequest
} = require('./lib/match-service');

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { throw new MatchApiError('invalid_json', 400); }
}

function restFilter(value) {
  return encodeURIComponent(String(value));
}

async function ticketFor(playerId, env) {
  const rows = await serviceRequest(`/rest/v1/matchmaking_tickets?select=player_id,username,mode,word_locale,status,match_id,joined_at,updated_at&player_id=eq.${restFilter(playerId)}&limit=1`, {}, env);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function matchFor(matchId, env) {
  const rows = await serviceRequest(`/rest/v1/online_matches?select=id,mode,word_locale,players,state,turn_version,status,result,action_log,created_at,updated_at,finished_at&id=eq.${restFilter(matchId)}&limit=1`, {}, env);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function roomFor(row, sent = []) {
  const room = new GameRoom({
    matchId: row.id,
    mode: row.mode,
    wordLocale: row.word_locale,
    players: row.players,
    state: row.state,
    version: row.turn_version,
    status: row.status,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now()
  }, {
    manageClock: false,
    send: (id, type, payload) => sent.push({ id, type, payload })
  });
  room.status = row.status;
  return room;
}

async function initializeMatch(row, env) {
  if (row.state) return row;
  const room = roomFor(row);
  const rows = await serviceRequest(`/rest/v1/online_matches?id=eq.${restFilter(row.id)}&state=is.null&select=*`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: { state: room.fullState(), updated_at: new Date().toISOString() }
  }, env);
  return Array.isArray(rows) && rows[0] ? rows[0] : await matchFor(row.id, env);
}

function assignmentFor(row, playerId) {
  return Array.isArray(row.players) ? row.players.find(player => player.id === playerId) || null : null;
}

function packetFor(row, playerId) {
  const assignment = assignmentFor(row, playerId);
  if (!assignment) throw new MatchApiError('not_a_match_player', 403);
  const room = roomFor(row);
  return {
    status: row.status === 'finished' ? 'finished' : 'matched',
    match: {
      matchId: row.id,
      mode: row.mode,
      wordLocale: row.word_locale,
      assignment,
      players: row.players
    },
    gameState: room.stateFor(playerId),
    result: row.result || null
  };
}

async function persistRoom(row, room, actionLog, result, env) {
  const body = {
    state: room.fullState(),
    turn_version: room.version,
    status: room.status,
    action_log: actionLog.slice(-120),
    updated_at: new Date().toISOString(),
    ...(result ? { result, finished_at: new Date().toISOString() } : {})
  };
  const rows = await serviceRequest(`/rest/v1/online_matches?id=eq.${restFilter(row.id)}&turn_version=eq.${row.turn_version}&status=eq.${restFilter(row.status)}&select=*`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body
  }, env);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function advanceExpiredTurn(row, env) {
  if (!row?.state || row.status !== 'playing') return row;
  const sent = [], room = roomFor(row, sent), deadline = Number(room.engine.state?.turnDeadlineAt || 0), key = room.clockKey();
  if (!key || !deadline || deadline > Date.now()) return row;
  room.handleTimeout(key);
  const result = sent.find(message => message.type === 'game:finished')?.payload?.result || null;
  const saved = await persistRoom(row, room, Array.isArray(row.action_log) ? row.action_log : [], result, env);
  return saved || await matchFor(row.id, env);
}

async function queuePacket(ticket, env) {
  await serviceRequest(`/rest/v1/matchmaking_tickets?player_id=eq.${restFilter(ticket.player_id)}&status=eq.waiting`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: { updated_at: new Date().toISOString() }
  }, env);
  const localeFilter = ticket.word_locale === null ? 'is.null' : `eq.${restFilter(ticket.word_locale)}`;
  const waiting = await serviceRequest(`/rest/v1/matchmaking_tickets?select=player_id&status=eq.waiting&mode=eq.${restFilter(ticket.mode)}&word_locale=${localeFilter}&order=joined_at.asc,player_id.asc`, {}, env);
  const index = Array.isArray(waiting) ? waiting.findIndex(row => row.player_id === ticket.player_id) : -1;
  return {
    status: 'waiting',
    queue: {
      mode: ticket.mode,
      wordLocale: ticket.word_locale,
      position: index >= 0 ? index + 1 : 1,
      waiting: Array.isArray(waiting) ? waiting.length : 1,
      required: MODE_SEATS[ticket.mode].length
    }
  };
}

async function statusFor(identity, env) {
  const ticket = await ticketFor(identity.playerId, env);
  if (!ticket) return { status: 'idle' };
  if (ticket.status === 'waiting') return queuePacket(ticket, env);
  if (!ticket.match_id) throw new MatchApiError('match_ticket_corrupt', 503);
  let match = await matchFor(ticket.match_id, env);
  if (!match) throw new MatchApiError('match_not_found', 404);
  match = await initializeMatch(match, env);
  match = await advanceExpiredTurn(match, env);
  return packetFor(match, identity.playerId);
}

async function join(identity, body, env) {
  const mode = String(body.mode || '');
  if (!MODE_SEATS[mode]) throw new MatchApiError('invalid_game_mode', 400);
  if (/^[0-9a-f-]{36}$/i.test(String(identity.playerId || ''))) {
    const restrictions = await serviceRequest(`/rest/v1/player_restrictions?select=matchmaking_blocked_until&user_id=eq.${restFilter(identity.playerId)}&limit=1`, {}, env);
    const blockedUntil = Array.isArray(restrictions) ? restrictions[0]?.matchmaking_blocked_until : null;
    if (blockedUntil && Date.parse(blockedUntil) > Date.now()) {
      throw new MatchApiError('matchmaking_blocked', 403, blockedUntil);
    }
  }
  const wordLocale = mode === 'sozcukDuel' ? normalizeWordLocale(body.wordLocale || 'tr') : null;
  await rpc('kantin_join_matchmaking', {
    p_player_id: identity.playerId,
    p_username: identity.username,
    p_mode: mode,
    p_word_locale: wordLocale
  }, env);
  return statusFor(identity, env);
}

async function cancel(identity, env) {
  await rpc('kantin_cancel_matchmaking', { p_player_id: identity.playerId }, env);
  return { status: 'idle', cancelled: true };
}

async function act(identity, body, env) {
  const ticket = await ticketFor(identity.playerId, env);
  if (!ticket?.match_id || ticket.status !== 'matched') throw new MatchApiError('active_match_not_found', 404);
  if (body.matchId && String(body.matchId) !== String(ticket.match_id)) throw new MatchApiError('match_id_mismatch', 403);
  let row = await matchFor(ticket.match_id, env);
  if (!row) throw new MatchApiError('match_not_found', 404);
  row = await initializeMatch(row, env);
  row = await advanceExpiredTurn(row, env);

  const actionId = String(body.actionId || '');
  const actionLog = Array.isArray(row.action_log) ? row.action_log : [];
  const duplicate = actionLog.find(entry => entry.playerId === identity.playerId && entry.actionId === actionId);
  if (duplicate) return { ...packetFor(row, identity.playerId), ack: { actionId, turnId: row.id + ':' + row.turn_version, accepted: true, duplicate: true } };

  const sent = [], room = roomFor(row, sent);
  try {
    const ack = room.act(identity.playerId, {
      turnId: body.turnId,
      actionId,
      action: body.gameAction,
      payload: body.payload || {}
    });
    actionLog.push({ playerId: identity.playerId, actionId, turnId: ack.turnId, at: Date.now() });
    const result = sent.find(message => message.type === 'game:finished')?.payload?.result || null;
    const saved = await persistRoom(row, room, actionLog, result, env);
    if (!saved) {
      const current = await matchFor(row.id, env);
      return { ...packetFor(current, identity.playerId), conflict: true };
    }
    return { ...packetFor(saved, identity.playerId), ack };
  } catch (error) {
    if (/State güncel değil/.test(error.message)) {
      return { ...packetFor(await matchFor(row.id, env), identity.playerId), conflict: true };
    }
    if (room.version !== row.turn_version) {
      const result = sent.find(message => message.type === 'game:finished')?.payload?.result || null;
      const saved = await persistRoom(row, room, actionLog, result, env);
      if (saved) return { ...packetFor(saved, identity.playerId), rejected: { message: error.message } };
    }
    throw new MatchApiError('game_action_rejected', 409, error.message);
  }
}

module.exports = async function matchHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  try {
    assertSameOrigin(req);
    const body = bodyOf(req), action = String(body.action || ''), env = environment();
    if (action === 'session') {
      const identity = await identityForSession(req, body, env);
      sendJson(res, 200, {
        ok: true,
        status: 'connected',
        identity: {
          id: identity.playerId,
          username: identity.username,
          guest: identity.guest,
          authToken: identity.matchSessionToken || null,
          profile: identity.profile || null,
          stats: { played: 0, wins: 0, losses: 0, byMode: {} },
          friends: [], incoming: [], outgoing: []
        }
      });
      return;
    }
    const identity = await identityForRequest(req, env);
    let payload;
    if (action === 'join') payload = await join(identity, body, env);
    else if (action === 'status' || action === 'sync') payload = await statusFor(identity, env);
    else if (action === 'cancel') payload = await cancel(identity, env);
    else if (action === 'gameAction') payload = await act(identity, body, env);
    else throw new MatchApiError('unknown_action', 400);
    sendJson(res, 200, { ok: true, ...payload });
  } catch (error) {
    const known = error instanceof MatchApiError;
    if (!known) console.error('Kantin match API failed', { message: error.message, stack: error.stack });
    sendJson(res, known ? error.status : 500, {
      ok: false,
      error: known ? error.code : 'match_service_failed',
      message: known && error.details ? String(error.details) : undefined
    });
  }
};

module.exports._test = { bodyOf, guestIdentity: require('./lib/match-service').guestIdentity, packetFor, roomFor };
