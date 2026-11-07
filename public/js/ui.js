/** Price Game — UI helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const fmt = {
  number(n, decimals) {
    return Number(n).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },
  price(value, country) {
    const c = (window.__COUNTRIES || []).find(x => x.code === country) || {};
    const digits = c.fractionDigits == null ? 2 : c.fractionDigits;
    const v = digits === 0 ? Math.round(value) : value;
    return (c.symbol || '$') + v.toLocaleString(undefined, {
      minimumFractionDigits: digits === 0 ? 0 : 2,
      maximumFractionDigits: digits === 0 ? 0 : 2
    });
  }
};

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $(`#${id}`);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

/** Confetti explosion on victory. */
function fireConfetti() {
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  function resize() {
    w = canvas.width = canvas.parentElement.clientWidth;
    h = canvas.height = canvas.parentElement.clientHeight;
  }
  class P {
    constructor() {
      this.x = w * 0.45 + Math.random() * w * 0.1;
      this.y = h * 0.25;
      this.vx = (Math.random() - 0.5) * 14;
      this.vy = -Math.random() * 12 - 2;
      this.size = Math.random() * 8 + 4;
      this.color = ['#d4af37', '#f0c24a', '#fbbf24', '#ffffff', '#7c3aed'][Math.floor(Math.random() * 5)];
      this.life = 1;
      this.decay = Math.random() * 0.015 + 0.01;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.4;
      this.life -= this.decay;
    }
    draw() {
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.size, this.size);
    }
  }
  for (let i = 0; i < 160; i++) particles.push(new P());
  resize();
  function loop() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => { p.update(); p.draw(); });
    particles = particles.filter(p => p.life > 0);
    if (particles.length) requestAnimationFrame(loop);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(loop);
}

window.ui = { $, $$, showScreen, fmt, fireConfetti };
