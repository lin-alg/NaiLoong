(function () {
  "use strict";

  // 网页桌宠：素材和动作表用 petdex 的雪碧图规格（8 列 × 192×208，一行一个动作，
  // 每帧时长逐帧给出），行为参考 MIT 协议的 dsh-pet（漫游、随机动作、点击回应、
  // 拖拽甩抛后抛物线落地反弹、空闲睡觉、说话气泡）。零依赖、零构建。
  const WALK_SPEED = [60, 130];
  const RUN_SPEED = [200, 300];
  const FALL_GRAVITY = 2200;
  const FLOOR_RESTITUTION = 0.48;
  const WALL_RESTITUTION = 0.38;
  const FLOOR_FRICTION = 0.34;
  const AIR_DRAG = 0.12;
  const ROLL_DRAG = 2.8;
  const ANGULAR_DRAG = 1.7;
  const UPRIGHT_STRENGTH = 12;
  const UPRIGHT_DAMPING = 4.5;
  const MIN_THROW_SPEED = 240;
  const SLEEP_AFTER = 45000;
  const CLICK_SLOP = 6;
  const CLICK_MS = 420;
  // 低于 toast(99) 和图片右键菜单(120)；<dialog> 在 top layer，始终在桌宠之上。
  const Z_INDEX = 90;
  // 洗牌牌堆：一轮里每个动作各出现一次，避免每帧 random 连走八次。
  const ACTION_DECK = [
    "walk",
    "walk",
    "run",
    "wait",
    "review",
    "turn",
    "idle",
    "idle",
    "cheer"
  ];

  let node = null;
  let sprite = null;
  let bubble = null;
  let config = null;
  let state = "idle";
  let anim = null;
  let frameIndex = 0;
  let frameElapsed = 0;
  let cellW = 96;
  let cellH = 104;
  let running = false;
  let paused = false;
  let reducedMotion = false;
  let deck = [];
  let x = 0;
  let y = 0;
  let facing = 1;
  let velocity = { x: 0, y: 0 };
  let rotation = 0;
  let angularVelocity = 0;
  let falling = false;
  let frameHulls = null;
  let drag = null;
  let frameId = 0;
  let lastTick = 0;
  let stateUntil = 0;
  let lastTouch = 0;
  let sleepTimer = 0;
  let bubbleTimer = 0;
  let menu = null;
  let intro = null;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function groundY() {
    return 0;
  }

  function floorClearance(angle) {
    const hull = anim && frameHulls && frameHulls[anim.row] && frameHulls[anim.row][frameIndex];
    if (!hull || !hull.length) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      return Math.max(0, Math.abs(sine) * cellW / 2 + Math.max(0, -cellH * cosine));
    }
    const frameWidth = Number(config.frameWidth) || 192;
    const frameHeight = Number(config.frameHeight) || 208;
    const scaleX = cellW / frameWidth;
    const scaleY = cellH / frameHeight;
    const scale = sprite && sprite.classList.contains("is-squash") ? 1.14 : 1;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let lowest = Infinity;
    hull.forEach((point) => {
      const px = (point.x - frameWidth / 2) * scaleX * scale;
      const py = (frameHeight - point.y) * scaleY * scale;
      lowest = Math.min(lowest, -sine * px + cosine * py);
    });
    return Math.max(0, -lowest);
  }

  function convexHull(points) {
    points.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    points.forEach((point) => {
      while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    });
    const upper = [];
    for (let i = points.length - 1; i >= 0; i -= 1) {
      const point = points[i];
      while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function loadFrameHulls(image) {
    const frameWidth = Number(config.frameWidth) || 192;
    const frameHeight = Number(config.frameHeight) || 208;
    const columns = Number(config.columns) || 8;
    const rows = Number(config.rows) || 9;
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    frameHulls = [];
    for (let row = 0; row < rows; row += 1) {
      frameHulls[row] = [];
      for (let col = 0; col < columns; col += 1) {
        context.clearRect(0, 0, frameWidth, frameHeight);
        context.drawImage(image, col * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        const pixels = context.getImageData(0, 0, frameWidth, frameHeight).data;
        const points = [];
        for (let py = 0; py < frameHeight; py += 1) {
          let px = 0;
          while (px < frameWidth) {
            while (px < frameWidth && pixels[(py * frameWidth + px) * 4 + 3] < 16) px += 1;
            if (px >= frameWidth) break;
            const start = px;
            while (px < frameWidth && pixels[(py * frameWidth + px) * 4 + 3] >= 16) px += 1;
            points.push({ x: start, y: py }, { x: px, y: py }, { x: start, y: py + 1 }, { x: px, y: py + 1 });
          }
        }
        frameHulls[row][col] = points.length ? convexHull(points) : [];
      }
    }
  }

  function viewport() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 1024,
      height: window.innerHeight || document.documentElement.clientHeight || 768
    };
  }

  function petWidth() {
    return node ? node.offsetWidth : 0;
  }

  function clampX(value) {
    const max = Math.max(0, viewport().width - petWidth() - 8);
    return Math.min(max, Math.max(4, value));
  }

  function animationFor(id) {
    const list = (config && config.animations) || [];
    let found = null;
    let fallback = null;
    list.forEach((item) => {
      if (!item || typeof item.id !== "string") return;
      if (item.id === id) found = item;
      if (item.id === "idle") fallback = item;
    });
    return found || fallback || list[0] || null;
  }

  function paintFrame() {
    if (!sprite || !anim) return;
    const total = anim.durations ? anim.durations.length : 1;
    const col = Math.max(0, Math.min(total - 1, frameIndex));
    sprite.style.backgroundPosition = "-" + col * cellW + "px -" + (anim.row || 0) * cellH + "px";
  }

  function advanceFrame(ms) {
    if (!anim || !anim.durations || anim.durations.length < 2) return;
    if (state === "fear" && frameIndex === anim.durations.length - 1) {
      frameElapsed = 0;
      return;
    }
    frameElapsed += ms;
    let guard = 0;
    while (frameElapsed >= (anim.durations[frameIndex] || 120) && guard++ < 60) {
      frameElapsed -= anim.durations[frameIndex] || 120;
      if (state === "fear" && frameIndex === anim.durations.length - 1) {
        frameElapsed = 0;
        break;
      }
      frameIndex = (frameIndex + 1) % anim.durations.length;
    }
    paintFrame();
  }

  function setState(next, holdMs) {
    state = next;
    anim = animationFor(next);
    frameIndex = 0;
    frameElapsed = 0;
    stateUntil = holdMs ? Date.now() + holdMs : 0;
    if (!node) return;
    node.dataset.state = next;
    sprite.classList.toggle("pet-breathe", next === "idle" || next === "wait" || next === "review");
    sprite.classList.toggle("pet-bob", next === "walk-right" || next === "walk-left" || next === "run");
    paintFrame();
  }

  // 走路朝向由素材行决定（walk-right / walk-left），不需要镜像翻转。
  function faceForMovement() {
    const wanted = velocity.x >= 0 ? "walk-right" : "walk-left";
    if (state !== "run" && state !== wanted) {
      const remaining = stateUntil ? Math.max(1, stateUntil - Date.now()) : 0;
      setState(wanted, remaining);
    }
  }

  function applyTransform() {
    if (!node) return;
    node.style.transform = "translate3d(" + Math.round(x) + "px," + -y + "px,0)";
    sprite.style.rotate = rotation + "rad";
    positionBubble();
    document.dispatchEvent(new CustomEvent("pet-position", { detail: { x, y, width: cellW, height: cellH, hidden: node.hidden } }));
  }

  function positionBubble() {
    if (!node || !bubble || bubble.hidden) return;
    const rect = node.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const center = rect.left + rect.width / 2;
    const half = width / 2;
    const clamped = Math.min(viewport().width - half - 8, Math.max(half + 8, center));
    bubble.style.setProperty("--pet-bubble-shift", clamped - center + "px");
    bubble.classList.toggle("is-below", rect.top < bubble.offsetHeight + 8);
  }

  function nextFromDeck() {
    if (!deck.length) {
      deck = ACTION_DECK.slice();
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = deck[i];
        deck[i] = deck[j];
        deck[j] = swap;
      }
    }
    return deck.pop();
  }

  function pickIdleAction() {
    if (paused) {
      setState("idle", 2500);
      return;
    }
    const action = nextFromDeck();
    if (action === "walk" || action === "run") {
      const range = action === "run" ? RUN_SPEED : WALK_SPEED;
      velocity.x = (range[0] + Math.random() * (range[1] - range[0])) * facing;
      setState(action === "run" ? "run" : facing >= 0 ? "walk-right" : "walk-left", 1600 + Math.random() * 2600);
    } else if (action === "turn") {
      facing *= -1;
      setState("idle", 1200 + Math.random() * 1500);
    } else if (action === "cheer") {
      setState("cheer", 1400 + Math.random() * 900);
    } else if (action === "wait" || action === "review") {
      setState(action, 2600 + Math.random() * 2600);
    } else {
      setState("idle", 2500 + Math.random() * 3500);
    }
  }

  function isMoving() {
    return state === "walk-right" || state === "walk-left" || state === "run";
  }

  function tick(now) {
    frameId = window.requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastTick) / 1000 || 0);
    lastTick = now;
    const size = viewport().height;
    if (!(intro && (intro.phase === "pause" || (reducedMotion && intro.phase === "waiting")))) {
      advanceFrame(dt * 1000 * (intro && intro.phase === "flee" ? 2.8 : 1));
    }
    if (intro) {
      tickIntro(dt);
      return;
    }

    if (falling) {
      velocity.y -= FALL_GRAVITY * dt;
      x += velocity.x * dt;
      y += velocity.y * dt;
      velocity.x *= Math.exp(-AIR_DRAG * dt);
      angularVelocity += (-UPRIGHT_STRENGTH * Math.sin(rotation) - UPRIGHT_DAMPING * angularVelocity) * dt;
      rotation += angularVelocity * dt;
      const limit = Math.max(0, viewport().width - petWidth() - 8);
      if (x < 4) {
        x = 4;
        velocity.x = Math.abs(velocity.x) * WALL_RESTITUTION;
        angularVelocity += velocity.y / Math.max(1, cellH) * 0.12;
      } else if (x > limit) {
        x = limit;
        velocity.x = -Math.abs(velocity.x) * WALL_RESTITUTION;
        angularVelocity -= velocity.y / Math.max(1, cellH) * 0.12;
      }
      const floor = floorClearance(rotation);
      if (y <= floor) {
        y = floor;
        if (velocity.y < -95) {
          const impact = -velocity.y;
          velocity.y = impact * FLOOR_RESTITUTION;
          const radius = Math.max(1, cellH * 0.42);
          const slip = velocity.x - angularVelocity * radius;
          const impulse = slip * FLOOR_FRICTION;
          velocity.x -= impulse;
          angularVelocity += impulse / radius;
          squash();
        } else if (Math.abs(velocity.x) > 10 || Math.abs(angularVelocity) > 0.25) {
          velocity.y = 0;
          const rolling = velocity.x - angularVelocity * Math.max(1, cellH * 0.42);
          velocity.x -= rolling * Math.min(1, FLOOR_FRICTION * dt * 12);
          angularVelocity += rolling / Math.max(1, cellH * 0.42) * Math.min(1, FLOOR_FRICTION * dt * 12);
          velocity.x *= Math.exp(-ROLL_DRAG * dt);
          angularVelocity *= Math.exp(-ANGULAR_DRAG * dt);
        } else {
          velocity.x = 0;
          velocity.y = 0;
          angularVelocity = 0;
          rotation = 0;
          y = groundY();
          falling = false;
          node.classList.remove("is-airborne");
          setState("idle", 1200);
        }
      } else {
        node.classList.add("is-airborne");
      }
      if (y > size) {
        y = groundY();
        velocity.y = 0;
      }
      if (y <= floorClearance(rotation) && Math.abs(velocity.y) < 1) node.classList.remove("is-airborne");
      applyTransform();
      return;
    }

    if (isMoving() && !drag) {
      x += velocity.x * dt;
      const limit = Math.max(0, viewport().width - petWidth() - 8);
      if (x <= 4) {
        x = 4;
        facing = 1;
        velocity.x = Math.abs(velocity.x);
        faceForMovement();
      } else if (x >= limit) {
        x = limit;
        facing = -1;
        velocity.x = -Math.abs(velocity.x);
        faceForMovement();
      }
      applyTransform();
    }

    if (stateUntil && Date.now() >= stateUntil) {
      stateUntil = 0;
      if (state !== "idle") setState("idle", 1200);
      else if (!reducedMotion) pickIdleAction();
      else setState("idle", 3000);
      if (Date.now() - lastTouch > SLEEP_AFTER) setState("sleep", 0);
    }
  }

  function squash() {
    if (reducedMotion || !sprite) return;
    sprite.classList.remove("is-squash");
    void sprite.offsetWidth;
    sprite.classList.add("is-squash");
    y = Math.max(y, floorClearance(rotation));
    window.setTimeout(() => sprite && sprite.classList.remove("is-squash"), 260);
  }

  function wake() {
    lastTouch = Date.now();
    if (state === "sleep") setState("idle", 1600);
    if (!sleepTimer) {
      sleepTimer = window.setInterval(() => {
        if (!intro && Date.now() - lastTouch > SLEEP_AFTER && !drag && state === "idle") setState("sleep", 0);
      }, 3000);
    }
  }

  function showBubble(text) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    positionBubble();
    bubble.classList.remove("is-on");
    void bubble.offsetWidth;
    bubble.classList.add("is-on");
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => {
      bubble.classList.remove("is-on");
      window.setTimeout(() => {
        bubble.hidden = true;
      }, 220);
    }, 2600);
  }

  function speak() {
    const lines = typeof config.lines === "function" ? config.lines() || [] : config.lines || [];
    if (!lines.length) {
      setState("talk", 1500);
      return;
    }
    const line = lines[Math.floor(Math.random() * lines.length)];
    const cheer = line.src === config.cheerSrc;
    setState(cheer ? "cheer" : "talk", cheer ? 0 : 1700);
    showBubble(line.text || "");
    if (typeof config.play === "function") config.play(line.src, () => {
      if (cheer && state === "cheer") setState("idle", 1200);
    });
  }

  function beginDrag(event) {
    if (drag) return;
    falling = false;
    const rect = node.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: 0,
      lastX: event.clientX,
      lastY: event.clientY,
      t: performance.now(),
      vx: 0,
      vy: 0,
      grabX: event.clientX - (rect.left + rect.width / 2),
      grabY: (rect.top + rect.height / 2) - event.clientY,
      down: performance.now()
    };
    try {
      node.setPointerCapture(event.pointerId);
    } catch (err) {
    }
    setState("grab", 0);
    node.classList.add("is-dragging");
  }

  function moveDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const rect = node.getBoundingClientRect();
    const stepX = event.clientX - drag.lastX;
    const stepY = event.clientY - drag.lastY;
    drag.moved += Math.abs(stepX) + Math.abs(stepY);
    const now = performance.now();
    const span = Math.max(1, now - drag.t) / 1000;
    drag.vx = stepX / span;
    drag.vy = -stepY / span;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.t = now;
    x = clampX(event.clientX - drag.dx);
    const floor = floorClearance(rotation);
    const maxY = Math.max(floor, viewport().height - rect.height);
    y = Math.min(maxY, Math.max(floor, viewport().height - (event.clientY - drag.dy) - rect.height));
    facing = stepX > 0.6 ? 1 : stepX < -0.6 ? -1 : facing;
    applyTransform();
  }

  function endDrag(event) {
    if (!drag || (event && drag.id !== event.pointerId)) return;
    const quick = event && event.type !== "pointercancel" && event.type !== "lostpointercapture" &&
      drag.moved < CLICK_SLOP && performance.now() - drag.down < CLICK_MS;
    const vx = drag.vx;
    const vy = drag.vy;
    const grabX = drag.grabX;
    const grabY = drag.grabY;
    drag = null;
    node.classList.remove("is-dragging");
    try {
      if (event) node.releasePointerCapture && node.releasePointerCapture(event.pointerId);
    } catch (err) {
    }
    if (quick) {
      speak();
      return;
    }
    const speed = Math.hypot(vx, vy);
    const radius = Math.max(1, cellH * 0.42);
    angularVelocity = Math.max(-8, Math.min(8, -(grabX * vy - grabY * vx) / (radius * radius) * 5));
    falling = true;
    if (speed > MIN_THROW_SPEED && !reducedMotion) {
      velocity = { x: vx, y: vy };
    } else {
      velocity = { x: reducedMotion ? 0 : vx * 0.2, y: 0 };
      if (reducedMotion) angularVelocity = 0;
    }
    setState("fear", 0);
  }

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener("pointerdown", onDocPointer, true);
  }

  function onDocPointer(event) {
    if (menu && !menu.contains(event.target)) closeMenu();
  }

  function openMenu(event) {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "pet-menu";
    menu.setAttribute("role", "menu");
    const items = [
      { label: "说一句", run: speak },
      {
        label: "走一走",
        run: () => {
          facing = Math.random() < 0.5 ? 1 : -1;
          velocity.x = 90 * facing;
          setState(facing >= 0 ? "walk-right" : "walk-left", 3200);
        }
      },
      {
        label: "跑两步",
        run: () => {
          facing = Math.random() < 0.5 ? 1 : -1;
          velocity.x = 240 * facing;
          setState("run", 2200);
        }
      },
      { label: "鼓个掌", run: () => setState("cheer", 2000) },
      { label: "想一想", run: () => setState("review", 4000) },
      { label: "躲起来", run: hide }
    ];
    items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pet-menu-item";
      row.setAttribute("role", "menuitem");
      row.textContent = item.label;
      row.addEventListener("click", () => {
        closeMenu();
        wake();
        item.run();
      });
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    const rect = node.getBoundingClientRect();
    const width = menu.offsetWidth || 132;
    const height = menu.offsetHeight || 150;
    menu.style.left = Math.max(6, Math.min(window.innerWidth - width - 6, rect.left)) + "px";
    menu.style.top = Math.max(6, Math.min(viewport().height - height - 6, rect.top - height - 6)) + "px";
    document.addEventListener("pointerdown", onDocPointer, true);
  }

  function hide() {
    try {
      localStorage.setItem("nai-pet-off", "1");
    } catch (err) {
    }
    if (node) node.hidden = true;
    applyTransform();
    closeMenu();
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (typeof config.onHide === "function") config.onHide();
  }

  function show() {
    try {
      localStorage.removeItem("nai-pet-off");
    } catch (err) {
    }
    if (!node) return;
    node.hidden = false;
    applyTransform();
    if (!frameId) {
      lastTick = performance.now();
      frameId = window.requestAnimationFrame(tick);
    }
    wake();
  }

  function isHidden() {
    return !node || node.hidden;
  }

  function resizeSprite(height) {
    cellH = height;
    cellW = Math.round(cellH * (Number(config.frameWidth) || 192) / (Number(config.frameHeight) || 208));
    node.style.setProperty("--pet-h", cellH + "px");
    node.style.setProperty("--pet-w", cellW + "px");
    paintFrame();
  }

  function prepareIntro(onStart) {
    if (!node) return false;
    intro = { phase: "waiting", elapsed: 0, normalSize: cellH, wasHidden: node.hidden, onStart };
    node.hidden = false;
    node.classList.add("is-intro-pet");
    node.style.zIndex = "10000";
    node.setAttribute("aria-label", "奶蛙表情包，点击奶蛙开始浏览奶-hub");
    resizeSprite(Math.round(Math.min(260, Math.max(180, Math.min(viewport().width * 0.5, viewport().height * 0.32)))));
    x = (viewport().width - cellW) / 2;
    y = (viewport().height - cellH) / 2;
    setState("sleep", 0);
    bubble.textContent = "奶蛙表情包";
    bubble.hidden = false;
    bubble.classList.add("pet-intro-label");
    bubble.classList.add("is-on");
    applyTransform();
    if (!frameId) {
      lastTick = performance.now();
      frameId = requestAnimationFrame(tick);
    }
    return true;
  }

  function fleeIntro() {
    if (!intro) return Promise.resolve();
    intro.phase = "flee";
    intro.elapsed = 0;
    bubble.hidden = true;
    node.tabIndex = -1;
    setState("walk-right", 0);
    return new Promise((resolve) => { intro.resolve = resolve; });
  }

  function fearIntro() {
    if (!intro) return Promise.resolve();
    const fear = animationFor("fear");
    if (!fear) return Promise.resolve();
    intro.phase = "fear";
    intro.elapsed = 0;
    intro.fearDuration = fear.durations.reduce((total, duration) => total + duration, 0);
    intro.pauseDuration = 0;
    bubble.hidden = true;
    node.tabIndex = -1;
    setState("fear", 0);
    return new Promise((resolve) => { intro.resolve = resolve; });
  }

  function returnIntro(onCheer) {
    if (!intro) return Promise.resolve();
    resizeSprite(intro.normalSize);
    x = viewport().width + cellW;
    y = 0;
    node.hidden = false;
    node.style.zIndex = String(Z_INDEX);
    intro.phase = "return";
    intro.elapsed = 0;
    intro.target = Math.max(8, viewport().width - cellW - Math.max(70, viewport().width * 0.17));
    intro.onCheer = onCheer;
    setState("walk-left", 0);
    applyTransform();
    return new Promise((resolve) => { intro.resolve = resolve; });
  }

  function cancelIntro() {
    if (!intro || !node) return;
    const previous = intro;
    intro = null;
    if ((previous.phase === "fear" || previous.phase === "pause" || previous.phase === "cheer") && typeof config.stopVoice === "function") config.stopVoice();
    resizeSprite(previous.normalSize);
    node.classList.remove("is-intro-pet");
    node.style.zIndex = String(Z_INDEX);
    node.setAttribute("aria-label", "奶蛙桌宠，按 Enter 让它说一句话，按住可以拖动");
    node.tabIndex = paused ? -1 : 0;
    bubble.hidden = true;
    bubble.classList.remove("pet-intro-label");
    falling = false;
    rotation = 0;
    angularVelocity = 0;
    x = clampX(x);
    y = 0;
    node.hidden = previous.wasHidden;
    setState("idle", 2000);
    wake();
    applyTransform();
    if (previous.resolve) previous.resolve();
  }

  function tickIntro(dt) {
    intro.elapsed += dt;
    if (intro.phase === "fear" && intro.elapsed >= intro.fearDuration / 1000) {
      intro.phase = "pause";
      intro.elapsed = 0;
      frameIndex = Math.max(0, (anim.durations || []).length - 1);
      frameElapsed = 0;
      paintFrame();
    } else if (intro.phase === "pause" && intro.elapsed >= intro.pauseDuration / 1000) {
      intro.phase = "fear-ready";
      const resolve = intro.resolve;
      intro.resolve = null;
      if (resolve) resolve();
    } else if (intro.phase === "flee") {
      // 惊恐和短暂停顿结束后加速逃走，保持行走素材的真实朝向。
      if (intro.elapsed > 0.14) x += Math.min(1800, 420 + (intro.elapsed - 0.14) * 2600) * dt;
      if (x > viewport().width + cellW) {
        intro.phase = "away";
        node.hidden = true;
        const resolve = intro.resolve;
        intro.resolve = null;
        if (resolve) resolve();
      }
      applyTransform();
    } else if (intro.phase === "return") {
      x = Math.max(intro.target, x - Math.max(220, viewport().width * 0.24) * dt);
      applyTransform();
      if (x <= intro.target) {
        intro.phase = "cheer";
        intro.elapsed = 0;
        setState("cheer", 0);
        if (intro.onCheer) intro.onCheer();
      }
    } else if (intro.phase === "cheer" && intro.elapsed >= 15) {
      cancelIntro();
    }
  }

  function build() {
    node = document.createElement("div");
    node.className = "pet";
    node.id = "naiPet";
    node.style.zIndex = String(Z_INDEX);
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", "奶蛙桌宠，按 Enter 让它说一句话，按住可以拖动");

    bubble = document.createElement("div");
    bubble.className = "pet-bubble";
    bubble.setAttribute("aria-live", "polite");
    bubble.hidden = true;

    sprite = document.createElement("div");
    sprite.className = "pet-sprite";
    sprite.setAttribute("aria-hidden", "true");

    node.appendChild(bubble);
    node.appendChild(sprite);
    document.body.appendChild(node);

    const fw = Number(config.frameWidth) > 0 ? Number(config.frameWidth) : 192;
    const fh = Number(config.frameHeight) > 0 ? Number(config.frameHeight) : 208;
    cellH = Math.max(24, Math.min(400, Number(config.size) || 104));
    cellW = Math.round((cellH * fw) / fh);
    node.style.setProperty("--pet-h", cellH + "px");
    node.style.setProperty("--pet-w", cellW + "px");
    node.style.setProperty("--pet-cols", String(Number(config.columns) || 8));
    node.style.setProperty("--pet-rows", String(Number(config.rows) || 9));
    // 素材地址必须直接写进 background-image：放进 CSS 自定义属性时，
    // url() 会按消费它的样式表位置解析，相对路径会指到 assets/css/ 下面。
    sprite.style.backgroundImage = 'url("' + config.sheet + '")';
    paintFrame();

    node.addEventListener("pointerdown", (event) => {
      if (intro) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      wake();
      closeMenu();
      beginDrag(event);
    });
    node.addEventListener("pointermove", moveDrag);
    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
    node.addEventListener("lostpointercapture", endDrag);
    node.addEventListener("dblclick", () => {
      if (intro) return;
      wake();
      setState("cheer", 1800);
    });
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (intro) return;
      wake();
      openMenu(event);
    });
    node.addEventListener("keydown", (event) => {
      if (intro) {
        if (intro.phase === "waiting" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          intro.onStart();
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        wake();
        speak();
      } else if (event.key === "ArrowLeft") {
        wake();
        facing = -1;
        velocity.x = -90;
        setState("walk-left", 1200);
      } else if (event.key === "ArrowRight") {
        wake();
        facing = 1;
        velocity.x = 90;
        setState("walk-right", 1200);
      }
    });
    node.addEventListener("click", () => {
      if (intro && intro.phase === "waiting") intro.onStart();
      else if (intro && intro.phase === "cheer") cancelIntro();
    });
    window.addEventListener("resize", () => {
      if (!node) return;
      if (intro) return;
      x = clampX(x);
      const floor = floorClearance(rotation);
      y = Math.min(Math.max(floor, y), Math.max(floor, viewport().height - node.offsetHeight));
      applyTransform();
    });
  }

  function start(options) {
    if (
      running ||
      !options ||
      !options.sheet ||
      !Array.isArray(options.animations) ||
      !options.animations.some((item) => item && item.id === "idle")
    ) {
      return;
    }
    running = true;
    config = options;
    falling = false;
    const sheet = new Image();
    sheet.onload = () => {
      try { loadFrameHulls(sheet); } catch (err) { frameHulls = null; }
    };
    sheet.src = config.sheet;
    reducedMotion = prefersReducedMotion();
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = (event) => {
        reducedMotion = event.matches;
      };
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
      else if (typeof mq.addListener === "function") mq.addListener(onChange);
    }

    build();
    x = Math.max(8, viewport().width - cellW - 40);
    y = groundY();
    setState("idle", 1400);
    applyTransform();

    let stored = null;
    try {
      stored = localStorage.getItem("nai-pet-off");
    } catch (err) {
    }
    if (stored === "1") {
      node.hidden = true;
      if (typeof config.onHide === "function") config.onHide();
      return;
    }

    wake();
    lastTick = performance.now();
    frameId = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    window.cancelAnimationFrame(frameId);
    window.clearInterval(sleepTimer);
    window.clearTimeout(bubbleTimer);
    frameId = 0;
    drag = null;
    sleepTimer = 0;
    if (node) node.remove();
    node = sprite = bubble = null;
    closeMenu();
    running = false;
    intro = null;
  }

  function setPaused(value) {
    paused = !!value;
    if (!node) return;
    node.classList.toggle("is-paused", paused);
    node.tabIndex = paused ? -1 : 0;
    if (paused) {
      closeMenu();
      if (isMoving() || state === "cheer") setState("idle", 0);
    } else {
      wake();
      if (state === "idle" && !stateUntil) setState("idle", 1400);
    }
  }

  window.NaiPet = {
    start: start,
    stop: stop,
    show: show,
    hide: hide,
    setPaused: setPaused,
    isHidden: isHidden,
    prepareIntro: prepareIntro,
    fearIntro: fearIntro,
    fleeIntro: fleeIntro,
    returnIntro: returnIntro,
    cancelIntro: cancelIntro
  };
})();
