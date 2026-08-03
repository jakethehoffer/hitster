// The room the record is playing in.
//
// A full-screen canvas behind the UI, driven by the same analysis that powers
// the turntable: drifting aurora, a perspective dance floor, music notes and
// sparks leaving the record in every direction, and — once somebody types
// "dance" — a line of dancers working the beat. Everything scales with the
// music and idles gently when nothing plays.

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // even coverage without clumping
const NOTE_GLYPHS = ['♪', '♫', '♩', '♬', '𝅘𝅥𝅮', '♭'];
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

const MAX_NOTES = 140;
const MAX_SPARKS = 260;

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let dpr = 1;

// The record's place on screen, so notes leave from its rim. Until a turntable
// reports in — an easter egg switched on outside a game — the room uses its
// own middle.
let origin = { x: 0, y: 0, r: 60 };
let originSet = false;

let dancing = false;
let party = false;
let crazy = false;
let noteAngle = 0;
let gridPhase = 0;
let spawnCarry = 0;
let clock = 0;
let crazyTimer = 0;

const notes = [];
const sparks = [];
const rings = [];
let blobs = [];
let dancers = [];
let lasers = [];
let ballSpots = [];
const crowd = [];

// One at a time, doubling every second, until the screen cannot hold any more.
const CROWD_START = 1;
const CROWD_MAX = 256;
const CROWD_DOUBLE_MS = 1000;
const SCREAMS = ['AAAAA', 'WOOO', 'AAAH', 'YEAAH', 'AHHH'];

export function attachStageFx(node) {
  canvas = node;
  ctx = node.getContext('2d');
  measure();
  if (!blobs.length) buildScene();
}

export function detachStageFx() {
  canvas = null;
  ctx = null;
  notes.length = 0;
  sparks.length = 0;
  rings.length = 0;
}

export function setStageOrigin(rect) {
  if (!rect || !rect.width) return;
  origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width * 0.28 };
  originSet = true;
}

export function setDanceMode(on) {
  dancing = !!on;
  if (dancing && !dancers.length) buildDancers();
}

export function danceMode() { return dancing; }

export function setPartyMode(on) {
  party = !!on;
  document.body.classList.toggle('party', party);
  if (party && !ballSpots.length) buildBallSpots();
}

export function partyMode() { return party; }

// The crowd starts as one and doubles every second. Switching it off empties
// the room, so it always starts from one again.
export function setCrazyMode(on) {
  crazy = !!on;
  crowd.length = 0;
  crazyTimer = 0;
  if (crazy) for (let i = 0; i < CROWD_START; i++) crowd.push(makeCrazy());
}

export function crazyMode() { return crazy; }

export function stageFxState() {
  return {
    attached: canvas != null,
    dancing,
    party,
    crazy,
    notes: notes.length,
    sparks: sparks.length,
    dancers: dancing ? dancers.length : 0,
    crowd: crowd.length,
    lasers: lasers.length,
  };
}

function measure() {
  if (!canvas) return;
  // Zero when reduced motion hides the canvas — renderStage then does nothing.
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function buildScene() {
  blobs = Array.from({ length: 4 }, (_, i) => ({
    x: rand(0.1, 0.9), y: rand(0.1, 0.9),
    vx: rand(-0.02, 0.02), vy: rand(-0.015, 0.015),
    r: rand(0.28, 0.52), hue: i * 55,
  }));
  // Six rigs on the ceiling, three a side, sweeping past each other.
  lasers = Array.from({ length: 6 }, (_, i) => ({
    x: i < 3 ? 0.06 + i * 0.07 : 0.94 - (i - 3) * 0.07,
    aim: i < 3 ? 0.7 : -0.7,
    swing: rand(0.5, 0.9),
    phase: rand(0, TAU),
    hue: i * 40,
  }));
  buildDancers();
}

function buildDancers() {
  dancers = Array.from({ length: 7 }, (_, i) => ({
    x: 0.08 + i * 0.14,
    phase: rand(0, TAU),
    jump: 0,
    lean: 0,
    scale: rand(0.85, 1.15),
  }));
}

// The speckle a mirror ball throws around a room.
function buildBallSpots() {
  ballSpots = Array.from({ length: 40 }, () => ({
    a: rand(0, TAU),
    r: rand(0.15, 0.75),
    tilt: rand(0.3, 0.85),
    size: rand(0.006, 0.022),
    hue: rand(0, 360),
  }));
}

function makeCrazy() {
  return {
    x: rand(0.05, 0.95),
    y: rand(0.15, 0.9),
    vx: rand(-0.14, 0.14),
    vy: rand(-0.1, 0.1),
    rot: rand(-0.4, 0.4),
    vrot: rand(-5, 5),
    scale: rand(0.7, 1.3),
    phase: rand(0, TAU),
    scream: SCREAMS[Math.floor(Math.random() * SCREAMS.length)],
  };
}

// p: { levels, bass, energy, hue, beat, playing, dt, now }
export function renderStage(p) {
  if (!ctx || !canvas) return;
  measure();
  if (!width || !height) return;
  if (!originSet) origin = { x: width / 2, y: height / 2, r: Math.min(width, height) * 0.12 };
  const g = ctx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);

  step(p);

  drawBlobs(g, p);
  drawFloor(g, p);
  drawLasers(g, p);
  if (party) drawBallSpots(g, p);
  drawRings(g, p);
  drawEqualiser(g, p);
  if (dancing) drawDancers(g, p);
  drawSparks(g);
  drawNotes(g);
  if (crazy) drawCrowd(g, p);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
}

function step(p) {
  const { dt, bass, energy, playing, beat, hue } = p;
  clock += dt;

  for (const laser of lasers) laser.phase += dt * laser.swing * (0.6 + bass * 1.6);
  for (const spot of ballSpots) spot.a += dt * (0.25 + energy * 0.7);

  if (crazy) {
    crazyTimer += dt * 1000;
    while (crazyTimer >= CROWD_DOUBLE_MS && crowd.length < CROWD_MAX) {
      crazyTimer -= CROWD_DOUBLE_MS;
      const grown = Math.min(CROWD_MAX, crowd.length * 2 || CROWD_START);
      while (crowd.length < grown) crowd.push(makeCrazy());
    }
    for (const c of crowd) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.x < 0.03 || c.x > 0.97) c.vx *= -1;
      if (c.y < 0.1 || c.y > 0.95) c.vy *= -1;
      c.rot += c.vrot * dt;
      if (c.rot > 0.5 || c.rot < -0.5) c.vrot *= -1;
      c.phase += dt * 9;
    }
  }

  for (const b of blobs) {
    b.x += b.vx * dt * (0.4 + energy);
    b.y += b.vy * dt * (0.4 + energy);
    if (b.x < -0.2 || b.x > 1.2) b.vx *= -1;
    if (b.y < -0.2 || b.y > 1.2) b.vy *= -1;
  }

  gridPhase = (gridPhase + dt * (0.08 + bass * 0.5)) % 1;

  // A steady trickle of notes while the music runs, plus a burst on the beat.
  if (playing) {
    spawnCarry += dt * (3 + energy * 22);
    while (spawnCarry >= 1) { spawnCarry -= 1; spawnNote(hue, energy); }
  }
  if (beat) {
    for (let i = 0; i < 5; i++) spawnNote(hue, Math.max(energy, 0.5));
    rings.push({ age: 0, hue });
    spawnSparks(hue);
    for (const dancer of dancers) { dancer.jump = 1; dancer.lean = rand(-1, 1); }
  }

  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    n.life -= dt;
    n.x += n.vx * dt;
    n.y += (n.vy - n.rise) * dt;
    n.rise += dt * 26;
    n.rot += n.vrot * dt;
    if (n.life <= 0) notes.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 420 * dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].age += dt * 0.9;
    if (rings[i].age >= 1) rings.splice(i, 1);
  }
  for (const d of dancers) {
    d.jump = Math.max(0, d.jump - dt * 3.2);
    d.lean += (0 - d.lean) * Math.min(1, dt * 4);
    d.phase += dt * (2 + bass * 5);
  }
}

// Every direction, not just the side the last one left from: successive notes
// step round by the golden angle so the record sings from its whole rim.
function spawnNote(hue, energy) {
  if (notes.length >= MAX_NOTES) return;
  noteAngle = (noteAngle + GOLDEN) % TAU;
  const a = noteAngle + rand(-0.18, 0.18);
  const speed = rand(52, 128) * (0.7 + energy);
  notes.push({
    x: origin.x + Math.cos(a) * origin.r,
    y: origin.y + Math.sin(a) * origin.r,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    rise: 0,
    rot: rand(-0.5, 0.5),
    vrot: rand(-2.4, 2.4),
    size: rand(13, 30) * (0.8 + energy * 0.6),
    glyph: NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)],
    hue: hue + rand(-40, 40),
    life: rand(1.9, 3.4),
    max: 3.4,
  });
}

// Struck off the record's rim on every beat, the way a needle throws light.
function spawnSparks(hue) {
  for (let i = 0; i < 16 && sparks.length < MAX_SPARKS; i++) {
    const a = rand(0, TAU);
    const speed = rand(120, 380);
    sparks.push({
      x: origin.x + Math.cos(a) * origin.r,
      y: origin.y + Math.sin(a) * origin.r,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 70,
      life: rand(0.4, 1),
      hue: hue + rand(-30, 70),
    });
  }
}

function drawBlobs(g, p) {
  g.globalCompositeOperation = 'lighter';
  for (const b of blobs) {
    const r = b.r * Math.min(width, height) * (0.8 + p.energy * 0.5);
    const x = b.x * width;
    const y = b.y * height;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(${p.hue + b.hue}, 95%, 58%, ${(0.05 + p.energy * 0.13).toFixed(3)})`);
    grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
}

// Thin beams off ceiling rigs, sweeping past each other. Kept to single lines
// with one soft pass behind them — the room reads busier the moment they blur.
function drawLasers(g, p) {
  g.globalCompositeOperation = 'lighter';
  const reach = height * 1.25;
  const punch = party ? 1.9 : 1;
  for (const laser of lasers) {
    const x = laser.x * width;
    const angle = Math.PI / 2 + laser.aim * 0.55 * Math.sin(laser.phase);
    const x2 = x + Math.cos(angle) * reach;
    const y2 = Math.sin(angle) * reach;
    const hue = party ? (p.hue + laser.hue * 2 + clock * 90) % 360 : p.hue + laser.hue * 0.4;
    const alpha = Math.min(0.4, (0.05 + p.bass * 0.12 + (party ? 0.06 : 0)) * punch);
    // Beams die away before they reach the text: bright at the rig, gone by
    // the time they cross anything a player has to read.
    const beam = (light, width) => {
      const grad = g.createLinearGradient(x, 0, x2, y2);
      grad.addColorStop(0, `hsla(${hue}, 100%, ${light}%, ${alpha.toFixed(3)})`);
      grad.addColorStop(0.45, `hsla(${hue}, 100%, ${light}%, ${(alpha * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `hsla(${hue}, 100%, ${light}%, 0)`);
      g.strokeStyle = grad;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x2, y2);
      g.stroke();
    };
    beam(70, 4 + p.bass * 4);
    beam(90, 1);
  }
}

// The speckle a mirror ball throws: dots orbiting the room on a tilted path.
function drawBallSpots(g, p) {
  g.globalCompositeOperation = 'lighter';
  const rx = width * 0.52;
  const ry = height * 0.42;
  for (const spot of ballSpots) {
    const x = origin.x + Math.cos(spot.a) * rx * spot.r;
    const y = origin.y + Math.sin(spot.a) * ry * spot.r * spot.tilt;
    const r = Math.min(width, height) * spot.size * 0.7 * (1 + p.bass * 0.5);
    g.fillStyle = `hsla(${(spot.hue + clock * 60) % 360}, 100%, 72%, ${(0.14 + p.energy * 0.22).toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
}

// A dance floor running to a vanishing point, scrolling towards the room.
// In party mode the tiles light up instead, Saturday-night style.
function drawFloor(g, p) {
  const horizon = height * 0.58;
  const vx = width / 2;
  if (party) { drawDiscoFloor(g, p, horizon, vx); return; }
  g.globalCompositeOperation = 'lighter';
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const t = (i + gridPhase) / 14;
    const y = horizon + (height - horizon) * (t * t);
    if (y < horizon || y > height) continue;
    g.strokeStyle = `hsla(${p.hue + 30}, 100%, 65%, ${(0.03 + p.bass * 0.1) * (1 - t * 0.6)})`;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  }
  for (let i = -7; i <= 7; i++) {
    g.strokeStyle = `hsla(${p.hue}, 100%, 62%, ${(0.03 + p.energy * 0.07).toFixed(3)})`;
    g.beginPath();
    g.moveTo(vx + i * width * 0.03, horizon);
    g.lineTo(vx + i * width * 0.34, height);
    g.stroke();
  }
}

function drawRings(g, p) {
  g.globalCompositeOperation = 'lighter';
  const reach = Math.max(width, height) * 0.45;
  for (const ring of rings) {
    g.strokeStyle = `hsla(${ring.hue}, 100%, 70%, ${((1 - ring.age) * 0.16).toFixed(3)})`;
    g.lineWidth = 2 + (1 - ring.age) * 5;
    g.beginPath();
    g.arc(origin.x, origin.y, origin.r + ring.age * reach, 0, TAU);
    g.stroke();
  }
}

function drawDiscoFloor(g, p, horizon, vx) {
  g.globalCompositeOperation = 'lighter';
  const rows = 9;
  const cols = 10;
  for (let r = 0; r < rows; r++) {
    const t0 = (r + gridPhase) / rows;
    const t1 = (r + 1 + gridPhase) / rows;
    const yA = horizon + (height - horizon) * (t0 * t0);
    const yB = horizon + (height - horizon) * (t1 * t1);
    if (yB < horizon) continue;
    const spreadA = width * (0.04 + t0 * 0.5);
    const spreadB = width * (0.04 + t1 * 0.5);
    for (let c = 0; c < cols; c++) {
      const i = c - cols / 2;
      const lit = (Math.floor(clock * 3) + r + c) % 3 === 0;
      const hue = (p.hue + (r * 40) + c * 25 + clock * 120) % 360;
      g.fillStyle = `hsla(${hue}, 100%, 62%, ${(lit ? 0.055 + p.bass * 0.085 : 0.022).toFixed(3)})`;
      g.beginPath();
      g.moveTo(vx + i * spreadA, yA);
      g.lineTo(vx + (i + 1) * spreadA, yA);
      g.lineTo(vx + (i + 1) * spreadB, yB);
      g.lineTo(vx + i * spreadB, yB);
      g.closePath();
      g.fill();
    }
  }
}

function drawCrowd(g, p) {
  const size = Math.min(width, height) * 0.14;
  g.globalCompositeOperation = 'source-over';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of crowd) {
    const x = c.x * width;
    const y = c.y * height + Math.sin(c.phase) * size * 0.09;
    const s = c.scale * (1 + Math.sin(c.phase * 2) * 0.08);
    g.save();
    g.translate(x, y);
    g.rotate(c.rot + Math.sin(c.phase) * 0.14);
    g.font = `${(size * s).toFixed(0)}px ${EMOJI_FONT}`;
    g.fillText('🕺', 0, 0);
    // screaming, drawn rather than played — the song is still the point
    g.font = `800 ${(size * s * 0.24).toFixed(0)}px "Segoe UI", system-ui, sans-serif`;
    g.fillStyle = `hsla(${(p.hue + 40) % 360}, 100%, 78%, ${(0.55 + Math.sin(c.phase) * 0.35).toFixed(3)})`;
    g.fillText(c.scream, size * s * 0.42, -size * s * 0.34);
    g.restore();
  }
}

function drawEqualiser(g, p) {
  const levels = p.levels;
  if (!levels || !levels.length) return;
  g.globalCompositeOperation = 'lighter';
  const bars = levels.length;
  const bw = width / bars;
  const maxH = height * 0.11;
  for (let i = 0; i < bars; i++) {
    const h = levels[i] * maxH;
    if (h < 1) continue;
    g.fillStyle = `hsla(${p.hue + (i / bars) * 80}, 100%, 60%, ${(0.1 + levels[i] * 0.2).toFixed(3)})`;
    g.fillRect(i * bw + bw * 0.15, height - h, bw * 0.7, h);
  }
}

function drawDancers(g, p) {
  const size = Math.min(width, height) * 0.13;
  const floor = height * 0.9;
  g.globalCompositeOperation = 'source-over';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `${size.toFixed(0)}px ${EMOJI_FONT}`;
  for (const d of dancers) {
    const x = d.x * width;
    const bob = Math.sin(d.phase) * size * 0.06;
    const lift = d.jump * size * 0.22;
    const y = floor - bob - lift;
    // spotlight
    g.globalCompositeOperation = 'lighter';
    const beam = g.createLinearGradient(x, y - size * 3, x, y);
    beam.addColorStop(0, 'hsla(0, 0%, 0%, 0)');
    beam.addColorStop(1, `hsla(${p.hue + d.x * 90}, 100%, 65%, ${(0.05 + p.energy * 0.12).toFixed(3)})`);
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(x - size * 0.12, y - size * 3);
    g.lineTo(x + size * 0.12, y - size * 3);
    g.lineTo(x + size * 0.8, y);
    g.lineTo(x - size * 0.8, y);
    g.closePath();
    g.fill();
    // shadow
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(0, 0, 0, ${(0.35 - d.jump * 0.15).toFixed(3)})`;
    g.beginPath();
    g.ellipse(x, floor + size * 0.06, size * (0.3 - d.jump * 0.06), size * 0.07, 0, 0, TAU);
    g.fill();
    g.save();
    g.translate(x, y);
    g.rotate(d.lean * 0.22 + Math.sin(d.phase * 0.5) * 0.09);
    g.scale(d.scale * (1 + d.jump * 0.08), d.scale * (1 + d.jump * 0.12));
    g.globalAlpha = 0.9;
    g.fillText('🕺', 0, 0);
    g.restore();
    g.globalAlpha = 1;
  }
}

function drawNotes(g) {
  g.globalCompositeOperation = 'lighter';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const n of notes) {
    const fade = Math.min(1, n.life / 0.9) * Math.min(1, (n.max - n.life) / 0.25);
    g.save();
    g.translate(n.x, n.y);
    g.rotate(n.rot);
    g.font = `600 ${n.size.toFixed(0)}px "Segoe UI Symbol", "Segoe UI", system-ui, sans-serif`;
    g.fillStyle = `hsla(${n.hue}, 100%, 72%, ${(fade * 0.6).toFixed(3)})`;
    g.fillText(n.glyph, 0, 0);
    g.restore();
  }
}

function drawSparks(g) {
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (const s of sparks) {
    const fade = Math.min(1, s.life / 0.5);
    g.strokeStyle = `hsla(${s.hue}, 100%, 78%, ${(fade * 0.9).toFixed(3)})`;
    g.lineWidth = 1.2 + fade * 2.2;
    g.beginPath();
    g.moveTo(s.x, s.y);
    g.lineTo(s.x - s.vx * 0.045, s.y - s.vy * 0.045);
    g.stroke();
  }
}
