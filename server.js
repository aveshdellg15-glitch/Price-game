'use strict';

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { generateItem, ITEM_COUNT, CATEGORIES, COUNTRIES, TIERS, formatPrice, hashCode } = require('./lib/item-generator');
const DatabaseStore = require('./lib/database');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROUND_TIME_MS = 30000;
const INTER_ROUND_MS = 5000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const store = new DatabaseStore(path.join(__dirname, 'data', 'pricegame.sqlite'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket']
});

/* ---------- REST API ---------- */

app.get('/api/health', (_req, res) => res.json({ ok: true, itemCount: ITEM_COUNT }));

app.get('/api/countries', (_req, res) => res.json(COUNTRIES));

app.get('/api/tiers', (_req, res) => res.json(TIERS));

app.get('/api/item-count', (_req, res) => res.json({ count: ITEM_COUNT }));

// Public item details (price withheld — server authoritative)
app.get('/api/item/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1 || id > ITEM_COUNT) {
    return res.status(404).json({ error: 'invalid item id' });
  }
  const it = generateItem(id, 'US');
  delete it.priceUnits;
  res.json(it);
});

app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json(store.getLeaderboard(limit, req.query.country || null));
});

app.get('/api/user/:id', (req, res) => {
  const u = store.getUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json({
    id: u.id, username: u.username, points: u.points, games: u.games,
    wins: u.wins, country: u.country, tier: u.tier
  });
});

app.post('/api/user', (req, res) => {
  const username = String(req.body.username || '').trim().slice(0, 24);
  if (!username) return res.status(400).json({ error: 'username required' });
  const u = store.getOrCreateUser(username);
  res.json({ id: u.id, username: u.username, points: u.points, games: u.games, wins: u.wins, country: u.country });
});

/* ---------- In-memory multiplayer state ---------- */

const rooms = new Map(); // code -> room
const socketUser = new Map(); // socket.id -> userId

function tierForPoints(points) {
  let tier = TIERS[0];
  for (const t of TIERS) if (points >= t.minPoints) tier = t;
  return tier;
}

function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    country: room.country,
    rounds: room.rounds,
    state: room.state,
    players: room.players.map(p => ({ id: p.id, userId: p.userId, username: p.username, team: p.team })),
    host: room.host,
    currentRound: room.currentRound || 0,
    totalRounds: room.rounds
  };
}

function maxPlayersForMode(mode) {
  if (mode === '1v1') return 2;
  if (mode === '2v2') return 4;
  return 8; // free-for-all
}

function safeCb(cb) {
  return (res) => { if (cb && typeof cb.call === 'function') { try { cb(res); } catch (e) { console.error('ack error', e); } } };
}

function createRoom(hostSocketId, hostUser, settings) {
  const code = crypto.randomBytes(2).toString('hex').toUpperCase();
  const room = {
    id: code,
    code,
    host: hostSocketId,
    mode: settings.mode || '1v1',
    country: settings.country || 'US',
    rounds: Math.max(3, Math.min(10, parseInt(settings.rounds, 10) || 5)),
    state: 'lobby',
    players: [{ id: hostSocketId, userId: hostUser.id, username: hostUser.username, team: 0 }],
    scores: {},
    currentRound: 0,
    settings,
    item: null,
    actualPrice: 0,
    guesses: {},
    roundActive: false,
    timerHandle: null,
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) { socket.data.roomCode = null; return; }

  socket.leave(code);
  socket.data.roomCode = null;

  room.players = room.players.filter(p => p.id !== socket.id);
  delete room.scores[socket.id];
  delete room.guesses[socket.id];

  if (room.players.length === 0) {
    if (room.timerHandle) clearTimeout(room.timerHandle);
    rooms.delete(code);
    io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
  } else {
    if (room.host === socket.id) room.host = room.players[0].id;
    io.to(code).emit('room-update', publicRoom(room));
    io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
  }
}

function formatActualPrice(room) {
  return formatPrice(room.actualPrice, room.country);
}

/* ---------- Game loop ---------- */

function startRound(room) {
  room.currentRound += 1;
  room.item = null;
  room.actualPrice = 0;
  room.guesses = {};
  room.roundActive = true;

  // deterministic item pick per room+round
  const seed = hashCode(room.code + ':' + room.currentRound);
  const itemId = 1 + (seed % ITEM_COUNT);
  const item = generateItem(itemId, room.country);
  room.item = item;
  room.actualPrice = item.priceUnits;

  const clientItem = { ...item };
  delete clientItem.priceUnits;


  if (room.timerHandle) clearTimeout(room.timerHandle);
  io.to(room.code).emit('round-start', {
    round: room.currentRound,
    total: room.rounds,
    item: clientItem,
    timeLeft: ROUND_TIME_MS / 1000
  });

  room.timerHandle = setTimeout(() => finalizeRound(room), ROUND_TIME_MS);
}

function finalizeRound(room) {
  if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }
  room.roundActive = false;
  const actual = room.actualPrice;

  const results = room.players.map(p => {
    const g = room.guesses[p.id];
    let points = 0;
    let diffPct = null;
    if (g !== undefined && g !== null) {
      const diff = Math.abs(g - actual);
      diffPct = actual > 0 ? diff / actual : 0;
      points = Math.round(1000 * (1 - Math.min(1, diffPct)));
    }
    return { id: p.id, username: p.username, guess: g, diffPct, points };
  });

  const valid = results.filter(r => r.guess !== undefined && r.guess !== null);
  let closest = [];
  if (valid.length > 0) {
    const minDiff = Math.min(...valid.map(r => Math.abs(r.guess - actual)));
    closest = valid.filter(r => Math.abs(r.guess - actual) === minDiff);
    closest.forEach(r => { r.points += 300; r.closestBonus = true; });
  }

  results.forEach(r => {
    room.scores[r.id] = (room.scores[r.id] || 0) + r.points;
  });

  const payload = {
    round: room.currentRound,
    actual,
    actualFormatted: formatActualPrice(room),
    results,
    scores: room.scores,
    closest: closest.map(c => c.username)
  };
  io.to(room.code).emit('round-end', payload);
  io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
  room.timerHandle = setTimeout(() => {
    if (room.currentRound >= room.rounds) endGame(room);
    else startRound(room);
  }, INTER_ROUND_MS);
}

function endGame(room) {
  room.state = 'finished';
  if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }

  const scores = room.players.map(p => ({
    id: p.id,
    userId: p.userId,
    username: p.username,
    points: room.scores[p.id] || 0,
    team: p.team
  })).sort((a, b) => b.points - a.points);

  let winnerIds = [];
  if (room.mode === '2v2') {
    const teamTotals = { 0: 0, 1: 0 };
    scores.forEach(s => { teamTotals[s.team] += s.points; });
    const winningTeam = teamTotals[0] >= teamTotals[1] ? 0 : 1;
    winnerIds = scores.filter(s => s.team === winningTeam).map(s => s.id);
  } else {
    const top = scores[0]?.points ?? 0;
    winnerIds = scores.filter(s => s.points === top && top > 0).map(s => s.id);
    if (winnerIds.length === 0 && scores.length > 0) winnerIds = [scores[0].id];
  }

  // Persist profiles + match
  for (const p of room.players) {
    const pts = room.scores[p.id] || 0;
    const won = winnerIds.includes(p.id);
    store.updateUser(p.userId, pts, won);
  }
  store.recordMatch(room.code, room.mode, room.country, room.rounds, winnerIds, room.scores);

  io.to(room.code).emit('game-end', {
    scores, winners: winnerIds, mode: room.mode,
    leaderboard: store.getLeaderboard(10, room.country)
  });
  io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
}

/* ---------- Socket.io ---------- */

io.on('connection', socket => {
  socket.emit('welcome', { socketId: socket.id });

  socket.on('auth', (username, cb) => {
    const name = String(username || '').trim() || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
    const u = store.getOrCreateUser(name);
    socketUser.set(socket.id, u.id);
    socket.data.userId = u.id;
    socket.data.username = name;
    socket.join('lobby');
    cb && cb({
      ok: true,
      user: { id: u.id, username: name, points: u.points, games: u.games, wins: u.wins },
      tier: tierForPoints(u.points)
    });
    io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
  });

  socket.on('create-room', ({ mode, country, rounds } = {}, cb) => {
    if (!socket.data.userId) return safeCb(cb)({ ok: false, error: 'authenticate first' });
    if (mode === 'ranked') return safeCb(cb)({ ok: false, error: 'ranked mode is coming soon' });
    leaveCurrentRoom(socket);
    const u = store.getUser(socket.data.userId);
    const room = createRoom(socket.id, u, { mode, country, rounds });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.username = u.username;
    safeCb(cb)({ ok: true, room: publicRoom(room), user: { id: u.id, username: u.username } });
    io.to(room.code).emit('room-update', publicRoom(room));
    io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
  });

  socket.on('join-room', ({ code } = {}, cb) => {
    if (!socket.data.userId) return safeCb(cb)({ ok: false, error: 'authenticate first' });
    const room = rooms.get(code);
    if (room && room.mode === 'ranked') return safeCb(cb)({ ok: false, error: 'ranked mode is coming soon' });
    if (!room) return safeCb(cb)({ ok: false, error: 'room not found' });
    if (room.state !== 'lobby') return safeCb(cb)({ ok: false, error: 'game already in progress' });
    if (room.players.length >= maxPlayersForMode(room.mode)) return safeCb(cb)({ ok: false, error: 'room full' });

    leaveCurrentRoom(socket);
    const u = store.getUser(socket.data.userId);
    // team assignment: 2v2 alternates teams, others all team 0
    const team = room.mode === '2v2' ? room.players.filter(p => p.team === 0).length <= room.players.filter(p => p.team === 1).length ? 0 : 1 : 0;
    room.players.push({ id: socket.id, userId: u.id, username: u.username, team });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.username = u.username;

    safeCb(cb)({ ok: true, room: publicRoom(room), user: { id: u.id, username: u.username } });
    io.to(code).emit('room-update', publicRoom(room));
    io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
    io.to(code).emit('chat', { system: true, text: `${u.username} joined the room.` });
  });

  socket.on('leave-room', () => {
    const code = socket.data.roomCode;
    const u = store.getUser(socket.data.userId);
    leaveCurrentRoom(socket);
    if (code && u) io.to('lobby').emit('chat', { system: true, text: `${u.username} left.` });
  });

  socket.on('start-game', (_data, cb) => {
    if (!socket.data.userId) return safeCb(cb)({ ok: false, error: 'authenticate first' });
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return safeCb(cb)({ ok: false, error: 'not in a room' });
    if (room.host !== socket.id) return safeCb(cb)({ ok: false, error: 'only the host can start' });
    if (room.state !== 'lobby') return safeCb(cb)({ ok: false, error: 'game already started' });
    if (room.players.length < 2) return safeCb(cb)({ ok: false, error: 'need at least 2 players' });

    room.state = 'playing';
    room.scores = {};
    room.currentRound = 0;
    safeCb(cb)({ ok: true });
    io.to(code).emit('game-started', { room: publicRoom(room) });
    startRound(room);
  });

  socket.on('next-round', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.state !== 'playing' || room.roundActive) return;
    if (room.timerHandle) clearTimeout(room.timerHandle);
    room.timerHandle = null;
    if (room.currentRound >= room.rounds) endGame(room);
    else startRound(room);
  });

  socket.on('submit-guess', ({ guess } = {}, cb) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.state !== 'playing' || !room.roundActive) return safeCb(cb)({ ok: false, error: 'no active round' });
    if (room.guesses[socket.id] !== undefined) return safeCb(cb)({ ok: false, error: 'guess already submitted' });

    const g = parseFloat(guess);
    if (!Number.isFinite(g) || g < 0) return safeCb(cb)({ ok: false, error: 'invalid guess' });

    room.guesses[socket.id] = g;
    safeCb(cb)({ ok: true });

    const u = store.getUser(socket.data.userId);
    io.to(code).emit('guess-received', { username: u.username });

    const allGuessed = room.players.every(p => room.guesses[p.id] !== undefined);
    if (allGuessed) {
      if (room.timerHandle) clearTimeout(room.timerHandle);
      finalizeRound(room);
    }
  });

  socket.on('rematch', (_data, cb) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.host !== socket.id) return safeCb(cb)({ ok: false, error: 'only the host can rematch' });
    room.state = 'lobby';
    room.scores = {};
    room.currentRound = 0;
    room.item = null;
    room.actualPrice = 0;
    room.guesses = {};
    room.roundActive = false;
    safeCb(cb)({ ok: true });
    io.to(code).emit('room-update', publicRoom(room));
    io.to('lobby').emit('room-list', [...rooms.values()].map(publicRoom));
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const u = socket.data.userId ? store.getUser(socket.data.userId) : null;
    leaveCurrentRoom(socket);
    if (code && u) {
      const room = rooms.get(code);
      if (room) io.to(code).emit('chat', { system: true, text: `${u.username} disconnected.` });
    }
  });
});

(async () => {
  await store.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Price Game server running on http://0.0.0.0:${PORT}`);
    console.log(`Items addressable: ${ITEM_COUNT.toLocaleString()}`);
  });
})();
