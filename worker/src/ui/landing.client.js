// Landing page behaviour (served at /assets/landing.js): the contents rail and Fig 1.
//
// Fig 1 is static SVG built by landing/build.mjs; this only moves its parts. One send is a pure
// function of time since it started (`pose(t)`), stepped by one requestAnimationFrame loop that
// runs only while the figure is on screen. Under prefers-reduced-motion a send jumps straight to
// its end state, and there is no idle tour.

// ── contents rail: mark the section being read ───────────────────────────
{
  const links = new Map(
    [...document.querySelectorAll('.toc a[href^="#"]:not(.brand)')].map((a) => [a.getAttribute("href").slice(1), a]),
  );
  const seen = new Map();
  const mark = () => {
    const ids = [...links.keys()];
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    const current = atEnd ? ids.at(-1) : ids.find((id) => seen.get(id));
    links.forEach((a, id) => a.setAttribute("aria-current", String(id === current)));
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      mark();
    },
    { rootMargin: "-15% 0px -70% 0px" },
  );
  for (const id of links.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
  addEventListener("scroll", mark, { passive: true });
}

// ── Fig 1 ─────────────────────────────────────────────────────────────────
const stage = document.querySelector("[data-figure]");
if (stage) figure(stage);

function figure(stage) {
  const F = JSON.parse(stage.getAttribute("data-figure"));
  const plate = stage.closest(".iso-plate");
  const part = (name) => stage.querySelector(`[data-part="${name}"]`);
  const el = {
    letter: part("letter"),
    drop: part("drop"),
    drawer: part("drawer"),
    drawerClip: part("drawer-clip"),
    head: part("head"),
    rod: part("head-rod"),
    seams: part("seams"),
    striker: part("striker"),
    bell: part("bell"),
    readerLamp: part("reader-lamp"),
    lamp: part("lamp"),
    pulse: part("pulse"),
    hit: part("hit"),
    digits: [...stage.querySelectorAll("[data-flap]")],
  };
  const readout = plate.querySelector("[data-readout]");
  const status = plate.querySelector("[data-status]");
  const send = plate.querySelector("[data-send]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const CODES = ["730564", "195208", "664031", "908417", "482913"];
  const address = F.address;
  const inbox = address.split("@")[0];
  let next = 0;

  // ── geometry helpers ──
  const move = (node, [ax, ay], d) => {
    if (!node) return;
    if (Math.abs(d) < 1e-3) node.removeAttribute("transform");
    else node.setAttribute("transform", `translate(${(ax * d).toFixed(2)} ${(ay * d).toFixed(2)})`);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => {
    x = clamp01(x);
    return x * x * (3 - 2 * x);
  };
  const easeInOut = (x) => {
    x = clamp01(x);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  const hull = (points) => {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
      const h = [];
      for (const q of list) {
        while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
        h.push(q);
      }
      return h.slice(0, -1);
    };
    return [...half(p), ...half(p.reverse())];
  };
  const pathOf = (points) => "M" + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
  const span = (t, a, b) => clamp01((t - a) / (b - a));
  const bump = (t, a, b) => Math.sin(Math.PI * span(t, a, b)); // 0 → 1 → 0
  const wire = F.wire;
  const wireLen = [0];
  for (let i = 1; i < wire.length; i++) wireLen.push(wireLen[i - 1] + Math.hypot(wire[i][0] - wire[i - 1][0], wire[i][1] - wire[i - 1][1]));
  const along = (f) => {
    const target = f * wireLen.at(-1);
    let i = 1;
    while (i < wire.length - 1 && wireLen[i] < target) i++;
    const s = (target - wireLen[i - 1]) / (wireLen[i] - wireLen[i - 1] || 1);
    return [wire[i - 1][0] + (wire[i][0] - wire[i - 1][0]) * s, wire[i - 1][1] + (wire[i][1] - wire[i - 1][1]) * s];
  };

  // ── one send, as a function of time (seconds since it started) ──
  const T = { drop: [0.35, 1.05], drawer: [1.0, 1.9], toReader: [1.7, 3.3], stamp: [3.35, 4.15], toCell: [4.3, 6.0], ring: 6.05, pulse: [6.1, 6.65], flaps: 6.7, end: 8.2 };
  const L = F.letter;
  const letterY = (t) => {
    if (t < T.toReader[0]) return L.start;
    if (t < T.toCell[0]) return L.start + (L.read - L.start) * easeInOut(span(t, ...T.toReader));
    return L.read + (L.rest - L.read) * easeInOut(span(t, ...T.toCell));
  };
  const phaseAt = (t) =>
    t < T.drawer[0] ? 0 : t < T.toReader[1] ? 1 : t < T.toCell[0] ? 2 : t < T.ring ? 3 : t < T.flaps + 0.6 ? 4 : 5;
  const PHASES = [
    () => `mail for ${inbox} arriving`,
    () => `accepted · raw .eml filed in R2`,
    (code) => `extracted · code ${code}`,
    () => `stored in D1 · inbox ${inbox}`,
    () => `signal · the waiting call wakes`,
    (code) => `wait returned ${code}`,
  ];
  const SPOKEN = [
    "",
    "Accepted. The raw message is filed.",
    "The reader found the code.",
    "Stored in the inbox.",
    "",
    (code) => `The waiting call returned code ${code.split("").join(" ")}.`,
  ];

  let run = null; // { t, code, flapsDone }
  let shown = "482913";
  let lastPhase = -1;

  function pose(t, code) {
    // the letter that was in the pigeonhole fades out; this one drops in from above the slot
    const y = letterY(t);
    if (el.letter) {
      el.letter.setAttribute("opacity", t < T.toReader[0] ? (1 - span(t, 0, 0.35)).toFixed(3) : "1");
      move(el.letter, F.vy, t < T.toReader[0] ? 0 : y - L.rest);
    }
    if (el.drop) {
      const shown = t < T.drop[1] ? span(t, 0.05, 0.35) : 0;
      el.drop.setAttribute("opacity", shown.toFixed(3));
      const f = span(t, ...T.drop);
      move(el.drop, F.vz, F.drop * f * f);
    }
    const out = F.drawer * bump(t, ...T.drawer) ** 0.8;
    move(el.drawer, F.vy, out);
    if (el.drawerClip) {
      // the clip lives inside the moving group, so the face stays put by moving it back
      const shift = F.drawerFace.map(([x, y]) => [x - F.vy[0] * out, y - F.vy[1] * out]);
      el.drawerClip.setAttribute("d", out < 0.02 ? "" : pathOf(hull([...F.drawerFace, ...shift])));
    }
    // the belt runs while the letter rides it
    if (el.seams) {
      const travel = y - L.start;
      move(el.seams, F.vy, ((travel % F.seam) - F.seam) % F.seam);
    }
    const stamp = -F.stamp * ease(bump(t, ...T.stamp));
    move(el.head, F.vz, stamp);
    move(el.rod, F.vz, stamp);
    toggle(el.readerLamp, t > T.stamp[0] + 0.15 && t < T.stamp[1] + 0.4);
    // the bell: the striker taps the rim, the bell shivers
    const hit = t >= T.ring ? t - T.ring : -1;
    move(el.striker, F.vx, hit < 0 ? 0 : -F.strike * (hit < 0.07 ? hit / 0.07 : Math.exp(-(hit - 0.07) * 14)));
    if (el.bell) {
      const shiver = hit < 0 ? 0 : 0.45 * Math.sin(hit * 70) * Math.exp(-hit * 7);
      if (Math.abs(shiver) < 0.01) el.bell.removeAttribute("transform");
      else el.bell.setAttribute("transform", `translate(${shiver.toFixed(2)} 0)`);
    }
    // the signal runs down the cable to the console
    if (el.pulse) {
      const f = span(t, ...T.pulse);
      const on = t > T.pulse[0] && t < T.pulse[1] + 0.15;
      const [x, yy] = along(ease(f));
      el.pulse.setAttribute("cx", x.toFixed(1));
      el.pulse.setAttribute("cy", yy.toFixed(1));
      el.pulse.setAttribute("opacity", on ? (1 - span(t, T.pulse[1], T.pulse[1] + 0.15)).toFixed(2) : "0");
    }
    toggle(el.lamp, t >= T.pulse[1]);
    flaps(t, code);
    const phase = phaseAt(t);
    say(PHASES[phase](code));
    if (phase !== lastPhase) {
      lastPhase = phase;
      const spoken = SPOKEN[phase];
      if (spoken && status) status.textContent = typeof spoken === "function" ? spoken(code) : spoken;
    }
  }

  // split-flap: blank at the start (the call is waiting), then each module riffles to its digit
  function flaps(t, code) {
    el.digits.forEach((d, i) => {
      let ch;
      const blankAt = 0.1 + i * 0.05;
      const landAt = T.flaps + 0.18 * i + 0.35;
      if (t < blankAt) ch = shown[i];
      else if (t < T.flaps + 0.18 * i) ch = "–";
      else if (t < landAt) ch = String((Number(code[i]) + 1 + Math.floor((landAt - t) / 0.07)) % 10);
      else ch = code[i];
      if (d.textContent !== ch) d.textContent = ch;
      const fresh = t >= landAt && t < T.end + 1.2;
      if (fresh !== d.hasAttribute("data-fresh")) fresh ? d.setAttribute("data-fresh", "") : d.removeAttribute("data-fresh");
    });
  }

  function toggle(node, on) {
    if (!node) return;
    if (on !== node.hasAttribute("data-on")) on ? node.setAttribute("data-on", "") : node.removeAttribute("data-on");
  }
  function say(text) {
    if (readout && readout.textContent !== text) readout.textContent = text;
  }

  // ── loop ──
  let frame = 0;
  let last = 0;
  let visible = false;
  let tourTimer = 0;
  let idleSince = performance.now();
  let interacted = false;

  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    frame = 0;
    if (!run) return;
    run.t += dt;
    pose(run.t, run.code);
    if (run.t >= T.end + 1.2) {
      finish();
      return;
    }
    if (visible) frame = requestAnimationFrame(tick);
  }
  function kick() {
    if (!frame && visible && run) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  function finish() {
    shown = run.code;
    run = null;
    idleSince = performance.now();
    schedule();
  }
  function start() {
    // A send while one is running replays from the top with the next code.
    const code = CODES[next++ % CODES.length];
    lastPhase = -1;
    if (still.matches) {
      // no motion: show where the send ends up
      run = { t: T.end + 1.2, code };
      pose(run.t, code);
      finish();
      return;
    }
    run = { t: 0, code };
    kick();
  }
  function schedule() {
    clearTimeout(tourTimer);
    if (still.matches || !visible) return;
    // The idle tour: send again after a pause, unless the reader is busy with the figure.
    const wait = interacted ? 6500 : 1400;
    tourTimer = setTimeout(() => {
      if (!visible || run) return;
      if (stage.matches(":hover") || stage.matches(":focus-visible")) return schedule();
      start();
    }, Math.max(0, wait - (performance.now() - idleSince)));
  }
  const user = () => {
    interacted = true;
    clearTimeout(tourTimer);
    start();
  };

  new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) {
        kick();
        if (!run) schedule();
      } else clearTimeout(tourTimer);
    },
    { rootMargin: "120px 0px" },
  ).observe(stage);

  if (send) {
    send.hidden = false;
    send.addEventListener("click", user);
  }
  const hint = plate.querySelector("[data-hint]");
  if (hint) {
    hint.textContent = "or click the intake box";
    if (send) hint.style.left = `${send.offsetWidth + 10}px`;
  }
  if (el.hit) el.hit.addEventListener("click", user);
  stage.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      user();
    }
  });
  stage.addEventListener("focus", () => {
    if (status && !status.textContent) status.textContent = `Inbox ${inbox}: the last code was ${shown.split("").join(" ")}.`;
  });
}
