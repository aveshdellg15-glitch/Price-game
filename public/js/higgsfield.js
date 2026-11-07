/**
 * Price Game — Higgsfield AI animation integration.
 *
 * Higgsfield (https://higgsfield.ai) generates cinematic AI video. This module
 * wires the game to Higgsfield for item reveals, round transitions, victories
 * and leaderboard intros. If no HIGGSFIELD_API_KEY is configured (or the API
 * is unreachable), it falls back automatically to high-end CSS animations
 * that keep the game looking expensive without any external dependency.
 */

(function (window) {
  'use strict';

  const CONFIG_URL = './higgsfield-config.json';
  let config = null;
  let apiKey = null;
  let enabled = false;

  // Injected by the server at runtime via /env or set manually:
  // window.HIGGSFIELD_API_KEY = '...'
  function resolveApiKey() {
    if (typeof window.HIGGSFIELD_API_KEY === 'string' && window.HIGGSFIELD_API_KEY.trim() && !window.HIGGSFIELD_API_KEY.startsWith('your_')) {
      return window.HIGGSFIELD_API_KEY.trim();
    }
    return null;
  }

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (res.ok) config = await res.json();
    } catch (e) {
      console.warn('[higgsfield] config load failed', e);
    }
    if (!config) config = { provider: 'higgsfield', fallback: 'css', presets: {} };
    apiKey = resolveApiKey();
    enabled = !!apiKey;
    console.log(`[higgsfield] ${enabled ? 'API mode' : 'CSS fallback mode'} (key ${enabled ? 'present' : 'missing'})`);
    return config;
  }

  class Higgsfield {
    constructor({ apiKey } = {}) {
      this.apiKey = apiKey || null;
      this.enabled = !!this.apiKey;
      this.config = config || {};
    }

    setApiKey(key) {
      this.apiKey = key;
      this.enabled = !!key;
    }

    /** Call Higgsfield's video generation API (placeholder endpoint shape). */
    async generateVideo({ prompt, preset, duration = 5, aspect = '16:9' } = {}) {
      if (!this.enabled) throw new Error('higgsfield not configured: set HIGGSFIELD_API_KEY');
      const base = (this.config && this.config.apiBase) || 'https://api.higgsfield.ai/v1';
      const p = preset || prompt || 'luxury cinematic reveal';
      try {
        const res = await fetch(`${base}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({ model: this.config.model || 'higgsfield-video-1', prompt: p, duration, aspect })
        });
        if (!res.ok) throw new Error(`higgsfield API ${res.status}`);
        const data = await res.json();
        return data.videoUrl || data.url || null;
      } catch (e) {
        console.warn('[higgsfield] generateVideo failed, falling back to CSS', e);
        return null;
      }
    }

    /* ---------- Prompt builders (Higgsfield) ---------- */

    itemRevealPrompt(item) {
      return `Cinematic luxury reveal of "${item.name}", a ${item.categoryLabel} from ${item.countryName}. A floating 3D golden price tag rotates slowly in dramatic studio lighting, dark slate background, expensive aesthetic, 4k, slow camera push in. Item: ${item.description}`;
    }

    roundTransitionPrompt(round, total) {
      return `Luxury countdown transition for round ${round} of ${total}: gold particles swirling, elegant typography counting down 3 2 1, dark slate and gold theme, cinematic, expensive`;
    }

    victoryPrompt(winner, points) {
      return `Victory celebration for ${winner}: gold coins and confetti falling in slow motion, luxury winner announcement, gleaming golden trophy, ${points} points earned, cinematic, expensive`;
    }

    leaderboardIntroPrompt() {
      return 'Cinematic leaderboard reveal: golden rankings ascending through a luxury esports arena, dark slate theme, expensive, 4k';
    }

    /* ---------- CSS fallback animations (always available) ---------- */

    applyReveal(element, { duration = 1200 } = {}) {
      element.classList.add('hf-reveal');
      setTimeout(() => element.classList.remove('hf-reveal'), duration);
    }

    applyTransition(element, { duration = 1000 } = {}) {
      element.classList.add('hf-transition');
      setTimeout(() => element.classList.remove('hf-transition'), duration);
    }

    applyVictory(element, { duration = 1400 } = {}) {
      element.classList.add('hf-victory');
      setTimeout(() => element.classList.remove('hf-victory'), duration);
    }

    applyLeaderboardIntro(element, { duration = 1200 } = {}) {
      element.classList.add('hf-leaderboard-intro');
      setTimeout(() => element.classList.remove('hf-leaderboard-intro'), duration);
    }

    async playItemReveal(item, element) {
      if (this.enabled) {
        const url = await this.generateVideo({ prompt: this.itemRevealPrompt(item), preset: this.config.presets?.['item-reveal']?.prompt, duration: 5 }).catch(() => null);
        if (url) {
          this.playVideo(element, url);
          return url;
        }
      }
      this.applyReveal(element);
      return null;
    }

    async playRoundTransition(element, round, total) {
      if (this.enabled) {
        const url = await this.generateVideo({ prompt: this.roundTransitionPrompt(round, total), preset: this.config.presets?.['round-transition']?.prompt, duration: 3 }).catch(() => null);
        if (url) { this.playVideo(element, url); return url; }
      }
      this.applyTransition(element);
      return null;
    }

    async playVictory(element, winner, points) {
      if (this.enabled) {
        const url = await this.generateVideo({ prompt: this.victoryPrompt(winner, points), preset: this.config.presets?.['victory']?.prompt, duration: 4 }).catch(() => null);
        if (url) { this.playVideo(element, url); return url; }
      }
      this.applyVictory(element);
      return null;
    }

    async playLeaderboardIntro(element) {
      if (this.enabled) {
        const url = await this.generateVideo({ prompt: this.leaderboardIntroPrompt(), preset: this.config.presets?.['leaderboard-intro']?.prompt, duration: 4 }).catch(() => null);
        if (url) { this.playVideo(element, url); return url; }
      }
      this.applyLeaderboardIntro(element);
      return null;
    }

    playVideo(element, url) {
      element.innerHTML = '';
      const vid = document.createElement('video');
      vid.src = url;
      vid.autoplay = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.className = 'hf-video';
      vid.style.width = '100%';
      vid.style.height = '100%';
      vid.style.objectFit = 'cover';
      vid.style.borderRadius = 'inherit';
      element.appendChild(vid);
      vid.play().catch(() => {});
    }
  }

  const higgsfield = new Higgsfield();
  loadConfig().then(() => higgsfield.setApiKey(resolveApiKey()));

  window.Higgsfield = Higgsfield;
  window.higgsfield = higgsfield;
  window.higgsfieldConfig = config;
})(window);
