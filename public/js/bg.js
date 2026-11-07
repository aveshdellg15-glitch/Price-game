/** Ambient background: slow-moving gradient mesh + floating particles. */
(function () {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let width, height;
  const particles = [];
  const PARTICLE_COUNT = 26;

  function resize() {
    width = canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    height = canvas.height = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;
  }

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.25;
      this.size = Math.random() * 400 + 150;
      this.color = `rgba(${Math.random() > 0.5 ? '212,175,55' : '14,165,233'}, ${0.03 + Math.random() * 0.04})`;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < -200) this.x = width + 200;
      if (this.x > width + 200) this.x = -200;
      if (this.y < -200) this.y = height + 200;
      if (this.y > height + 200) this.y = -200;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

  function loop() {
    ctx.clearRect(0, 0, width, height);
    // base mesh gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#050a14');
    grad.addColorStop(0.5, '#0b1220');
    grad.addColorStop(1, '#050a14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  loop();
})();
