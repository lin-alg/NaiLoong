(function () {
  "use strict";

  // 网页桌宠：素材和动作表用 petdex 的雪碧图规格（8 列 × 192×208，一行一个动作，
  // 每帧时长逐帧给出），行为参考 MIT 协议的 dsh-pet（漫游、随机动作、点击回应、
  // 拖拽甩抛后抛物线落地反弹、空闲睡觉、说话气泡）。零依赖、零构建。
  const WALK_SPEED = [60, 130];
  const RUN_SPEED = [200, 300];
  const FALL_GRAVITY = 2200;
  const BOUNCE_DAMP = 0.42;
  const FRICTION = 0.72;
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
  let drag = null;
  let frameId = 0;
  let lastTick = 0;
  let stateUntil = 0;
  let lastTouch = 0;
  let sleepTimer = 0;
  let bubbleTimer = 0;
  let menu = null;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function groundY() {
    return 0;
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
    frameElapsed += ms;
    let guard = 0;
    while (frameElapsed >= (anim.durations[frameIndex] || 120) && guard++ < 60) {
      frameElapsed -= anim.durations[frameIndex] || 120;
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
    if (state !== "run" && state !== wanted) setState(wanted, 0);
  }

  function applyTransform() {
    if (!node) return;
    node.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(-y) + "px,0)";
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
    advanceFrame(dt * 1000);

    if (state === "fall") {
      velocity.y -= FALL_GRAVITY * dt;
      x += velocity.x * dt;
      y += velocity.y * dt;
      const limit = Math.max(0, viewport().width - petWidth() - 8);
      if (x < 4) {
        x = 4;
        velocity.x = Math.abs(velocity.x) * BOUNCE_DAMP;
      } else if (x > limit) {
        x = limit;
        velocity.x = -Math.abs(velocity.x) * BOUNCE_DAMP;
      }
      if (y <= groundY()) {
        y = groundY();
        if (Math.abs(velocity.y) > 160) {
          velocity.y = -velocity.y * BOUNCE_DAMP;
          velocity.x *= FRICTION;
          squash();
        } else if (Math.abs(velocity.x) > 24) {
          velocity.y = 0;
          velocity.x *= Math.pow(FRICTION, dt * 6);
        } else {
          velocity.x = 0;
          velocity.y = 0;
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
      if (state !== "idle") setState("idle", 0);
      else if (!reducedMotion) pickIdleAction();
      else setState("idle", 3000);
      if (Date.now() - lastTouch > SLEEP_AFTER) setState("sleep", 0);
    }
  }

  function squash() {
    if (reducedMotion || !node) return;
    node.classList.remove("is-squash");
    void node.offsetWidth;
    node.classList.add("is-squash");
    window.setTimeout(() => node && node.classList.remove("is-squash"), 260);
  }

  function wake() {
    lastTouch = Date.now();
    if (state === "sleep") setState("idle", 1600);
    if (!sleepTimer) {
      sleepTimer = window.setInterval(() => {
        if (Date.now() - lastTouch > SLEEP_AFTER && !drag && state === "idle") setState("sleep", 0);
      }, 3000);
    }
  }

  function showBubble(text) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
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
    setState("talk", 1700);
    showBubble(line.text || "");
    if (typeof config.play === "function") config.play(line.src);
  }

  function beginDrag(event) {
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
    y = Math.max(0, viewport().height - (event.clientY - drag.dy) - rect.height);
    facing = stepX > 0.6 ? 1 : stepX < -0.6 ? -1 : facing;
    applyTransform();
  }

  function endDrag(event) {
    if (!drag || (event && drag.id !== event.pointerId)) return;
    const quick = drag.moved < CLICK_SLOP && performance.now() - drag.down < CLICK_MS;
    const vx = drag.vx;
    const vy = drag.vy;
    drag = null;
    node.classList.remove("is-dragging");
    try {
      node.releasePointerCapture && node.releasePointerCapture(event.pointerId);
    } catch (err) {
    }
    if (quick) {
      speak();
      return;
    }
    const speed = Math.hypot(vx, vy);
    if (speed > MIN_THROW_SPEED && !reducedMotion) {
      velocity = { x: vx, y: vy };
      setState("fall", 0);
    } else {
      velocity = { x: 0, y: 0 };
      setState("fall", 0);
    }
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
    menu.style.top = Math.max(6, rect.top - height - 6) + "px";
    document.addEventListener("pointerdown", onDocPointer, true);
  }

  function hide() {
    try {
      localStorage.setItem("nai-pet-off", "1");
    } catch (err) {
    }
    if (node) node.hidden = true;
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
    if (!frameId) {
      lastTick = performance.now();
      frameId = window.requestAnimationFrame(tick);
    }
    wake();
  }

  function isHidden() {
    return !node || node.hidden;
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
      if (event.button !== 0 && event.pointerType === "mouse") return;
      wake();
      closeMenu();
      beginDrag(event);
    });
    node.addEventListener("pointermove", moveDrag);
    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
    node.addEventListener("dblclick", () => {
      wake();
      setState("cheer", 1800);
    });
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      wake();
      openMenu(event);
    });
    node.addEventListener("keydown", (event) => {
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
    window.addEventListener("resize", () => {
      x = clampX(x);
      applyTransform();
    });
  }

  function start(options) {
    if (
      running ||
      !options ||
      !options.sheet ||
      !Array.isArray(options.animations) ||
      !options.animations.length
    ) {
      return;
    }
    running = true;
    config = options;
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
    sleepTimer = 0;
    if (node) node.remove();
    node = sprite = bubble = null;
    closeMenu();
    running = false;
  }

  function setPaused(value) {
    paused = !!value;
    if (!node) return;
    node.classList.toggle("is-paused", paused);
    if (paused) {
      closeMenu();
      if (isMoving() || state === "cheer") setState("idle", 0);
    } else {
      wake();
    }
  }

  window.NaiPet = {
    start: start,
    stop: stop,
    show: show,
    hide: hide,
    setPaused: setPaused,
    isHidden: isHidden
  };
})();
