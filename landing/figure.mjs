// Fig 1 on the landing page: a small mail-sorting bench, drawn with the anatomy kit
// (./kit, MIT). Built once in Node by scripts/build.mjs into worker/src/ui/landing-figure.ts:
// static SVG (the page reads without JavaScript) plus the few numbers the live script needs.
//
// The object is the explanation, and every station is a step the Worker really takes for
// one email (worker/src/email/receive.ts):
//   intake box, slot on top   Email Routing's catch-all hands the message to the Worker
//   drawer in the intake box  the raw .eml is filed in R2 before anything else
//   reader on the gantry      postal-mime parses it and the extractor pulls out the code
//   pigeonhole cabinet        D1: one pigeonhole per inbox, the letter lands in its own
//   bell on the cabinet       the inbox's Durable Object (InboxSignal) is signalled
//   split-flap console        the waiting `wait` call returns, with the code
//
// World units are about 1 px; x and y lie on the bench, z is up. The camera looks from +x, +y.

import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";

export const WIDTH = 760;
export const HEIGHT = 470;
const AZIMUTH = 55;

// ── plan ───────────────────────────────────────────────────────────────
const PLATE = { x: -72, y: -46, w: 198, d: 214, r: 10 };
const PLATE_H = 9;
const FOOT_H = 5;

// pigeonhole cabinet (D1): 5 columns × 3 rows, open toward +y
const CAB = { x: -62, y: -36, w: 124, d: 36, r: 1.2 };
const CAB_Z0 = 4;
const WALL = 2.4;
const COLS = 5;
const ROWS = 3;
const CELL_W = (CAB.w - WALL * (COLS + 1)) / COLS;
const CELL_H = 15;
const CAB_Z1 = CAB_Z0 + WALL * (ROWS + 1) + CELL_H * ROWS;
const CELL_D = 32;
const cellX = (c) => CAB.x + WALL + c * (CELL_W + WALL);
const cellZ = (r) => CAB_Z0 + WALL + r * (CELL_H + WALL);
const TARGET = { col: 3, row: 1 };
const CORNICE = { x: CAB.x - 2, y: CAB.y - 2, w: CAB.w + 4, d: CAB.d + 3.2, r: 1.6 };
const DECK = CAB_Z1 + 2.6;

// conveyor
const BX = cellX(TARGET.col) + CELL_W / 2;
const BELT_TOP = cellZ(TARGET.row);
const BELT_HALF = 10;
const BELT_Y0 = 1.6;
const BELT_Y1 = 124;
const ROLLER_R = 3;
const ROLLER_Z = BELT_TOP - ROLLER_R;
const ROLLERS = [BELT_Y0 + ROLLER_R + 0.4, BELT_Y1 - ROLLER_R - 0.4];
const FRAME_IN = BELT_HALF + 0.7;
const FRAME_OUT = FRAME_IN + 2.4;
const FRAME_Z0 = ROLLER_Z - 4.6;
const FRAME_Z1 = ROLLER_Z + 1.4;
const SEAM_GAP = 7;

// letter (the email)
const LET = { w: 16, d: 11, h: 0.8 };
const LETTER_REST_Y = -2.6 - LET.d / 2; // resting in its pigeonhole, just inside the opening
const LETTER_START_Y = 133; // inside the intake box, before it shows behind it

// reader gantry (the extractor)
const GY = 72;
const POST = 2.8;
const POST_X = [BX - FRAME_OUT - 3.6, BX + FRAME_OUT + 3.6];
const BEAM_Z0 = 50;
const BEAM_Z1 = 55;
const CAR = { x: BX - 5.5, y: GY - 4.5, w: 11, d: 9, r: 1.2 };
const CAR_Z0 = 47;
const CAR_Z1 = 58;
const HEAD_Z0 = 35;
const HEAD_Z1 = 42;
const STAMP = 7.5;

// intake box (Email Routing → the Worker)
const HOP = { x: BX - 17, y: 126, w: 34, d: 32, r: 2.2 };
const HOP_Z0 = 3;
const HOP_Z1 = 42;
const LID = k.insetPlan(HOP, -1.2);
const LID_TOP = HOP_Z1 + 2;
const SLOT = { x: BX - 10.5, y: 140.4, w: 21, d: 3, r: 1.4 };
const SLOT_Y = SLOT.y + SLOT.d / 2;
const DROP = { z0: LID_TOP + 13, z1: LID_TOP - 16 }; // bottom edge of the falling letter, start → end
const DRAWER = { x: BX - 12, z0: HOP_Z0 + 2.4, z1: HOP_Z0 + 12.6, out: 9 };

// bell on the cabinet (the inbox's Durable Object)
const BELL = { x: BX, y: -15, rim: 7.2, z: DECK + 7.4, top: DECK + 15.4 };
const SOL = { x: BX + 15.6, y: BELL.y - 4.2, w: 8.4, d: 8.4, r: 1 };
const SOL_Z1 = DECK + 11;
const STRIKE = 0.9;

// console with the split-flap readout (the waiting `wait` call)
const CON = { x: 68, y: 62, w: 50, d: 24, r: 2.6 };
const CON_Z0 = 4.4;
const CON_Z1 = 31;
const FLAP = { w: 5.6, h: 10.2, gap: 0.9, mid: 3.2, z0: 12.2 };

export function buildFigure() {
  const pts = [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    // The cabinet's top is the highest edge on screen; without it the fit lets it overflow.
    ...k.boxCorners(CAB, CAB_Z0, CAB_Z1 + 3),
    [BELL.x, BELL.y, BELL.top + 2],
    [SOL.x, SOL.y, SOL_Z1],
    [HOP.x, HOP.y + HOP.d, DROP.z0 + 12],
  ];
  const P = k.fitProjection(pts, WIDTH, HEIGHT, { pad: 16, headroom: 12, azimuth: AZIMUTH });
  const at = (p) => k.iso(p, P);
  const depth = (p) => k.depthOf(p, P);
  const fmt = (n) => +n.toFixed(2);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (points, style) => k.dotsSvg(points, style);
  const box = (plan, z, h, style = {}, steps = 3, bevel = 0.4) => S(k.slabOf(plan, z, h, P, steps, bevel), style);
  const poly = (points, cls, extra = "") => `<path class="${cls}" d="${k.pathOf(points.map(at), true)}"${extra}/>`;
  const hull = (points) => k.pathOf(G.hullOf(points.map(at)), true);
  const screws = (list, size = 0.45) => D(list.map(at), { size });
  const byDepth = (list) => [...list].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
  const line = (tone, d, extra = "") => `<path class="iso-line" data-tone="${tone}" d="${d}"${extra}/>`;
  // flat 2D (x right, y down) mapped onto a plane through `o`, spanned by world `right` and `down`
  const planeMatrix = (o, right, down) => {
    const O = at(o);
    const R = at([o[0] + right[0], o[1] + right[1], o[2] + right[2]]);
    const Dn = at([o[0] + down[0], o[1] + down[1], o[2] + down[2]]);
    return `matrix(${fmt(R[0] - O[0])} ${fmt(R[1] - O[1])} ${fmt(Dn[0] - O[0])} ${fmt(Dn[1] - O[1])} ${fmt(O[0])} ${fmt(O[1])})`;
  };
  // a +y face at y: local (u, v) = (x, −z); a +x face at x: local (u, v) = (−y, −z)
  const onFaceY = (y, inner) => `<g transform="${planeMatrix([0, y, 0], [1, 0, 0], [0, 0, -1])}">${inner}</g>`;
  const onFaceX = (x, inner) => `<g transform="${planeMatrix([x, 0, 0], [0, -1, 0], [0, 0, -1])}">${inner}</g>`;
  const rr = (x0, y0, x1, y1, r, steps = 4) => k.pathOf(k.roundedPlan({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r }, steps), true);
  const halo = (plan, z = 0, h = 3, blur = 5) => `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}" style="filter:blur(${blur}px)"/>`;
  const out = [];
  const defs = [];

  // ── bench plate ──────────────────────────────────────────────────────
  {
    out.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
    for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
      out.push(S(k.cylinder(x, y, 7.5, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
      out.push(S(k.cylinder(x, y, 5.8, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
    }
    out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -3.6, P, 8), { tone: "faint" }) }));
    out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
    const corners = k.corners(PLATE, 10.5);
    out.push(L(corners.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
    out.push(D(corners.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
    // ruler strip along the front (+y) edge
    const strip = { x: 47, y: PLATE.y + PLATE.d - 14.5, w: 72, d: 7, r: 1 };
    out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
    const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P, "x");
    out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
    out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
    // label plate in the front corner
    const label = { x: -62, y: PLATE.y + PLATE.d - 19, w: 26, d: 11, r: 1.2 };
    out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
    out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
    out.push(L([22, 16, 19].map((w, i) => k.lineOnTop([label.x + 4, label.y + 3.6 + i * 2.9], [label.x + 4 + w, label.y + 3.6 + i * 2.9], 0.8, P)).join(""), { tone: "lo", free: true }));
    out.push(D([at([label.x + 2.2, label.y + label.d / 2, 0.8]), at([label.x + label.w - 2.2, label.y + label.d / 2, 0.8])], { size: 0.45 }));
  }

  // ── pigeonhole cabinet ───────────────────────────────────────────────
  // letters already filed in other inboxes: [col, row, count]
  const FILED = [[0, 2, 2], [1, 0, 1], [2, 2, 1], [4, 1, 3], [0, 0, 1], [2, 1, 1], [4, 2, 1]];
  {
    const plinth = { x: CAB.x + 2, y: CAB.y + 2, w: CAB.w - 4, d: CAB.d - 3, r: 1 };
    out.push(halo(k.insetPlan(CAB, -3), 0, 6, 7));
    out.push(box(plinth, 0, CAB_Z0, { tone: "lo" }, 3, 0.3));
    out.push(S(k.slabOf(CAB, CAB_Z0, CAB_Z1 - CAB_Z0, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(CAB, CAB_Z0 + WALL, P, 3), { tone: "faint" }) }));
    // the cells: back wall, floor and the −x wall seen through each opening, then letters, all clipped
    const face = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x0 = cellX(c), x1 = x0 + CELL_W, z0 = cellZ(r), z1 = z0 + CELL_H, yb = -CELL_D;
        const id = `mm-cell-${c}-${r}`;
        const opening = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]];
        defs.push(`<clipPath id="${id}"><path d="${k.pathOf(opening.map(at), true)}"/></clipPath>`);
        const inside = [];
        inside.push(poly([[x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1]], "mm-back"));
        inside.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, yb, z0], [x0, yb, z0]], "mm-floor"));
        inside.push(poly([[x0, 0, z0], [x0, yb, z0], [x0, yb, z1], [x0, 0, z1]], "mm-wall"));
        inside.push(line("faint", k.pathOf([at([x0, 0, z0]), at([x0, yb, z0]), at([x1, yb, z0])])));
        inside.push(line("faint", k.pathOf([at([x0, yb, z0]), at([x0, yb, z1])])));
        const filed = FILED.find(([fc, fr]) => fc === c && fr === r);
        if (filed) {
          for (let i = 0; i < filed[2]; i++) {
            const dx = [0, 1.6, -1.2][i], dy = [0, 3.4, 6.4][i];
            inside.push(letterFlat((x0 + x1) / 2 + dx, LETTER_REST_Y - 1.5 - dy, z0 + i * LET.h, false));
          }
        }
        face.push(`<g clip-path="url(#${id})">${inside.join("")}</g>`);
        face.push(line("lo", k.pathOf(opening.map(at), true)));
        // a card holder under each opening: the inbox's label
        {
          const holder = { x: x0 + 4.5, y: 0, w: CELL_W - 9, d: 0.7, r: 0.3 };
          const hz = z0 - WALL + 0.35;
          face.push(box(holder, hz, WALL - 0.7, { tone: c === TARGET.col && r === TARGET.row ? "mid" : "lo", crease: "none" }, 1, 0));
        }
      }
    }
    out.push(face.join(""));
    // rule lines on the target cell's card stand for its address
    {
      const x0 = cellX(TARGET.col) + 6.4, z = cellZ(TARGET.row) - WALL / 2;
      out.push(L(k.pathOf([at([x0, 0.75, z]), at([x0 + 7, 0.75, z])]), { tone: "mid", free: true }));
    }
    // screws on the face corners and the +x side
    out.push(screws([[CAB.x + 1.2, 0.05, CAB_Z0 + 1.2], [CAB.x + CAB.w - 1.2, 0.05, CAB_Z0 + 1.2], [CAB.x + 1.2, 0.05, CAB_Z1 - 1.2], [CAB.x + CAB.w - 1.2, 0.05, CAB_Z1 - 1.2]], 0.42));
    // cornice
    out.push(S(k.slabOf(CORNICE, CAB_Z1, DECK - CAB_Z1, P, 4, 0.8), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(CORNICE, 3), DECK, P, 4), { tone: "faint" }));
    out.push(screws([[CORNICE.x + 4, CORNICE.y + 4, DECK], [CORNICE.x + CORNICE.w - 4, CORNICE.y + 4, DECK], [CORNICE.x + 4, CORNICE.y + CORNICE.d - 4, DECK], [CORNICE.x + CORNICE.w - 4, CORNICE.y + CORNICE.d - 4, DECK]]));
  }

  // ── bell on the cabinet: the inbox's signal ──────────────────────────
  {
    const parts = [];
    const base = { x: BELL.x - 5, y: BELL.y - 5, w: 10, d: 10, r: 1.4 };
    parts.push(box(base, DECK, 1.6, { tone: "mid" }, 3, 0.4));
    parts.push(screws([[base.x + 1.6, base.y + 1.6, DECK + 1.6], [base.x + base.w - 1.6, base.y + base.d - 1.6, DECK + 1.6], [base.x + 1.6, base.y + base.d - 1.6, DECK + 1.6], [base.x + base.w - 1.6, base.y + 1.6, DECK + 1.6]], 0.4));
    parts.push(S(k.cylinder(BELL.x, BELL.y, 1.3, DECK + 1.6, BELL.z - DECK - 1.2, P, 16), { tone: "mid", crease: "none" }));
    const F = G.frameAlong([BELL.x, BELL.y, BELL.z], [0, 0, 1]);
    const h = BELL.top - BELL.z;
    const dome = [];
    for (let i = 0; i <= 12; i++) {
      const s = (i / 12) * h;
      const t = s / h;
      dome.push([s, BELL.rim * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.06 * t), i > 0 && i < 12 ? 1 : 0]);
    }
    dome[0] = [0, BELL.rim];
    dome.splice(1, 0, [0.5, BELL.rim, 0]);
    parts.push(`<g data-part="bell">${S(G.solidOf(dome, F, P), { tone: "hi", crease: "lo" })}${S(G.disc(h - 0.3, h + 1.4, 1.3, F, P), { tone: "mid" })}</g>`);
    // striker: an arm out of a solenoid, a ball at its tip just clear of the rim
    const ballX = BELL.x + BELL.rim + 1.6 + STRIKE;
    const armZ = BELL.z + 1.4;
    parts.push(`<g data-part="striker">${S(G.disc(0, SOL.x - ballX, 0.55, G.frameAlong([ballX, BELL.y, armZ], [1, 0, 0]), P), { tone: "mid" })}${S(G.sphereOf([ballX, BELL.y, armZ], 1.6, P), { tone: "hi" })}</g>`);
    parts.push(S(k.slabOf(SOL, DECK, SOL_Z1 - DECK, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(SOL, DECK + 3, P, 3), { tone: "faint" }) }));
    parts.push(L(k.planOutline(k.insetPlan(SOL, 1.6), SOL_Z1, P, 3), { tone: "faint" }));
    parts.push(screws([[SOL.x + 1.4, SOL.y + 1.4, SOL_Z1], [SOL.x + SOL.w - 1.4, SOL.y + SOL.d - 1.4, SOL_Z1]], 0.4));
    out.push(parts.join(""));
  }

  // ── signal cable: cabinet side → console ────────────────────────────
  const WIRE_Y = BELL.y;
  const wireRoute = [
    [CAB.x + CAB.w + 0.5, WIRE_Y, CAB_Z1 - 8],
    [CAB.x + CAB.w + 0.5, WIRE_Y, 1.2],
    [CAB.x + CAB.w + 3, WIRE_Y, 0.5],
    [78, WIRE_Y, 0.5],
    [80, WIRE_Y + 2, 0.5],
    [80, CON.y + 6, 0.5],
  ];
  {
    const sx = CAB.x + CAB.w;
    // grommet where the cable leaves the cabinet
    out.push(S(G.disc(0, 1.1, 1.8, G.frameAlong([sx, WIRE_Y, CAB_Z1 - 8], [1, 0, 0]), P), { tone: "mid" }));
    out.push(`<path class="mm-cable" d="${k.pathOf(G.fillet(wireRoute, 2.4).map(at))}"/>`);
    // two clips holding it to the side
    for (const z of [CAB_Z1 - 26, 12]) out.push(box({ x: sx, y: WIRE_Y - 1.6, w: 1.4, d: 3.2, r: 0.4 }, z - 1, 2, { tone: "mid" }, 1, 0));
    // and two saddle clips screwed to the bench where it runs along it
    for (const c of [{ x: 70.5, y: WIRE_Y - 1.8, w: 2.4, d: 3.6 }, { x: 78.2, y: 30, w: 3.6, d: 2.4 }]) {
      out.push(box({ ...c, r: 0.5 }, 0, 1.3, { tone: "mid" }, 1, 0.2));
      out.push(screws([[c.x + c.w / 2, c.y + c.d / 2, 1.3]], 0.38));
    }
  }

  // ── conveyor ─────────────────────────────────────────────────────────
  {
    const legs = [];
    for (const y of [14, 110]) for (const x of [BX - FRAME_IN - 1.2, BX + FRAME_IN + 1.2]) legs.push([x, y]);
    for (const [x, y] of byDepth(legs)) {
      out.push(box({ x: x - 2.4, y: y - 2.4, w: 4.8, d: 4.8, r: 0.8 }, 0, 1.2, { tone: "lo" }, 2, 0));
      out.push(box({ x: x - 1.2, y: y - 1.2, w: 2.4, d: 2.4, r: 0.3 }, 1.2, FRAME_Z0 - 1.2, { tone: "mid", crease: "none" }, 1, 0));
    }
    // a cross tie between the far legs at each end
    for (const y of [14, 110]) out.push(box({ x: BX - FRAME_IN, y: y - 0.8, w: FRAME_IN * 2, d: 1.6, r: 0.2 }, 5, 1.6, { tone: "lo" }, 1, 0));
    // far side frame
    const frame = (x0) => ({ x: x0, y: BELT_Y0, w: FRAME_OUT - FRAME_IN, d: BELT_Y1 - BELT_Y0, r: 0.6 });
    out.push(box(frame(BX - FRAME_OUT), FRAME_Z0, FRAME_Z1 - FRAME_Z0, { tone: "mid" }, 2, 0.4));
    // rollers and the belt
    for (const y of ROLLERS) {
      const F = G.frameAlong([BX - FRAME_IN, y, ROLLER_Z], [1, 0, 0]);
      out.push(S(G.disc(0, FRAME_IN * 2, ROLLER_R, F, P), { tone: "mid" }));
    }
    const belt = { x: BX - BELT_HALF, y: ROLLERS[0], w: BELT_HALF * 2, d: ROLLERS[1] - ROLLERS[0], r: 0 };
    out.push(S(k.slabOf(belt, BELT_TOP - 1, 1, P, 1, 0), { tone: "lo", crease: "lo" }));
    // belt seams: a moving texture clipped to the belt's top face
    const top = [[belt.x, belt.y, BELT_TOP], [belt.x + belt.w, belt.y, BELT_TOP], [belt.x + belt.w, belt.y + belt.d, BELT_TOP], [belt.x, belt.y + belt.d, BELT_TOP]];
    defs.push(`<clipPath id="mm-belt"><path d="${k.pathOf(top.map(at), true)}"/></clipPath>`);
    const seams = [];
    for (let y = belt.y - SEAM_GAP; y <= belt.y + belt.d + SEAM_GAP; y += SEAM_GAP) seams.push(k.lineOnTop([belt.x, y], [belt.x + belt.w, y], BELT_TOP, P));
    out.push(`<g clip-path="url(#mm-belt)"><g data-part="seams">${L(seams.join(""), { tone: "faint" })}</g></g>`);
    // near side frame with its axle bolts and the drive motor
    const fx = BX + FRAME_IN;
    out.push(box(frame(fx), FRAME_Z0, FRAME_Z1 - FRAME_Z0, { tone: "mid", inner: "" }, 2, 0.4));
    for (const y of ROLLERS) out.push(S(G.disc(0, 0.9, 1.5, G.frameAlong([BX + FRAME_OUT, y, ROLLER_Z], [1, 0, 0]), P), { tone: "mid" }));
    out.push(screws(ROLLERS.map((y) => [BX + FRAME_OUT + 0.95, y, ROLLER_Z]), 0.42));
    out.push(screws([30, 50, 70, 90].map((y) => [BX + FRAME_OUT, y, FRAME_Z1 - 1.4]), 0.36));
    // motor on the far end roller's axle
    const MF = G.frameAlong([BX + FRAME_OUT, ROLLERS[0] + 6.2, ROLLER_Z - 1.2], [1, 0, 0]);
    out.push(box({ x: BX + FRAME_OUT, y: ROLLERS[0] + 1.4, w: 1, d: 10, r: 0.3 }, ROLLER_Z - 7, 9, { tone: "mid" }, 1, 0));
    out.push(S(G.disc(1, 2.4, 4.6, MF, P), { tone: "mid" }));
    out.push(S(G.disc(2.4, 11, 4.1, MF, P), { tone: "mid", inner: L(G.arcOf(MF, 4.6, 4.1, P) + G.arcOf(MF, 6.8, 4.1, P) + G.arcOf(MF, 9, 4.1, P), { tone: "faint" }) }));
    out.push(S(G.disc(11, 12.2, 3.2, MF, P), { tone: "mid" }));
    out.push(L(G.circleOf(MF, 12.2, 1.4, P), { tone: "lo" }));
  }

  // ── reader gantry: far post, then the letter, then the rest ──────────
  const postAt = (x) => ({ x: x - POST / 2, y: GY - POST / 2, w: POST, d: POST, r: 0.5 });
  const footAt = (x) => ({ x: x - 3.4, y: GY - 4.2, w: 6.8, d: 8.4, r: 1 });
  const gantryPost = (x) =>
    box(footAt(x), 0, 1.6, { tone: "lo" }, 2, 0.3) +
    screws([[x - 2, GY - 3, 1.6], [x + 2, GY + 3, 1.6]], 0.38) +
    box(postAt(x), 1.6, BEAM_Z0 - 1.6, { tone: "mid", inner: L(k.sideSeam(postAt(x), 30, P, 2), { tone: "faint" }) }, 2, 0.3);
  out.push(gantryPost(POST_X[0]));

  // ── the letter on the belt (rests in its pigeonhole) ─────────────────
  {
    const x0 = BX - LET.w / 2, x1 = BX + LET.w / 2;
    const region = [
      [x0 - 1, 0, BELT_TOP - 0.5], [x1 + 1, 0, BELT_TOP - 0.5], [x1 + 1, 0, BELT_TOP + 3], [x0 - 1, 0, BELT_TOP + 3],
      [x0 - 1, 170, BELT_TOP - 0.5], [x1 + 1, 170, BELT_TOP - 0.5], [x1 + 1, 170, BELT_TOP + 3], [x0 - 1, 170, BELT_TOP + 3],
    ];
    defs.push(`<clipPath id="mm-letter"><path d="${hull(region)}"/><path d="${k.pathOf([[cellX(TARGET.col), 0, BELT_TOP], [cellX(TARGET.col) + CELL_W, 0, BELT_TOP], [cellX(TARGET.col) + CELL_W, 0, BELT_TOP + CELL_H], [cellX(TARGET.col), 0, BELT_TOP + CELL_H]].map(at), true)}"/></clipPath>`);
    out.push(`<g clip-path="url(#mm-letter)"><g data-part="letter">${letterFlat(BX, LETTER_REST_Y, BELT_TOP, true)}</g></g>`);
  }

  // ── gantry: near post, beam, carriage, reader head ──────────────────
  {
    out.push(gantryPost(POST_X[1]));
    const beam = (xa, xb) => ({ x: xa, y: GY - 2.4, w: xb - xa, d: 4.8, r: 0.6 });
    out.push(box(beam(POST_X[0] - 2.4, CAR.x), BEAM_Z0, BEAM_Z1 - BEAM_Z0, { tone: "mid" }, 2, 0.4));
    // the head and its rod slide down out of the carriage
    const ROD = { x: BX - 1.1, y: GY - 1.1, w: 2.2, d: 2.2, r: 1.1 };
    defs.push(`<clipPath id="mm-rod"><path d="${hull(k.boxCorners({ x: BX - 6, y: GY - 6, w: 12, d: 12 }, HEAD_Z0 - STAMP - 2, CAR_Z0))}"/></clipPath>`);
    const head = [];
    head.push(`<g clip-path="url(#mm-rod)"><g data-part="head-rod">${S(k.slabOf(ROD, HEAD_Z1, CAR_Z0 - HEAD_Z1 + STAMP + 2, P, 4, 0), { tone: "mid", crease: "none" })}</g></g>`);
    const HF = G.frameAlong([BX, GY, HEAD_Z0], [0, 0, 1]);
    const lensF = G.frameAlong([BX, GY + 3.6, HEAD_Z0 + 3.2], [0, 1, 0]);
    head.push(`<g data-part="head">`
      + S(G.disc(-1.6, 0, 2.4, HF, P), { tone: "mid" })
      + S(G.disc(0, HEAD_Z1 - HEAD_Z0, 3.8, HF, P), { tone: "hi", crease: "lo", inner: L(G.arcOf(HF, 4.8, 3.8, P), { tone: "faint" }) })
      + S(G.disc(HEAD_Z1 - HEAD_Z0, HEAD_Z1 - HEAD_Z0 + 1.2, 4.4, HF, P), { tone: "mid" })
      + S(G.disc(0, 0.8, 1.7, lensF, P), { tone: "mid" })
      + `<path class="mm-lamp" data-part="reader-lamp" d="${G.circleOf(lensF, 0.8, 1.1, P)}"/>`
      + `</g>`);
    out.push(head.join(""));
    out.push(S(k.slabOf(CAR, CAR_Z0, CAR_Z1 - CAR_Z0, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(CAR, CAR_Z0 + 3, P, 3), { tone: "faint" }) }));
    out.push(screws([[CAR.x + 1.6, CAR.y + 1.6, CAR_Z1], [CAR.x + CAR.w - 1.6, CAR.y + CAR.d - 1.6, CAR_Z1], [CAR.x + 1.6, CAR.y + CAR.d - 1.6, CAR_Z1], [CAR.x + CAR.w - 1.6, CAR.y + 1.6, CAR_Z1]], 0.4));
    out.push(box(beam(CAR.x + CAR.w, POST_X[1] + 2.4), BEAM_Z0, BEAM_Z1 - BEAM_Z0, { tone: "mid" }, 2, 0.4));
    out.push(screws([[POST_X[0], GY, BEAM_Z1], [POST_X[1], GY, BEAM_Z1]], 0.42));
    // knurled thumb knob on the carriage
    out.push(S(k.cylinder(BX + 2.2, GY + 1.4, 1, CAR_Z1, 1.6, P, 12), { tone: "mid", crease: "none" }));
    out.push(S(k.cylinder(BX + 2.2, GY + 1.4, 2.2, CAR_Z1 + 1.6, 2.2, P, 24), { tone: "hi" }));
    out.push(L(k.knurl(BX + 2.2, GY + 1.4, 2.2, CAR_Z1 + 1.6, CAR_Z1 + 3.8, 16, P, 0.3), { tone: "lo" }));
  }

  // ── a tray of outgoing mail beside the intake: the senders ──────────
  {
    const tray = { x: -58, y: 104, w: 46, d: 40, r: 2.4 };
    out.push(halo(tray, 0, 2, 4));
    out.push(S(k.slabOf(tray, 0, 3.2, P, 4, 0.6), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(tray, 2.2), 3.2, P, 4), { tone: "lo" }));
    out.push(screws(k.corners(tray, 1.2).map(([x, y]) => [x, y, 3.2]), 0.4));
    const piles = [[-46, 116, 4], [-26, 130, 2], [-25, 113, 1]];
    for (const [x, y, n] of byDepth(piles)) {
      for (let i = 0; i < n; i++) out.push(letterFlat(x + [0, 0.8, -0.6, 0.5][i], y + [0, -0.7, 0.6, 0.3][i], 3.2 + i * LET.h, false, "mid"));
    }
    out.push(box({ x: tray.x + 14, y: tray.y + tray.d, w: 18, d: 0.6, r: 0.3 }, 0.6, 2, { tone: "lo", crease: "none" }, 1, 0));
  }

  // ── intake box ───────────────────────────────────────────────────────
  {
    out.push(halo(HOP, 0, 4, 6));
    out.push(box(k.insetPlan(HOP, 1), 0, HOP_Z0, { tone: "lo" }, 3, 0.3));
    out.push(S(k.slabOf(HOP, HOP_Z0, HOP_Z1 - HOP_Z0, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(HOP, HOP_Z0 + 13.6, P, 4), { tone: "faint" }) }));
    const fy = HOP.y + HOP.d;
    // front: the archive drawer (R2) with a pull and a card, a label plate above
    // The drawer's box shows only where it has come out of the face: the live script grows this
    // clip from the face rectangle as the drawer slides (empty at rest).
    defs.push(`<clipPath id="mm-drawer"><path data-part="drawer-clip" d=""/></clipPath>`);
    const dw = 24;
    out.push(onFaceY(fy, `<path class="mm-slit" d="${rr(DRAWER.x - 0.4, -(DRAWER.z1 + 0.4), DRAWER.x + dw + 0.4, -(DRAWER.z0 - 0.4), 1)}"/>`));
    const drawer = [];
    {
      // the drawer's open box, full of filed .eml cards (seen only once it slides out)
      const dbox = { x: DRAWER.x + 0.8, y: fy - 22, w: dw - 1.6, d: 22, r: 0.4 };
      const dtop = DRAWER.z1 - 1;
      const inner = k.insetPlan(dbox, 0.9);
      const cards = [];
      for (let y = inner.y + 1.6; y < inner.y + inner.d - 0.5; y += 2.2) cards.push(k.lineOnTop([inner.x, y], [inner.x + inner.w, y], dtop - 0.6, P));
      drawer.push(`<g clip-path="url(#mm-drawer)">`
        + box(dbox, DRAWER.z0 + 0.6, dtop - DRAWER.z0 - 0.6, { tone: "mid" }, 1, 0)
        + `<path class="mm-back" d="${k.pathOf(k.roundedPlan(inner, 1).map(([x, y]) => at([x, y, dtop])), true)}"/>`
        + L(k.planOutline(inner, dtop, P, 1), { tone: "lo" })
        + L(cards.join(""), { tone: "mid" })
        + `</g>`);
    }
    drawer.push(box({ x: DRAWER.x, y: fy, w: dw, d: 1.2, r: 0.4 }, DRAWER.z0, DRAWER.z1 - DRAWER.z0, { tone: "mid" }, 1, 0.3));
    drawer.push(onFaceY(fy + 1.2, line("faint", rr(DRAWER.x + 7, -(DRAWER.z1 - 2), DRAWER.x + dw - 7, -(DRAWER.z1 - 5.2), 0.5, 2))));
    const pz = DRAWER.z0 + 3.2;
    for (const x of [DRAWER.x + 8, DRAWER.x + dw - 8]) drawer.push(box({ x: x - 0.7, y: fy + 1.2, w: 1.4, d: 1.6, r: 0.3 }, pz - 0.7, 1.4, { tone: "mid" }, 1, 0));
    drawer.push(box({ x: DRAWER.x + 7, y: fy + 2.8, w: dw - 14, d: 1.2, r: 0.5 }, pz - 0.8, 1.6, { tone: "hi" }, 2, 0));
    out.push(`<g data-part="drawer">${drawer.join("")}</g>`);
    // label plate (three rule lines) and screws
    const lp = { x0: BX - 9, x1: BX + 9, z0: HOP_Z1 - 14, z1: HOP_Z1 - 5 };
    out.push(box({ x: lp.x0, y: fy, w: lp.x1 - lp.x0, d: 0.6, r: 0.4 }, lp.z0, lp.z1 - lp.z0, { tone: "lo", crease: "none" }, 1, 0));
    out.push(onFaceY(fy + 0.6, line("lo", [10, 14, 8].map((w, i) => `M${fmt(lp.x0 + 3)} ${fmt(-(lp.z1 - 2.4 - i * 2.2))}h${w}`).join(""), ` data-free="both"`)));
    out.push(screws([[lp.x0 + 1.3, fy + 0.6, (lp.z0 + lp.z1) / 2], [lp.x1 - 1.3, fy + 0.6, (lp.z0 + lp.z1) / 2]], 0.4));
    out.push(screws([[HOP.x + 2, fy, HOP_Z0 + 2], [HOP.x + HOP.w - 2, fy, HOP_Z0 + 2], [HOP.x + 2, fy, HOP_Z1 - 2], [HOP.x + HOP.w - 2, fy, HOP_Z1 - 2]], 0.42));
    // +x side: a hatch outline
    out.push(onFaceX(HOP.x + HOP.w, line("faint", rr(-(HOP.y + HOP.d - 5), -(HOP_Z1 - 6), -(HOP.y + 5), -(HOP_Z0 + 16), 1.4))));
    // lid with the slot, hinges on the far edge
    out.push(S(k.slabOf(LID, HOP_Z1, LID_TOP - HOP_Z1, P, 4, 0.8), { tone: "mid" }));
    for (const x of [HOP.x + 6, HOP.x + HOP.w - 6]) out.push(S(G.disc(-3, 3, 1.3, G.frameAlong([x, LID.y + 1.4, LID_TOP + 0.2], [1, 0, 0]), P), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(SLOT, -1.6), LID_TOP, P, 3), { tone: "lo" }));
    out.push(`<path class="mm-slot" d="${k.pathOf(k.roundedPlan(SLOT, 3).map(([x, y]) => at([x, y, LID_TOP])), true)}"/>`);
    out.push(L(k.planOutline(SLOT, LID_TOP, P, 3), { tone: "mid" }));
    out.push(screws([[LID.x + 3, LID.y + LID.d - 3, LID_TOP], [LID.x + LID.w - 3, LID.y + LID.d - 3, LID_TOP]], 0.42));
  }

  // ── the letter dropping into the slot (hidden until a send) ─────────
  {
    const region = k.boxCorners({ x: SLOT.x - 2, y: SLOT_Y - 1.2, w: SLOT.w + 4, d: 2.4 }, LID_TOP, LID_TOP + 40);
    defs.push(`<clipPath id="mm-drop"><path d="${hull(region)}"/></clipPath>`);
    out.push(`<g clip-path="url(#mm-drop)"><g data-part="drop" opacity="0">${letterUpright(BX, SLOT_Y, DROP.z0)}</g></g>`);
  }

  // ── console with the split-flap readout ─────────────────────────────
  const flapX = [];
  {
    out.push(halo(CON, 0, 4, 6));
    for (const [x, y] of byDepth(k.corners(CON, 4.4))) out.push(S(k.cylinder(x, y, 2.6, 0, CON_Z0, P, 18), { tone: "lo" }));
    out.push(S(k.slabOf(CON, CON_Z0, CON_Z1 - CON_Z0, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(CON, CON_Z0 + 3.2, P, 4), { tone: "faint" }) }));
    const fy = CON.y + CON.d;
    const total = FLAP.w * 6 + FLAP.gap * 4 + FLAP.mid;
    const left = CON.x + (CON.w - total) / 2;
    for (let i = 0; i < 6; i++) flapX.push(left + i * (FLAP.w + FLAP.gap) + (i >= 3 ? FLAP.mid - FLAP.gap : 0));
    const fz0 = FLAP.z0, fz1 = FLAP.z0 + FLAP.h;
    const bez = { x0: left - 2.6, x1: left + total + 2.6, z0: fz0 - 2.6, z1: fz1 + 2.6 };
    const face = [];
    face.push(`<path class="mm-bezel" d="${rr(bez.x0, -bez.z1, bez.x1, -bez.z0, 1.6)}"/>`);
    face.push(line("mid", rr(bez.x0, -bez.z1, bez.x1, -bez.z0, 1.6)));
    flapX.forEach((x, i) => {
      const id = `mm-flap-${i}`;
      defs.push(`<clipPath id="${id}"><path d="${rr(x, -fz1, x + FLAP.w, -fz0, 0.7, 2)}"/></clipPath>`);
      face.push(`<g clip-path="url(#${id})">`
        + `<path class="mm-flap-top" d="${rr(x, -fz1, x + FLAP.w, -(fz0 + FLAP.h / 2), 0, 1)}"/>`
        + `<path class="mm-flap-bottom" d="${rr(x, -(fz0 + FLAP.h / 2), x + FLAP.w, -fz0, 0, 1)}"/>`
        + `<text class="mm-digit" data-flap="${i}" x="${fmt(x + FLAP.w / 2)}" y="${fmt(-(fz0 + FLAP.h / 2) + 2.55)}" text-anchor="middle" font-size="7.1">${"482913"[i]}</text>`
        + `<path class="mm-hinge" d="M${fmt(x)} ${fmt(-(fz0 + FLAP.h / 2))}H${fmt(x + FLAP.w)}"/>`
        + `</g>`);
      face.push(line("lo", rr(x, -fz1, x + FLAP.w, -fz0, 0.7, 2)));
    });
    // a short rule under the readout, standing for its caption
    face.push(line("lo", `M${fmt(bez.x0 + 1)} ${fmt(-(bez.z0 - 2.4))}h12`, ` data-free="both"`));
    out.push(onFaceY(fy, face.join("")));
    out.push(screws([[CON.x + 2, fy, CON_Z0 + 2], [CON.x + CON.w - 2, fy, CON_Z0 + 2], [CON.x + 2, fy, CON_Z1 - 2], [CON.x + CON.w - 2, fy, CON_Z1 - 2]], 0.42));
    // top: vent slots and the "woke" lamp
    const vents = [];
    for (let i = 0; i < 7; i++) vents.push(k.planOutline({ x: CON.x + 6 + i * 3.2, y: CON.y + 5, w: 1.4, d: 12, r: 0.7 }, CON_Z1, P, 2));
    out.push(L(vents.join(""), { tone: "lo" }));
    const LX = CON.x + CON.w - 9, LYc = CON.y + CON.d / 2;
    out.push(S(k.cylinder(LX, LYc, 4.6, CON_Z1, 1.4, P, 32), { tone: "mid" }));
    out.push(S(k.cylinder(LX, LYc, 3.4, CON_Z1 + 1.4, 1.6, P, 28), { tone: "mid", crease: "none" }));
    const LF = G.frameAlong([LX, LYc, CON_Z1 + 3], [0, 0, 1]);
    const lens = [[0, 3.0], [0.4, 3.0, 1], [1.4, 2.6, 1], [2.3, 1.7, 1], [2.8, 0]];
    out.push(`<g data-part="lamp" class="mm-lamp-body">${S(G.solidOf(lens, LF, P), { tone: "lo", crease: "none" })}</g>`);
    // knurled knob on the +x side
    const KF = G.frameAlong([CON.x + CON.w, CON.y + 8, CON_Z0 + 10], [1, 0, 0]);
    out.push(S(G.disc(0, 1.2, 2, KF, P), { tone: "mid" }));
    out.push(S(G.disc(1.2, 4.2, 3.4, KF, P), { tone: "hi", crease: "lo" }));
    out.push(L(G.circleOf(KF, 4.2, 1.6, P), { tone: "lo" }));
  }

  const svg = k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label:
      "A mail-sorting bench. An intake box with a slot in its lid stands at the front; a conveyor belt runs from it under a reader on a gantry to a cabinet of pigeonholes. One letter lies in the pigeonhole the belt feeds. A bell sits on the cabinet, and a cable runs from the cabinet to a console whose split-flap display reads 482 913.",
    body: [
      `<defs>${defs.join("")}</defs>`,
      ...out,
      `<circle class="mm-pulse" data-part="pulse" r="2.6" cx="-20" cy="-20" opacity="0"/>`,
      // the intake box (and the air above its slot) is a button for the live script
      `<path class="mm-hit" data-part="hit" d="${hull([...k.boxCorners(HOP, 0, LID_TOP), ...k.boxCorners(SLOT, LID_TOP, DROP.z0 + LET.d)])}"/>`,
    ],
  });

  const vec = (d) => k.axisVector(P, d).map(fmt);
  return {
    svg,
    data: {
      vx: vec([1, 0, 0]),
      vy: vec([0, 1, 0]),
      vz: vec([0, 0, 1]),
      letter: { rest: LETTER_REST_Y, start: LETTER_START_Y, read: GY, cellFront: 0, belt0: ROLLERS[0] },
      drop: DROP.z1 - DROP.z0,
      drawer: DRAWER.out,
      // the drawer box's cross-section in the intake box's face, in screen units
      drawerFace: [[DRAWER.x + 0.8, DRAWER.z0 + 0.6], [DRAWER.x + 23.2, DRAWER.z0 + 0.6], [DRAWER.x + 23.2, DRAWER.z1 - 1], [DRAWER.x + 0.8, DRAWER.z1 - 1]].map(([x, z]) => at([x, HOP.y + HOP.d, z]).map(fmt)),
      stamp: STAMP,
      seam: SEAM_GAP,
      strike: STRIKE,
      wire: G.fillet(wireRoute, 2.4).map((p) => at(p).map(fmt)),
    },
  };

  // A letter lying flat: a thin slab, the flap's V and a stamp on its top face.
  function letterFlat(cx, cy, z, lit, tone = "mid") {
    const plan = { x: cx - LET.w / 2, y: cy - LET.d / 2, w: LET.w, d: LET.d, r: 0.4 };
    const top = z + LET.h;
    const flap = k.onTop([[plan.x, plan.y], [cx, cy + 0.6], [plan.x + plan.w, plan.y]], top, P);
    const stamp = k.planOutline({ x: plan.x + plan.w - 4.6, y: plan.y + plan.d - 4.4, w: 3.2, d: 3, r: 0.2 }, top, P, 1);
    return S(k.slabOf(plan, z, LET.h, P, 1, 0), { tone: lit ? "hi" : tone, lit, crease: "none", className: lit ? "mm-letter" : "mm-letter-filed", inner: L(flap, { tone: lit ? "mid" : "lo" }) + `<path class="${lit ? "mm-stamp" : "mm-stamp-filed"}" d="${stamp}"/>` });
  }

  // A letter standing upright in the x–z plane (as it goes into the slot), its face toward +y.
  function letterUpright(cx, y, z0) {
    const plan = { x: cx - LET.w / 2, y: y - LET.h / 2, w: LET.w, d: LET.h, r: 0 };
    const h = LET.d;
    const face = [];
    face.push(line("mid", `M${fmt(plan.x + 2.4)} ${fmt(-(z0 + h - 4))}h7M${fmt(plan.x + 2.4)} ${fmt(-(z0 + h - 6))}h9M${fmt(plan.x + 2.4)} ${fmt(-(z0 + h - 8))}h5`, ` data-free="both"`));
    face.push(`<path class="mm-stamp" d="${rr(plan.x + plan.w - 4.6, -(z0 + h - 1.4), plan.x + plan.w - 1.4, -(z0 + h - 4.6), 0.2, 1)}"/>`);
    return S(k.slabOf(plan, z0, h, P, 1, 0), { tone: "hi", lit: true, crease: "none", className: "mm-letter" }) + onFaceY(y + LET.h / 2, face.join(""));
  }
}

// Page-specific figure styles on top of the kit's ISO_CSS (light theme). One accent: mint.
export const FIGURE_CSS = `
.iso{--mm-accent:#0d9373;--mm-accent-soft:#e7f6f1;--anatomy-mono:var(--sans,Inter,ui-sans-serif,system-ui,sans-serif)}
.mm-back{fill:#d3d3cf;stroke:none}
.mm-floor{fill:#e4e4e0;stroke:none}
.mm-wall{fill:#dadad6;stroke:none}
.mm-slot,.mm-slit{fill:var(--anatomy-shade-0);stroke:none}
.mm-cable{fill:none;stroke:var(--anatomy-mid);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.mm-bezel{fill:var(--anatomy-shade-1);stroke:none}
.mm-flap-top{fill:#26262a}
.mm-flap-bottom{fill:#1d1d20}
.mm-hinge{stroke:#0b0b0c;stroke-width:.35;fill:none}
.mm-digit{fill:#f4f4f2;font-family:var(--anatomy-mono);font-weight:600;font-variant-numeric:tabular-nums}
.mm-digit[data-fresh]{fill:#7ee0c0}
.mm-lamp{fill:var(--anatomy-shade-1);stroke:none;transition:fill .35s var(--anatomy-ease)}
.mm-lamp[data-on]{fill:var(--mm-accent)}
.mm-lamp-body .iso-fill,.mm-lamp-body .iso-shade,.mm-lamp-body .iso-top{transition:fill .5s var(--anatomy-ease)}
.mm-lamp-body[data-on] .iso-fill,.mm-lamp-body[data-on] .iso-top{fill:#8fe3c9}
.mm-lamp-body[data-on] .iso-shade{fill:var(--mm-accent)}
.mm-stamp{fill:var(--mm-accent);stroke:none}
.mm-stamp-filed{fill:var(--anatomy-faint);stroke:none}
.mm-pulse{fill:var(--mm-accent);stroke:var(--anatomy-paper);stroke-width:.8}
.mm-hit{fill:transparent;stroke:none;cursor:pointer;pointer-events:all}
[data-figure]:focus-visible{outline:2px solid var(--mm-accent);outline-offset:6px;border-radius:4px}
`;
