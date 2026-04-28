/* BreatheWise — script.js */
document.addEventListener('DOMContentLoaded', () => {
  gsap.registerPlugin(ScrollTrigger);
  const navbar = document.querySelector('.navbar');
  const hero = document.querySelector('.hero');

  /* ========== LIVE AQI FLUX ========== */
  const aqiEl = document.getElementById('live-aqi');
  if (aqiEl) {
    let baseVal = 287;
    setInterval(() => {
      const delta = Math.floor(Math.random() * 7) - 3;
      baseVal = Math.max(260, Math.min(320, baseVal + delta));
      aqiEl.textContent = baseVal;
    }, 3000);
  }

  /* ========== HERO PARTICLES — airflow canvas animation ========== */
  const canvas = document.getElementById('hero-particles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h, animId;

    function resize() {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Create particles — subtle floating dust/air particles
    function createParticles() {
      particles = [];
      const count = Math.floor((w * h) / 8000); // density based on area
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.5 + 0.3,
          dx: (Math.random() - 0.3) * 0.4, // slight rightward drift (airflow)
          dy: (Math.random() - 0.5) * 0.15,
          opacity: Math.random() * 0.3 + 0.05,
          pulse: Math.random() * Math.PI * 2, // offset for breathing effect
        });
      }
    }
    createParticles();

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const time = Date.now() * 0.001;

      particles.forEach(p => {
        // Slow breathing opacity
        const alpha = p.opacity + Math.sin(time + p.pulse) * 0.08;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`;
        ctx.fill();

        // Move
        p.x += p.dx;
        p.y += p.dy;

        // Wrap around
        if (p.x > w + 10) p.x = -10;
        if (p.x < -10) p.x = w + 10;
        if (p.y > h + 10) p.y = -10;
        if (p.y < -10) p.y = h + 10;
      });

      // Draw faint connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < 12000) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(82,183,136,${0.03 * (1 - dist / 12000)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }
    draw();

    // Pause when not visible
    const heroObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        if (!animId) draw();
      } else {
        cancelAnimationFrame(animId);
        animId = null;
      }
    });
    heroObserver.observe(hero);
  }

  /* ========== NAV ========== */
  function updateNav() {
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
    navbar.classList.toggle('at-hero', heroBottom > 52);
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  /* ========== MOBILE MENU ========== */
  const hamburger = document.querySelector('.nav-hamburger');
  const overlay = document.querySelector('.nav-mobile-overlay');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    overlay.classList.toggle('open');
    document.body.style.overflow = overlay.classList.contains('open') ? 'hidden' : '';
  });
  overlay.querySelectorAll('a').forEach(l => l.addEventListener('click', () => {
    hamburger.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }));

  /* ========== GSAP ANIMATIONS ========== */

  // Hero
  gsap.timeline({ delay: 0.3 })
    .from('.hero-overline', { y: 10, opacity: 0, duration: 0.6, ease: 'power3.out' })
    .from('.hero-headline', { y: 20, opacity: 0, duration: 1, ease: 'power3.out' }, '-=.35')
    .from('.hero-subtitle', { y: 14, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=.5')
    .from('.hero .btn', { y: 10, opacity: 0, duration: 0.5, ease: 'power3.out' }, '-=.3')
    .from('.hero-trust', { opacity: 0, duration: 0.6 }, '-=.2');

  // Section headers
  gsap.utils.toArray('.section-header').forEach(h => {
    gsap.from(h.children, {
      y: 20, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: h, start: 'top 82%', once: true }
    });
  });

  // Data table
  gsap.from('.data-table', {
    y: 40, opacity: 0, duration: 1, ease: 'power3.out',
    scrollTrigger: {
      trigger: '.data-table', start: 'top 80%', once: true,
      onEnter: () => document.querySelectorAll('.data-number[data-count]').forEach(animateCount)
    }
  });

  function animateCount(el) {
    const numVal = parseFloat(el.dataset.count.replace(/,/g, ''));
    const suffix = el.dataset.suffix || '';
    const obj = { val: 0 };
    gsap.to(obj, {
      val: numVal, duration: 2, ease: 'power1.out',
      onUpdate() {
        const v = Math.round(obj.val);
        el.textContent = (numVal >= 1000 ? v.toLocaleString('en-IN') : v) + suffix;
      }
    });
  }

  // Progression
  gsap.from('.prog-stage', {
    y: 30, opacity: 0, duration: 0.7, stagger: 0.2, ease: 'power3.out',
    scrollTrigger: { trigger: '.prog-stages', start: 'top 80%', once: true }
  });

  // Slider
  const sw = document.querySelector('.slider-wrapper');
  if (sw) {
    const handle = sw.querySelector('.slider-handle');
    const before = sw.querySelector('.slider-before-layer');
    let drag = false;
    gsap.from(sw, { y: 40, opacity: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: sw, start: 'top 80%', once: true }
    });
    const setPos = x => {
      const r = sw.getBoundingClientRect();
      let p = ((x - r.left) / r.width) * 100;
      p = Math.max(5, Math.min(95, p));
      handle.style.left = p + '%';
      before.style.width = p + '%';
    };
    handle.addEventListener('mousedown', e => { drag = true; e.preventDefault(); });
    handle.addEventListener('touchstart', () => { drag = true; }, { passive: true });
    window.addEventListener('mousemove', e => { if (drag) setPos(e.clientX); });
    window.addEventListener('touchmove', e => { if (drag) setPos(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('mouseup', () => { drag = false; });
    window.addEventListener('touchend', () => { drag = false; });
  }

  // How it works
  gsap.from('.how-image', { y: 40, opacity: 0, duration: 1, ease: 'power3.out',
    scrollTrigger: { trigger: '.how-layout', start: 'top 75%', once: true }
  });
  gsap.from('.how-step', { y: 20, opacity: 0, duration: 0.6, stagger: 0.15, ease: 'power3.out',
    scrollTrigger: { trigger: '.how-steps', start: 'top 75%', once: true }
  });

  // Testimonials
  gsap.from('.testimonial-card', {
    y: 30, opacity: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out',
    scrollTrigger: { trigger: '.testimonial-grid', start: 'top 80%', once: true }
  });

  // FAQ
  gsap.from('.faq-item', { y: 12, opacity: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out',
    scrollTrigger: { trigger: '.faq-list', start: 'top 80%', once: true }
  });
  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
      const open = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(o => {
        o.classList.remove('open');
        o.querySelector('.faq-answer').style.maxHeight = '0';
      });
      if (!open) {
        item.classList.add('open');
        item.querySelector('.faq-answer').style.maxHeight = item.querySelector('.faq-answer').scrollHeight + 'px';
      }
    });
  });

  // Contact
  gsap.from('.contact-left', { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out',
    scrollTrigger: { trigger: '.contact', start: 'top 75%', once: true }
  });
  gsap.from('.contact-right', { y: 30, opacity: 0, duration: 0.8, delay: 0.15, ease: 'power3.out',
    scrollTrigger: { trigger: '.contact', start: 'top 75%', once: true }
  });

  // Floating contacts — hide when near footer
  const fc = document.getElementById('floating-contacts');
  const handleFloat = () => {
    const distFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    fc.style.opacity = distFromBottom < 200 ? '0' : '1';
    fc.style.pointerEvents = distFromBottom < 200 ? 'none' : 'all';
  };
  window.addEventListener('scroll', handleFloat, { passive: true });
  handleFloat();

  // Copy link button
  document.querySelectorAll('.share-btn.copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(url);
        btn.classList.add('copied');
        btn.querySelector('.copy-text').textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.querySelector('.copy-text').textContent = 'Copy link';
        }, 2000);
      } catch (e) {
        btn.querySelector('.copy-text').textContent = 'Press Cmd+C';
      }
    });
  });

  // Brochure download — placeholder
  const brochureBtn = document.getElementById('brochure-download');
  if (brochureBtn) {
    brochureBtn.addEventListener('click', e => {
      e.preventDefault();
      alert('Brochure PDF coming soon — meanwhile, WhatsApp us for details.');
    });
  }

  // Team cards
  gsap.from('.team-card', {
    y: 40, opacity: 0, duration: 0.8, stagger: 0.2, ease: 'power3.out',
    scrollTrigger: { trigger: '.team-grid', start: 'top 80%', once: true }
  });
  gsap.from('.team-tagline', {
    opacity: 0, duration: 0.8, ease: 'power2.out',
    scrollTrigger: { trigger: '.team-tagline', start: 'top 90%', once: true }
  });

  // Verticals + tech cards — reveal on scroll
  gsap.from('.vertical-card', {
    y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '.vertical-grid', start: 'top 80%', once: true }
  });
  gsap.from('.tech-col', {
    y: 30, opacity: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out',
    scrollTrigger: { trigger: '.tech-grid', start: 'top 80%', once: true }
  });
  gsap.from('.share-box', {
    y: 20, opacity: 0, duration: 0.7, ease: 'power3.out',
    scrollTrigger: { trigger: '.share-box', start: 'top 85%', once: true }
  });

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) {
        e.preventDefault();
        window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' });
      }
    });
  });
});
