/**
 * Price Game — client application.
 * Real-time multiplayer over Socket.IO, with Higgsfield cinematic animations
 * (CSS fallback when no API key is configured).
 */

(function (window) {
  'use strict';

  const ui = window.ui;
  const $ = ui.$;
  const $$ = ui.$$;

  // ---------------- state ----------------
  const state = {
    socket: null,
    user: null,
    tier: null,
    room: null,
    countries: [],
    tiers: [],
    currentCountryCode: 'US',
    isHost: false,
    guessSubmitted: false
  };

  // ---------------- init ----------------
  async function init() {
    try {
      const [countriesRes, tiersRes] = await Promise.all([
        fetch('/api/countries'),
        fetch('/api/tiers')
      ]);
      state.countries = await countriesRes.json();
      state.tiers = await tiersRes.json();
      window.__COUNTRIES = state.countries;
    } catch (e) {
      console.warn('[game] failed to load reference data', e);
      state.countries = COUNTRIES_FALLBACK;
      window.__COUNTRIES = state.countries;
    }

    renderCountrySelects();
    renderTiers('tierRow');
    renderTiers('tierRowS');

    // username / auth
    const stored = localStorage.getItem('pg_username');
    let username = stored;
    if (!username) {
      username = prompt('Welcome to Price Game. Enter your username:', '');
      if (!username || !username.trim()) username = 'Guest-' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('pg_username', username.trim());
    }
    username = username.trim().slice(0, 24);

    connectSocket(username);
    setupLeaderboard();
  }

  const COUNTRIES_FALLBACK = [
    { code: 'US', name: 'United States', currency: 'USD', symbol: '$', multiplier: 1, fractionDigits: 2 },
    { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', multiplier: 0.79, fractionDigits: 2 },
    { code: 'EU', name: 'Eurozone', currency: 'EUR', symbol: '€', multiplier: 0.93, fractionDigits: 2 },
    { code: 'JP', name: 'Japan', currency: 'JPY', symbol: '¥', multiplier: 143, fractionDigits: 0 }
  ];

  function connectSocket(username) {
    state.socket = io();

    state.socket.on('connect', () => {
      state.socket.emit('auth', username, (res) => {
        if (res.ok) {
          state.user = res.user;
          state.tier = res.tier;
          updateAuthChips();
        }
      });
    });

    state.socket.on('disconnect', () => {
      showScreen('screen-lobby');
      if (state.room) state.room = null;
      updateLobbyUI();
    });

    // lobby
    state.socket.on('room-list', (rooms) => {
      state.rooms = rooms;
      updateLobbyUI();
    });

    state.socket.on('room-update', (room) => {
      state.room = room;
      state.isHost = room.host === state.socket.id;
      renderRoomMeta();
      updateStartButton();
    });

    state.socket.on('game-started', ({ room }) => {
      state.room = room;
      state.isHost = room.host === state.socket.id;
      showScreen('screen-gameplay');
      ui.fireConfetti();
    });

    // gameplay
    state.socket.on('round-start', ({ round, total, item, timeLeft }) => {
      state.room.currentRound = round;
      state.guessSubmitted = false;
      state.currentItem = item;

      showScreen('screen-gameplay');
      $('#pillRound').classList.remove('hidden');
      $('#txtRound').textContent = round;
      $('#txtTotal').textContent = total;
      $('#txtWaiting').classList.remove('hidden');
      $('#chipMyGuess').classList.remove('show');
      $('#guessList').innerHTML = '';
      $('#inputGuess').disabled = false;
      $('#btnGuess').disabled = false;
      $('#inputGuess').value = '';
      $('#gameplayControls').classList.remove('hidden');

      const card = $('#itemCard');
      card.classList.remove('revealed');
      $('#itemTag').textContent = `${item.icon} ${item.categoryLabel}`;
      $('#itemName').textContent = item.name;
      $('#itemDesc').textContent = item.description;
      $('#itemImg').src = item.image;
      const c = state.countries.find(x => x.code === item.country) || {};
      $('#itemCurrency').textContent = `${c.currency} • ${item.countryName}`;
      state.currentCountryCode = item.country;

      // timer ring UI countdown
      let remaining = Math.ceil(timeLeft);
      $('#txtTimer').textContent = remaining;
      const ring = $('#timerRing');
      ring.classList.remove('done');
      const t = setInterval(() => {
        remaining -= 1;
        $('#txtTimer').textContent = Math.max(0, remaining);
        if (remaining <= 0) {
          clearInterval(t);
          ring.classList.add('done');
        }
      }, 1000);
      setTimeout(() => clearInterval(t), Math.ceil(timeLeft) * 1000 + 200);

      // Higgsfield cinematic reveal
      window.higgsfield.playItemReveal(item, $('#itemMediaWrap') || $('#itemCard .item-media'));
    });

    state.socket.on('guess-received', ({ username: u }) => {
      const row = document.createElement('div');
      row.className = 'guess-item';
      row.innerHTML = `<span class="g-user">${escapeHtml(u)}</span><span class="g-value">—</span><span class="g-diff">submitted</span>`;
      $('#guessList').appendChild(row);
    });

    state.socket.on('round-end', (payload) => {
      state.guessSubmitted = true;
      $('#inputGuess').disabled = true;
      $('#btnGuess').disabled = true;
      $('#txtWaiting').classList.add('hidden');

      // fill in actual price + results
      $('#rrRound').textContent = payload.round;
      $('#rrActual').textContent = ui.fmt.price(payload.actual, state.currentCountryCode);
      $('#rrTable').innerHTML = '';

      // rank results by closeness
      const ordered = [...payload.results].sort((a, b) => {
        if (a.guess === undefined || a.guess === null) return 1;
        if (b.guess === undefined || b.guess === null) return 1;
        return Math.abs(a.guess - payload.actual) - Math.abs(b.guess - payload.actual);
      });

      const closestIds = new Set(payload.closest);
      ordered.forEach((r, i) => {
        const diff = r.guess == null ? null : Math.abs(r.guess - payload.actual);
        const me = r.id === state.socket.id;
        const el = document.createElement('div');
        el.className = `result-row ${me ? 'me' : ''} ${closestIds.has(r.id) ? 'crown-row' : ''}`;
        const diffText = r.guess == null ? '—' : diff == null ? '—' : ui.fmt.number(Math.round(diff), 0) + ' off';
        const ptsCls = r.closestBonus ? 'pts bonus' : 'pts';
        el.innerHTML = `
          <div class="rank-num">${i + 1}</div>
          <div class="g-user ${me ? 'me' : ''}">${closestIds.has(r.id) ? '👑 ' : ''}${escapeHtml(r.username)} ${me ? '(you)' : ''}</div>
          <div class="guess-val">${r.guess == null ? '—' : ui.fmt.price(r.guess, state.currentCountryCode)}</div>
          <div class="g-diff">${diffText}</div>
          <div class="${ptsCls}">${r.points > 0 ? '+' + r.points : 0}</div>
        `;
        $('#rrTable').appendChild(el);
      });

      showScreen('screen-roundresults');
      if (closestIds.size) window.higgsfield.playVictory(payload.closest[0], payload.results.find(r => closestIds.has(r.id))?.points || 0);
    });

    state.socket.on('game-end', ({ scores, winners, leaderboard }) => {
      state.room = null;
      $('#goTable').innerHTML = '';
      scores.forEach((s, i) => {
        const win = winners.includes(s.id);
        const el = document.createElement('div');
        el.className = `final-row ${win ? 'winner' : ''}`;
        el.innerHTML = `
          <div class="place">${win ? '👑' : i + 1}</div>
          <div class="name">${escapeHtml(s.username)} ${s.id === state.socket.id ? '(you)' : ''}</div>
          <div class="pts">${ui.fmt.number(s.points, 0)}</div>
          <div class="tier" style="color:var(--muted)">${win ? 'WINNER' : ''}</div>
        `;
        $('#goTable').appendChild(el);
      });
      $('#goHeadline').textContent = winners.length > 1 ? 'Team Victory!' : 'Match Complete';
      $('#goSub').textContent = 'Final scores. Points have been added to your profile.';
      $('#goNewTier').innerHTML = '';
      showScreen('screen-gameover');
      window.higgsfield.playVictory('winner', 0);
    });

    state.socket.on('chat', ({ text }) => {
      // lightweight system chat in results/lobby
      const el = document.createElement('div');
      el.className = 'guess-item';
      el.style.background = 'rgba(255,255,255,0.03)';
      el.style.borderColor = 'rgba(255,255,255,0.08)';
      el.innerHTML = `<span class="g-user" style="color:var(--ink-dim);font-size:0.8rem;">⚡ ${escapeHtml(text)}</span>`;
      const list = $('#guessList');
      if (list) list.appendChild(el);
    });
  }

  // ---------------- lobby ----------------
  function updateLobbyUI() {
    const list = $('#roomList');
    list.innerHTML = '';
    const rooms = state.rooms || [];
    if (rooms.length === 0) {
      list.innerHTML = '<div class="empty-msg">No rooms yet. Create one and invite friends!</div>';
      return;
    }
    rooms.forEach(r => {
      const row = document.createElement('div');
      row.className = 'room-row';
      row.innerHTML = `
        <div>
          <div class="room-code">${r.code}</div>
          <div class="room-mode">${r.mode.toUpperCase()} • ${r.country}</div>
        </div>
        <div class="${r.state === 'lobby' ? 'host-tag' : ''}">${r.state === 'lobby' ? '<span class="host-label">HOST</span>' : ''}</div>
        <div class="room-state ${r.state}">${r.state === 'playing' ? 'IN PROGRESS' : 'LOBBY'}</div>
        <button class="btn btn-ghost join-btn">Join</button>
      `;
      row.querySelector('.join-btn').onclick = () => joinRoom(r.code);
      list.appendChild(row);
    });
  }

  function updateAuthChips() {
    const tierChip = document.createElement('span');
    tierChip.className = 'tier-badge';
    tierChip.style.backgroundColor = state.tier.color;
    function fill(el, prefix) {
      el.innerHTML = '';
      const t = document.createElement('span');
      t.textContent = prefix + escapeHtml(state.user.username);
      el.appendChild(t);
      el.appendChild(tierChip.cloneNode(true));
    }
    const c1 = $('#chipUser');
    if (c1) fill(c1, '');
    const c2 = $('#chipUserS');
    if (c2) fill(c2, 'Host: ');
    const c3 = $('#chipUserG');
    if (c3) fill(c3, 'You — ');
  }

  function renderRoomMeta() {
    if (!state.room) return;
    $('#chipNameS').textContent = state.user ? state.user.username : '';
    const modeLabels = { '1v1': '1v1 Duel', '2v2': '2v2 Teams', ffa: 'Free-for-All', ranked: 'Ranked' };
    const modeSel = $('#selMode');
    if (modeSel) modeSel.value = state.room.mode;
    const countrySel = $('#selCountry');
    if (countrySel) countrySel.value = state.room.country;
    $('#selRounds').value = state.room.rounds;
  }

  function updateStartButton() {
    const btn = $('#btnStart');
    const hint = $('#startHint');
    if (!btn) return;
    const min = { '1v1': 2, '2v2': 4, ffa: 2, ranked: 2 }[state.room.mode] || 2;
    const enough = (state.room.players || []).length >= min;
    if (state.isHost && enough) {
      btn.disabled = false;
      hint.textContent = `Ready to start (${state.room.players.length}/${maxPlayers(state.room.mode)})`;
    } else if (!state.isHost) {
      btn.disabled = true;
      hint.textContent = 'Waiting for the host to start…';
    } else {
      btn.disabled = true;
      hint.textContent = `Need ${min - (state.room.players || []).length} more player(s)`;
    }
  }

  function maxPlayers(mode) { return mode === '2v2' ? 4 : mode === 'ffa' ? 8 : 2; }

  async function createRoom() {
    const sock = state.socket;
    if (!sock) return;
    const mode = $('#selMode').value;
    const country = $('#selCountry').value;
    const rounds = $('#selRounds').value;
    sock.emit('create-room', { mode, country, rounds }, (res) => {
      if (res.ok) {
        state.room = res.room;
        state.isHost = true;
        showScreen('screen-settings');
      } else {
        alert(res.error || 'Could not create room');
      }
    });
  }

  async function joinRoom(code) {
    state.socket.emit('join-room', { code }, (res) => {
      if (res.ok) {
        state.room = res.room;
        state.isHost = false;
        showScreen('screen-settings');
      } else {
        alert(res.error || 'Could not join room');
      }
    });
  }

  function refreshRooms() {
    if (state.socket) state.socket.emit('auth', state.user.username);
  }

  function showLobby() {
    showScreen('screen-lobby');
    state.room = null;
    if (state.socket) state.socket.emit('leave-room');
    updateLobbyUI();
  }

  async function startGame() {
    if (!state.room) return;
    state.socket.emit('start-game', {}, (res) => {
      if (!res.ok) alert(res.error || 'Could not start game');
    });
  }

  async function submitGuess() {
    const input = $('#inputGuess');
    const raw = input.value.replace(/,/g, '');
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val < 0) {
      input.focus();
      return;
    }
    state.socket.emit('submit-guess', { guess: val }, (res) => {
      if (res.ok) {
        state.guessSubmitted = true;
        input.disabled = true;
        $('#btnGuess').disabled = true;
        $('#chipMyGuess').classList.add('show');
        $('#txtMyGuess').textContent = `Your guess: ${ui.fmt.price(val, state.currentCountryCode)}`;
      } else {
        alert(res.error || 'Guess rejected');
      }
    });
  }

  function continueGame() {
    if (!state.room) return;
    state.socket.emit('next-round', {});
  }

  function rematch() {
    state.socket.emit('rematch', {}, (res) => {
      if (res.ok) showScreen('screen-settings');
    });
  }

  // ---------------- leaderboard ----------------
  function setupLeaderboard() {
    const sel = $('#selLbCountry');
    state.countries.forEach(c => {
      const o = document.createElement('option');
      o.value = c.code;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    sel.onchange = () => loadLeaderboard(sel.value);
    loadLeaderboard('');
  }

  async function loadLeaderboard(country) {
    try {
      const url = `/api/leaderboard?limit=50${country ? '&country=' + country : ''}`;
      const rows = await (await fetch(url)).json();
      const t = $('#lbTable');
      t.innerHTML = '';
      rows.forEach((r, i) => {
        const me = state.user && r.username === state.user.username;
        const tier = state.tiers.find(t => r.points >= t.minPoints) || state.tiers[0];
        // note: tiers sorted asc; find last matching
        let best = state.tiers[0];
        for (const tc of state.tiers) if (r.points >= tc.minPoints) best = tc;
        const el = document.createElement('div');
        el.className = `lb-row ${me ? 'me' : ''}`;
        el.innerHTML = `
          <div class="pos">${i + 1}</div>
          <div class="name ${me ? '' : ''}">${escapeHtml(r.username)} ${me ? '(you)' : ''}</div>
          <div class="pts">${ui.fmt.number(r.points, 0)}</div>
          <div>${r.games}</div>
          <div class="tier" style="color:${best.color}">${best.name}</div>
        `;
        t.appendChild(el);
      });
    } catch (e) {
      console.warn('[game] leaderboard load failed', e);
    }
  }

  function openLeaderboard() {
    showScreen('screen-leaderboard');
    loadLeaderboard($('#selLbCountry').value);
  }

  function showProfile() {
    const p = $('#panel-profile');
    $('#profChip').innerHTML = `${escapeHtml(state.user.username)} `;
    const badge = document.createElement('span');
    badge.className = 'tier-badge';
    badge.style.backgroundColor = state.tier.color;
    $('#profChip').appendChild(badge);
    $('#profPoints').textContent = ui.fmt.number(state.user.points, 0);
    $('#profGames').textContent = state.user.games;
    $('#profWins').textContent = state.user.wins;
    p.classList.remove('hidden');
  }

  function hideProfile() {
    $('#panel-profile').classList.add('hidden');
  }

  // ---------------- render helpers ----------------
  function renderCountrySelects() {
    ['selCountry', 'selLbCountry'].forEach(id => {
      const sel = $(id);
      if (!sel) return;
      sel.innerHTML = id === 'selLbCountry' ? '<option value="">All Countries</option>' : '';
      state.countries.forEach(c => {
        const o = document.createElement('option');
        o.value = c.code;
        o.textContent = `${c.name} (${c.currency})`;
        sel.appendChild(o);
      });
    });
  }

  function renderTiers(elId) {
    const root = $(elId);
    if (!root) return;
    root.innerHTML = '';
    state.tiers.forEach(t => {
      const el = document.createElement('div');
      el.className = 'tier-chip';
      el.style.borderColor = t.color;
      el.style.color = t.color;
      el.title = `${t.name} — ${t.description}`;
      el.textContent = `${t.badge} ${t.name}`;
      root.appendChild(el);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------------- public API ----------------
  window.app = {
    init,
    showLobby,
    showSettings: () => showScreen('screen-settings'),
    createRoom,
    joinRoom,
    refreshRooms,
    startGame,
    submitGuess,
    continueGame,
    rematch,
    openLeaderboard,
    loadLeaderboard,
    showProfile,
    hideProfile
  };

  // enter key on guess input
  document.addEventListener('DOMContentLoaded', () => {
    $('#inputGuess')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitGuess();
    });
    init();
  });

})(window);
