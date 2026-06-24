(function () {
  const hero = document.getElementById("hero");
  const gameLayer = document.getElementById("hero-game");
  const ship = document.getElementById("hero-ship");
  const heroContent = document.getElementById("hero-content");
  const boss = document.getElementById("hero-boss");

  if (!hero || !gameLayer || !ship || !heroContent || !boss) return;

  const BULLET_SPEED = 10;
  const BURST_INTERVAL = 1600;
  const BURST_SHOTS = 1;
  const BURST_DELAY = 70;
  const SHIP_PADDING = 24;

  let active = false;
  let letters = [];
  let bullets = [];
  let shipPos = { x: 0, y: 0 };
  let mousePos = { x: 0, y: 0 };
  let burstTimer = null;
  let rafId = null;
  let originalContentHTML = "";

  // Boss Fight Variables
  let bossState = "hidden"; // 'hidden', 'idle', 'attack', 'damage', 'victory', 'lose'
  let bossHealth = 3;
  let bossPos = { x: 0, y: 0 };
  let bossDirection = 1;
  let bossBullets = [];
  let bossAttackTimer = null;

  function isDestroyableLetter(letter) {
    return !letter.classList.contains("hero-letter--space");
  }

  function allLettersDestroyed() {
    const targets = letters.filter(isDestroyableLetter);
    return targets.length > 0 && targets.every((l) => l.classList.contains("hero-letter--dead"));
  }

  function checkVictory() {
    if (active && allLettersDestroyed()) {
      if (bossState === "hidden") {
        startBossFight();
      }
    }
  }

  function splitTextNodes(root) {
    const targets = [];

    function walk(node, isInsideBio = false) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!text) return;

        const frag = document.createDocumentFragment();
        if (isInsideBio) {
          const tokens = text.split(/(\s+)/);
          for (const token of tokens) {
            if (!token) continue;
            const span = document.createElement("span");
            if (/^\s+$/.test(token)) {
              span.className = "hero-letter hero-letter--space";
              span.textContent = "\u00A0".repeat(token.length);
            } else {
              span.className = "hero-letter";
              span.textContent = token;
            }
            frag.appendChild(span);
            targets.push(span);
          }
        } else {
          for (const char of text) {
            const span = document.createElement("span");
            if (char === " ") {
              span.className = "hero-letter hero-letter--space";
              span.textContent = "\u00A0";
            } else {
              span.className = "hero-letter";
              span.textContent = char;
            }
            frag.appendChild(span);
            targets.push(span);
          }
        }
        node.parentNode.replaceChild(frag, node);
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const nextIsInsideBio = isInsideBio || node.classList.contains("hero-bio");
        [...node.childNodes].forEach((child) => walk(child, nextIsInsideBio));
      }
    }

    walk(root);
    return targets;
  }

  function getHeroRect() {
    return hero.getBoundingClientRect();
  }

  function clampShip(x, y) {
    const rect = getHeroRect();
    const minY = rect.height - 400;
    const maxY = rect.height - 150;
    return {
      x: Math.min(Math.max(x, SHIP_PADDING), rect.width - SHIP_PADDING),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }

  function setShipPosition(x, y) {
    shipPos = clampShip(x, y);
    ship.style.left = `${shipPos.x}px`;
    ship.style.top = `${shipPos.y}px`;
  }

  function spawnBullet(offsetX = 0) {
    const bullet = document.createElement("div");
    bullet.className = "hero-game__bullet";
    gameLayer.appendChild(bullet);

    const x = shipPos.x + offsetX;
    const y = shipPos.y - 24;
    bullet.style.left = `${x}px`;
    bullet.style.top = `${y}px`;

    bullets.push({ el: bullet, x, y });
  }

  function fireBurst() {
    if (!active) return;
    const spreads = [0];
    spreads.slice(0, BURST_SHOTS).forEach((spread, index) => {
      setTimeout(() => {
        if (active) spawnBullet(spread);
      }, index * BURST_DELAY);
    });
  }

  function rectsOverlap(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  function startBossFight() {
    bossState = 'idle';
    bossHealth = 3;
    bossDirection = 1;
    
    const rect = getHeroRect();
    bossPos = {
      x: rect.width / 2,
      y: 200
    };
    
    boss.style.display = 'block';
    boss.className = 'hero-game__boss hero-game__boss--idle';
    boss.style.left = `${bossPos.x}px`;
    boss.style.top = `${bossPos.y}px`;
    boss.style.opacity = '1';

    updateBossHealthUI();

    bossAttackTimer = setInterval(() => {
      if (active && bossState === 'idle') {
        bossShoot();
      }
    }, 1800);
  }

  function updateBossHealthUI() {
    const dots = boss.querySelectorAll('.boss-dot');
    dots.forEach((dot, index) => {
      if (index < bossHealth) {
        dot.classList.remove('boss-dot--depleted');
      } else {
        dot.classList.add('boss-dot--depleted');
      }
    });
  }

  function damageBoss() {
    if (bossState === 'damage' || bossState === 'lose' || bossState === 'victory' || bossState === 'hidden') return;

    bossHealth--;
    updateBossHealthUI();
    
    // Spawn two concentric radial waves simultaneously (different speeds & rotated offset)
    spawnRingBullets(0, 5.0);
    spawnRingBullets(Math.PI / 18, 3.0);

    if (bossHealth <= 0) {
      triggerVictory();
    } else {
      bossState = 'damage';
      boss.className = 'hero-game__boss hero-game__boss--damage';
      
      setTimeout(() => {
        if (active && bossState === 'damage') {
          bossState = 'idle';
          boss.className = 'hero-game__boss hero-game__boss--idle';
        }
      }, 800);
    }
  }

  // Boss shooting logic
  function bossShoot() {
    if (bossState !== 'idle') return;

    bossState = 'attack';
    boss.className = 'hero-game__boss hero-game__boss--attack';

    spawnBossBullet();

    setTimeout(() => {
      if (active && bossState === 'attack') {
        bossState = 'idle';
        boss.className = 'hero-game__boss hero-game__boss--idle';
      }
    }, 400);
  }

  function spawnBossBullet() {
    const ball = document.createElement("div");
    ball.className = "hero-game__boss-bullet";
    gameLayer.appendChild(ball);

    const x = bossPos.x;
    const y = bossPos.y + 100;
    ball.style.left = `${x}px`;
    ball.style.top = `${y}px`;

    bossBullets.push({ el: ball, x, y, vx: 0, vy: 0, homing: true });
  }

  function spawnRingBullets(offsetAngle = 0, speed = 3.5) {
    const numBullets = 18;
    for (let i = 0; i < numBullets; i++) {
      const angle = (i * 2 * Math.PI) / numBullets + offsetAngle;
      const ball = document.createElement("div");
      ball.className = "hero-game__boss-bullet";
      gameLayer.appendChild(ball);

      const x = bossPos.x;
      const y = bossPos.y;
      ball.style.left = `${x}px`;
      ball.style.top = `${y}px`;

      bossBullets.push({
        el: ball,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        homing: false
      });
    }
  }

  function updateBossBullets() {
    const shipRect = ship.getBoundingClientRect();
    const rect = getHeroRect();
    const loseHomingY = rect.height - 300;

    bossBullets = bossBullets.filter((bullet) => {
      // Check if tracking bullet should lose interest
      if (bullet.homing && bullet.y > loseHomingY) {
        bullet.homing = false;
        const dx = shipPos.x - bullet.x;
        const dy = shipPos.y - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = 4;
        if (distance > 0.1) {
          bullet.vx = (dx / distance) * speed;
          bullet.vy = (dy / distance) * speed;
        } else {
          bullet.vx = 0;
          bullet.vy = speed;
        }
      }

      if (bullet.homing) {
        const dx = shipPos.x - bullet.x;
        const dy = shipPos.y - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 1) {
          const speed = 4;
          bullet.x += (dx / distance) * speed;
          bullet.y += (dy / distance) * speed;
        } else {
          bullet.y += 4;
        }
      } else {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
      }

      bullet.el.style.left = `${bullet.x}px`;
      bullet.el.style.top = `${bullet.y}px`;

      const bulletRect = bullet.el.getBoundingClientRect();

      // Check collision with player bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const playerBullet = bullets[i];
        const playerBulletRect = playerBullet.el.getBoundingClientRect();
        if (rectsOverlap(bulletRect, playerBulletRect)) {
          bullet.el.remove();
          playerBullet.el.remove();
          bullets.splice(i, 1);
          return false;
        }
      }

      if (
        bullet.y > rect.height + 20 ||
        bullet.y < -20 ||
        bullet.x < -20 ||
        bullet.x > rect.width + 20
      ) {
        bullet.el.remove();
        return false;
      }

      if (rectsOverlap(bulletRect, shipRect)) {
        bullet.el.remove();
        triggerGameOver();
        return false;
      }

      return true;
    });
  }

  function triggerGameOver() {
    bossState = 'victory';
    boss.className = 'hero-game__boss hero-game__boss--victory';

    clearInterval(burstTimer);
    burstTimer = null;

    if (bossAttackTimer) {
      clearInterval(bossAttackTimer);
      bossAttackTimer = null;
    }

    // Hide ship and boss
    ship.style.display = 'none';
    boss.style.display = 'none';

    // Show Game Over text in original title position
    heroContent.innerHTML = `
      <h1 class="game-status-title" style="color: #ff3366; text-shadow: 0 0 15px rgba(255, 51, 102, 0.4);">GAME OVER</h1>
      <div class="hero-bio">
        <p style="color: rgba(255,255,255,0.7); font-size: 1.1rem; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Click anywhere to try again</p>
      </div>
    `;
    heroContent.style.opacity = '1';
  }

  function triggerVictory() {
    bossState = 'lose';
    boss.className = 'hero-game__boss hero-game__boss--lose';

    clearInterval(burstTimer);
    burstTimer = null;

    if (bossAttackTimer) {
      clearInterval(bossAttackTimer);
      bossAttackTimer = null;
    }

    // Hide ship and boss
    ship.style.display = 'none';
    boss.style.display = 'none';

    // Show Victory text in original title position
    heroContent.innerHTML = `
      <h1 class="game-status-title" style="color: #00f0ff; text-shadow: 0 0 15px rgba(0, 240, 255, 0.4);">VICTORY!</h1>
      <div class="hero-bio">
        <p style="color: rgba(255,255,255,0.7); font-size: 1.1rem; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">You saved the galaxy! Click to restart</p>
      </div>
    `;
    heroContent.style.opacity = '1';
  }

  function updateBullets() {
    bullets = bullets.filter((bullet) => {
      bullet.y -= BULLET_SPEED;
      bullet.el.style.top = `${bullet.y}px`;

      if (bullet.y < -20) {
        bullet.el.remove();
        return false;
      }

      const bulletRect = bullet.el.getBoundingClientRect();

      if (bossState !== 'hidden') {
        if (bossState !== 'lose' && bossState !== 'victory') {
          const bossRect = boss.getBoundingClientRect();
          if (rectsOverlap(bulletRect, bossRect)) {
            damageBoss();
            bullet.el.remove();
            return false;
          }
        }
      } else {
        for (const letter of letters) {
          if (letter.classList.contains("hero-letter--dead")) continue;
          if (rectsOverlap(bulletRect, letter.getBoundingClientRect())) {
            letter.classList.add("hero-letter--dead");
            bullet.el.remove();
            checkVictory();
            return false;
          }
        }
      }

      return true;
    });
  }

  function gameLoop() {
    if (!active) return;

    setShipPosition(
      shipPos.x + (mousePos.x - shipPos.x) * 0.22,
      shipPos.y + (mousePos.y - shipPos.y) * 0.22
    );

    if (bossState === 'idle' || bossState === 'attack' || bossState === 'damage') {
      const rect = getHeroRect();
      const bossWidth = 220;
      const speed = bossState === 'damage' ? 1.5 : 3.5;
      bossPos.x += bossDirection * speed;

      if (bossPos.x < bossWidth / 2 + 10) {
        bossPos.x = bossWidth / 2 + 10;
        bossDirection = 1;
      } else if (bossPos.x > rect.width - bossWidth / 2 - 10) {
        bossPos.x = rect.width - bossWidth / 2 - 10;
        bossDirection = -1;
      }

      boss.style.left = `${bossPos.x}px`;
      boss.style.top = `${bossPos.y}px`;
    }

    updateBullets();
    updateBossBullets();
    rafId = requestAnimationFrame(gameLoop);
  }

  function activateGame(clientX, clientY) {
    if (active) return;
    active = true;

    originalContentHTML = heroContent.innerHTML;
    hero.classList.add("hero--game-active");
    gameLayer.setAttribute("aria-hidden", "false");
    
    startBossFight();

    const rect = getHeroRect();
    mousePos = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    setShipPosition(mousePos.x, mousePos.y);

    burstTimer = setInterval(fireBurst, BURST_INTERVAL);
    fireBurst();
    gameLoop();
  }

  function deactivateGame() {
    if (!active) return;
    active = false;

    hero.classList.remove("hero--game-active");
    gameLayer.setAttribute("aria-hidden", "true");

    clearInterval(burstTimer);
    burstTimer = null;
    cancelAnimationFrame(rafId);
    rafId = null;

    if (bossAttackTimer) {
      clearInterval(bossAttackTimer);
      bossAttackTimer = null;
    }

    bullets.forEach((b) => b.el.remove());
    bullets = [];

    bossBullets.forEach((b) => b.el.remove());
    bossBullets = [];

    bossState = 'hidden';
    boss.style.display = 'none';
    boss.className = 'hero-game__boss';

    // Show ship and reset positioning styles
    ship.style.display = 'block';

    // Reset heroContent opacity
    heroContent.style.opacity = '';

    letters = [];
    heroContent.innerHTML = originalContentHTML;
  }

  hero.addEventListener("click", (e) => {
    if (!active) {
      activateGame(e.clientX, e.clientY);
    } else {
      deactivateGame();
    }
  });

  hero.addEventListener("mousemove", (e) => {
    if (!active) return;
    const rect = getHeroRect();
    mousePos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  });

  hero.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (!active) {
        e.preventDefault();
        activateGame(touch.clientX, touch.clientY);
        return;
      }

      e.preventDefault();
      deactivateGame();
    },
    { passive: false }
  );

  hero.addEventListener("touchmove", (e) => {
    if (!active) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = getHeroRect();
    mousePos = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  });

  hero.addEventListener("mouseleave", () => {
    if (!active) return;
    const rect = getHeroRect();
    mousePos = {
      x: rect.width / 2,
      y: rect.height * 0.75,
    };
  });
})();
