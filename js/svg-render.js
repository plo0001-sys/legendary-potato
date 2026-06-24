// Renders a Molecule object (see generator.js) as a skeletal-formula SVG string.
// Carbons are implicit vertices (standard skeletal convention); heteroatoms and
// halogens are drawn as labelled atoms with a background-matched halo so bond lines
// appear to terminate at the letter rather than running through it.

// Every bond line (chain, branch, ring edge) is drawn at this same length so nothing
// in a diagram looks stretched or squashed relative to anything else.
const BOND_LEN = 38;
const ZIGZAG_ANGLE = Math.PI / 6; // 30 degrees from horizontal, standard skeletal zigzag
const BOND = BOND_LEN * Math.cos(ZIGZAG_ANGLE);
const AMP = BOND_LEN * Math.sin(ZIGZAG_ANGLE);
const STROKE = '#1c2530';
const BRANCH_STEP = BOND_LEN;
// Must match .question-diagram's background in css/styles.css so label halos blend in.
const DIAGRAM_BG = '#fafbfc';
// Ring double bonds (cyclo-/aromatic) keep a shorter inner line, clear of adjacent edges.
const RING_INNER_SHRINK = 0.12;

function lineEl(x1, y1, x2, y2) {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${STROKE}" stroke-width="2" stroke-linecap="round"/>`;
}

// Both lines of a double bond are pure parallel translations of the same vertex-to-vertex
// segment (by (t1x,t1y) and (t2x,t2y)), so the two stay exactly the same length unless the
// second is explicitly shrunk - independently at each end (shrinkStart, shrinkEnd, 0-1),
// e.g. for a ring's inner line, or only on whichever end actually has another bond nearby.
function doubleLineEl(x1, y1, x2, y2, t1x, t1y, t2x, t2y, shrinkStart, shrinkEnd) {
  const line1 = lineEl(x1 + t1x, y1 + t1y, x2 + t1x, y2 + t1y);
  const dx = x2 - x1, dy = y2 - y1;
  const sx1 = x1 + dx * (shrinkStart || 0), sy1 = y1 + dy * (shrinkStart || 0);
  const sx2 = x2 - dx * (shrinkEnd || 0), sy2 = y2 - dy * (shrinkEnd || 0);
  const line2 = lineEl(sx1 + t2x, sy1 + t2y, sx2 + t2x, sy2 + t2y);
  return line1 + line2;
}

// A triple bond is the exact vertex-to-vertex line plus two more, offset to either side
// (mirroring doubleLineEl's translate+shrink pattern, just symmetric and one more line).
function tripleLineEl(x1, y1, x2, y2, ratio, shrinkStart, shrinkEnd) {
  const center = lineEl(x1, y1, x2, y2);
  const dx = x2 - x1, dy = y2 - y1;
  const sx1 = x1 + dx * (shrinkStart || 0), sy1 = y1 + dy * (shrinkStart || 0);
  const sx2 = x2 - dx * (shrinkEnd || 0), sy2 = y2 - dy * (shrinkEnd || 0);
  const tA = perpTranslate(x1, y1, x2, y2, 1, ratio);
  const tB = perpTranslate(x1, y1, x2, y2, -1, ratio);
  const lineA = lineEl(sx1 + tA.x, sy1 + tA.y, sx2 + tA.x, sy2 + tA.y);
  const lineB = lineEl(sx1 + tB.x, sy1 + tB.y, sx2 + tB.x, sy2 + tB.y);
  return center + lineA + lineB;
}

// Default sideways translation for a double bond with no particular bond to lean
// toward (e.g. a ring edge or a carbonyl): perpendicular to the bond, to the given side.
function perpTranslate(x1, y1, x2, y2, sign, ratio) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const off = len * (ratio || 0.24);
  return { x: px * off * (sign || 1), y: py * off * (sign || 1) };
}

// Angular offsets (from a vertex's base direction) for however many branch items share
// that vertex. 2 items split evenly either side; 3+ spread evenly across a wider arc so
// no two items end up aimed in the same direction (which previously made the 2-item case's
// "else +-0.9" collapse two distinct items onto one angle whenever a 3rd was present).
function spreadOffsets(count) {
  if (count <= 1) return [0];
  if (count === 2) return [-0.9, 0.9];
  const span = 2.2;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + i * step);
}

// Plain chain C=C bonds (no carbonyl, no ring) keep a tighter gap, and the inner line is
// shortened at both ends so it doesn't run right up to the neighbouring bonds/vertices.
const CHAIN_DOUBLE_BOND_RATIO = 0.16;
const CHAIN_DOUBLE_BOND_SHRINK = 0.14;
// Triple bonds offset symmetrically to both sides of the centre line, so each side uses a
// slightly tighter ratio than a double bond's single-sided offset to avoid looking too wide.
const CHAIN_TRIPLE_BOND_RATIO = 0.13;

// Which side of an edge points toward a reference point (e.g. a ring's centre).
function signToward(x1, y1, x2, y2, cx, cy) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  return (px * (cx - midX) + py * (cy - midY)) >= 0 ? 1 : -1;
}

// Which side of the branch's own axis (vx,vy)->(exX,exY) a reference point falls on.
// Used only to choose left/right for the offset below - never to drag the line off its
// own axis, which is what caused the lines to swing across and cross each other.
function sideOfAxis(vx, vy, exX, exY, refX, refY) {
  const dx = exX - vx, dy = exY - vy;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  return (px * (refX - vx) + py * (refY - vy)) >= 0 ? 1 : -1;
}

function segCross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = segCross([ax, ay], [bx, by], [cx, cy]);
  const d2 = segCross([ax, ay], [bx, by], [dx, dy]);
  const d3 = segCross([cx, cy], [dx, dy], [ax, ay]);
  const d4 = segCross([cx, cy], [dx, dy], [bx, by]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// A carbonyl carbon with two other bonds flanking it (e.g. the chain continuing on both
// sides, as in a mid-chain ketone) gets one double-bond line offset to each side, so the
// pair reads as symmetric around the vertex. With only one flanking bond (or none, e.g.
// methanoic acid) - a double bond "at the end" - the first line just extends normally
// (exactly on the vertex) and only the second is shifted over, like an ordinary bond -
// away from a sibling branch (e.g. NH2/OH) if there is one, so it doesn't crowd it.
function flankingTranslates(vx, vy, stopX, stopY, leanA, leanB, avoidPoint, crowded) {
  if (leanA && leanB) {
    const sa = sideOfAxis(vx, vy, stopX, stopY, leanA.x, leanA.y);
    const sb = sideOfAxis(vx, vy, stopX, stopY, leanB.x, leanB.y);
    return { a: perpTranslate(vx, vy, stopX, stopY, sa, 0.17), b: perpTranslate(vx, vy, stopX, stopY, sb, 0.17) };
  }
  const lean = leanA || leanB;
  let sign;
  if (avoidPoint) {
    sign = -sideOfAxis(vx, vy, stopX, stopY, avoidPoint.x, avoidPoint.y);
  } else {
    sign = lean ? sideOfAxis(vx, vy, stopX, stopY, lean.x, lean.y) : 1;
  }
  // With 2+ other items sharing this vertex (e.g. a carboxylic acid's OH plus a halogen
  // extra), they're packed more tightly than the usual single-sibling case, so the default
  // offset ratio reaches far enough to cross a neighbour's bond. Pull the ratio in, and
  // pull the offset line's start back from the vertex too - it otherwise starts exactly
  // where the other siblings also branch off from, in their direction's way.
  const ratio = crowded ? 0.12 : undefined;
  const shrinkStart = crowded ? 0.18 : 0;
  // The sign above only ever considers ONE thing to avoid (the sibling, or else the lean
  // as just a stable reference) - never both at once. If whichever it picked happens to
  // swing the offset line into the chain's own backbone bond on the lean side, flip it.
  if (lean) {
    const dx = stopX - vx, dy = stopY - vy;
    const off = perpTranslate(vx, vy, stopX, stopY, sign, ratio);
    const lx1 = vx + dx * shrinkStart + off.x, ly1 = vy + dy * shrinkStart + off.y;
    const lx2 = stopX + off.x, ly2 = stopY + off.y;
    if (segIntersect(lx1, ly1, lx2, ly2, vx, vy, lean.x, lean.y)) sign = -sign;
  }
  return { a: { x: 0, y: 0 }, b: perpTranslate(vx, vy, stopX, stopY, sign, ratio), shrinkStart };
}

function labelEl(x, y, text) {
  const w = Math.max(18, text.length * 9 + 4);
  return `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="${w.toFixed(1)}" height="18" fill="${DIAGRAM_BG}"/>` +
    `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" font-size="15" text-anchor="middle" fill="${STROKE}">${text}</text>`;
}

class Scene {
  constructor() { this.bonds = []; this.atoms = []; this.minX = 0; this.minY = 0; this.maxX = 0; this.maxY = 0; this.vertices = new Set(); this.segments = []; }
  touch(x, y) {
    this.minX = Math.min(this.minX, x); this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y); this.maxY = Math.max(this.maxY, y);
  }
  // True structural endpoints only (not double/triple bond offset lines) - used to steer
  // later branches away from accidentally re-landing on an already-occupied position.
  markVertex(x, y) { this.vertices.add(`${x.toFixed(1)},${y.toFixed(1)}`); }
  hasVertex(x, y) { return this.vertices.has(`${x.toFixed(1)},${y.toFixed(1)}`); }
  recordSegment(x1, y1, x2, y2) { this.segments.push([x1, y1, x2, y2]); }
  // True line-crossing test against every bond drawn so far (not just shared endpoints) -
  // catches a branch's middle segment sweeping through an unrelated bond it never actually
  // touches a vertex of, which hasVertex alone can't see.
  crossesAny(x1, y1, x2, y2) {
    return this.segments.some(([ax, ay, bx, by]) => {
      const shareEndpoint = [[x1, y1], [x2, y2]].some(([px, py]) =>
        Math.hypot(px - ax, py - ay) < 0.5 || Math.hypot(px - bx, py - by) < 0.5);
      if (shareEndpoint) return false;
      return segIntersect(x1, y1, x2, y2, ax, ay, bx, by);
    });
  }
  bond(x1, y1, x2, y2, double, t1x, t1y, t2x, t2y, shrinkStart, shrinkEnd) {
    this.touch(x1, y1); this.touch(x2, y2);
    this.markVertex(x1, y1); this.markVertex(x2, y2);
    if (!double) { this.bonds.push(lineEl(x1, y1, x2, y2)); this.recordSegment(x1, y1, x2, y2); return; }
    if (t1x === undefined) {
      t1x = 0; t1y = 0;
      const t = perpTranslate(x1, y1, x2, y2, 1, CHAIN_DOUBLE_BOND_RATIO);
      t2x = t.x; t2y = t.y;
    }
    this.touch(x1 + t1x, y1 + t1y); this.touch(x2 + t1x, y2 + t1y);
    this.touch(x1 + t2x, y1 + t2y); this.touch(x2 + t2x, y2 + t2y);
    this.bonds.push(doubleLineEl(x1, y1, x2, y2, t1x, t1y, t2x, t2y, shrinkStart, shrinkEnd));
    this.recordSegment(x1 + t1x, y1 + t1y, x2 + t1x, y2 + t1y);
    const dx = x2 - x1, dy = y2 - y1;
    const sx1 = x1 + dx * (shrinkStart || 0), sy1 = y1 + dy * (shrinkStart || 0);
    const sx2 = x2 - dx * (shrinkEnd || 0), sy2 = y2 - dy * (shrinkEnd || 0);
    this.recordSegment(sx1 + t2x, sy1 + t2y, sx2 + t2x, sy2 + t2y);
  }
  tripleBond(x1, y1, x2, y2, shrinkStart, shrinkEnd) {
    this.touch(x1, y1); this.touch(x2, y2);
    this.markVertex(x1, y1); this.markVertex(x2, y2);
    const tA = perpTranslate(x1, y1, x2, y2, 1, CHAIN_TRIPLE_BOND_RATIO);
    const tB = perpTranslate(x1, y1, x2, y2, -1, CHAIN_TRIPLE_BOND_RATIO);
    this.touch(x1 + tA.x, y1 + tA.y); this.touch(x2 + tA.x, y2 + tA.y);
    this.touch(x1 + tB.x, y1 + tB.y); this.touch(x2 + tB.x, y2 + tB.y);
    this.bonds.push(tripleLineEl(x1, y1, x2, y2, CHAIN_TRIPLE_BOND_RATIO, shrinkStart, shrinkEnd));
    this.recordSegment(x1, y1, x2, y2);
    this.recordSegment(x1 + tA.x, y1 + tA.y, x2 + tA.x, y2 + tA.y);
    this.recordSegment(x1 + tB.x, y1 + tB.y, x2 + tB.x, y2 + tB.y);
  }
  atom(x, y, text) {
    this.touch(x, y);
    this.markVertex(x, y);
    this.atoms.push(labelEl(x, y, text));
  }
  toSvg() {
    const pad = 26;
    const x0 = this.minX - pad, y0 = this.minY - pad;
    const w = (this.maxX - this.minX) + pad * 2;
    const h = (this.maxY - this.minY) + pad * 2;
    const body = this.bonds.join('') + this.atoms.join('');
    return `<svg class="skeletal" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${Math.min(420, w * 1.6)}" height="${Math.min(280, h * 1.6)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }
}

// Stops a bond short of a labelled atom's centre, so neither line of a double bond
// (each ends at a slightly different point once offset) can poke past a small halo box.
const LABEL_CLEARANCE = 10;

function shortened(x1, y1, x2, y2, clearance) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.max(0, (len - clearance) / len);
  return { x: x1 + dx * t, y: y1 + dy * t };
}

// Does a zigzag starting here, with this angle/turn sign, collide with anything already
// drawn - either by landing on an existing vertex, or by a segment sweeping through an
// existing bond it never actually shares an endpoint with.
function branchPathCollides(scene, x, y, baseAngle, carbons, turnSign) {
  let cx = x, cy = y;
  for (let i = 0; i < carbons; i++) {
    const angle = i % 2 === 0 ? baseAngle : baseAngle - turnSign * 2 * ZIGZAG_ANGLE;
    const nx = cx + Math.cos(angle) * BRANCH_STEP, ny = cy + Math.sin(angle) * BRANCH_STEP;
    if (scene.hasVertex(nx, ny) || scene.crossesAny(cx, cy, nx, ny)) return true;
    cx = nx; cy = ny;
  }
  return false;
}

// A continuation chain starting from a label (alkoxy's O, amino's N) always turns away
// from the incoming direction by one zigzag angle - but turning left vs. right are equally
// valid starting choices. branchChain's own turnSign search only varies steps after the
// first, so it can't dodge a collision that happens right at that first, turn-independent
// step; trying both starting turns here covers that case too.
function pickContinuationAngle(scene, x, y, inAngle, carbons) {
  const candidates = [inAngle - 2 * ZIGZAG_ANGLE, inAngle + 2 * ZIGZAG_ANGLE];
  for (const startAngle of candidates) {
    const clean = [1, -1].some(sign => !branchPathCollides(scene, x, y, startAngle, carbons, sign));
    if (clean) return startAngle;
  }
  return candidates[0];
}

function branchChain(scene, x, y, dirX, dirY, carbons, awayFrom) {
  // Zigzags by alternating the bond angle +/-60 degrees around the branch's own axis
  // (same turn as the main chain's zigzag). Flipping just one coordinate only works for
  // diagonal directions - for a purely vertical/horizontal branch it retraced itself.
  const baseAngle = Math.atan2(dirY, dirX);
  // On a ring, two neighbouring substituted carbons can each zigzag toward each other
  // and cross. Pick whichever turn direction ends up farther from the ring's centre.
  let turnSign = 1;
  if (awayFrom && carbons > 1) {
    const x1 = x + Math.cos(baseAngle) * BRANCH_STEP, y1 = y + Math.sin(baseAngle) * BRANCH_STEP;
    const angleNeg = baseAngle - 2 * ZIGZAG_ANGLE, anglePos = baseAngle + 2 * ZIGZAG_ANGLE;
    const dNeg = Math.hypot(x1 + Math.cos(angleNeg) * BRANCH_STEP - awayFrom.x, y1 + Math.sin(angleNeg) * BRANCH_STEP - awayFrom.y);
    const dPos = Math.hypot(x1 + Math.cos(anglePos) * BRANCH_STEP - awayFrom.x, y1 + Math.sin(anglePos) * BRANCH_STEP - awayFrom.y);
    turnSign = dPos > dNeg ? -1 : 1;
  } else if (carbons > 1) {
    // No ring-avoidance constraint to satisfy - a multi-carbon branch can otherwise
    // coincidentally re-land on or sweep through a vertex/bond used elsewhere in the
    // molecule, since every branch shares the same step length and turn angle. Prefer
    // whichever turn direction lands on fresh ground.
    if (branchPathCollides(scene, x, y, baseAngle, carbons, 1) && !branchPathCollides(scene, x, y, baseAngle, carbons, -1)) turnSign = -1;
  }
  let cx = x, cy = y;
  for (let i = 0; i < carbons; i++) {
    const angle = i % 2 === 0 ? baseAngle : baseAngle - turnSign * 2 * ZIGZAG_ANGLE;
    const nx = cx + Math.cos(angle) * BRANCH_STEP, ny = cy + Math.sin(angle) * BRANCH_STEP;
    scene.bond(cx, cy, nx, ny, false);
    cx = nx; cy = ny;
  }
  return { x: cx, y: cy };
}

function placeAt(scene, vx, vy, dirX, dirY, item, leanA, leanB, avoidPoint, awayFrom, itemCount) {
  const ex = vx + dirX * BRANCH_STEP, ey = vy + dirY * BRANCH_STEP;
  const stop = shortened(vx, vy, ex, ey, LABEL_CLEARANCE);
  if (HALOGENS[item.type]) {
    scene.bond(vx, vy, stop.x, stop.y, false);
    scene.atom(ex, ey, HALOGENS[item.type].symbol);
  } else if (ALKYL_SUBS[item.type]) {
    branchChain(scene, vx, vy, dirX, dirY, ALKYL_SUBS[item.type].carbons, awayFrom);
  } else if (ALKOXY_SUBS[item.type]) {
    scene.bond(vx, vy, stop.x, stop.y, false);
    scene.atom(ex, ey, 'O');
    // Turn away from the incoming vertex->O direction by a normal zigzag turn, rather
    // than just flipping the y-sign - which retraces straight back over the vertex
    // whenever the attachment is purely vertical (the common single-substituent case).
    const inAngle = Math.atan2(dirY, dirX);
    const outAngle = pickContinuationAngle(scene, ex, ey, inAngle, ALKOXY_SUBS[item.type].carbons);
    branchChain(scene, ex, ey, Math.cos(outAngle), Math.sin(outAngle), ALKOXY_SUBS[item.type].carbons);
  } else if (item.type === 'OH') {
    scene.bond(vx, vy, stop.x, stop.y, false);
    scene.atom(ex, ey, 'OH');
  } else if (item.type === 'NH2') {
    scene.bond(vx, vy, stop.x, stop.y, false);
    scene.atom(ex, ey, 'NH2');
  } else if (item.type === 'aminoN') {
    const nSubs = item.nSubs;
    const label = nSubs.length === 1 ? 'NH' : 'N';
    scene.bond(vx, vy, stop.x, stop.y, false);
    scene.atom(ex, ey, label);
    // Same "turn away from the incoming direction by a zigzag angle" pattern as alkoxy's
    // own continuation - for two N-substituents, turn the same amount each way so they
    // spread symmetrically (120 degrees apart) instead of overlapping each other.
    const inAngle = Math.atan2(dirY, dirX);
    if (nSubs.length === 1) {
      const outAngle = pickContinuationAngle(scene, ex, ey, inAngle, ALKYL_SUBS[nSubs[0]].carbons);
      branchChain(scene, ex, ey, Math.cos(outAngle), Math.sin(outAngle), ALKYL_SUBS[nSubs[0]].carbons);
    } else {
      const carbonsA = ALKYL_SUBS[nSubs[0]].carbons, carbonsB = ALKYL_SUBS[nSubs[1]].carbons;
      const clean = (angle, carbons) => [1, -1].some(sign => !branchPathCollides(scene, ex, ey, angle, carbons, sign));
      // Try the symmetric +-60 degree pair first (in both assignments), then a wider +-90
      // spread, so a substituent blocked at the default angle still has a real fallback
      // instead of a known collision being accepted outright.
      let angleA = inAngle - 2 * ZIGZAG_ANGLE, angleB = inAngle + 2 * ZIGZAG_ANGLE;
      for (const span of [2 * ZIGZAG_ANGLE, 3 * ZIGZAG_ANGLE]) {
        const neg = inAngle - span, pos = inAngle + span;
        if (clean(neg, carbonsA) && clean(pos, carbonsB)) { angleA = neg; angleB = pos; break; }
        if (clean(pos, carbonsA) && clean(neg, carbonsB)) { angleA = pos; angleB = neg; break; }
      }
      branchChain(scene, ex, ey, Math.cos(angleA), Math.sin(angleA), carbonsA);
      branchChain(scene, ex, ey, Math.cos(angleB), Math.sin(angleB), carbonsB);
    }
  } else if (item.type === 'SH') {
    scene.bond(vx, vy, stop.x, stop.y, false);
    scene.atom(ex, ey, 'SH');
  } else if (item.type === 'ketoneO') {
    const { a, b, shrinkStart } = flankingTranslates(vx, vy, stop.x, stop.y, leanA, leanB, avoidPoint, itemCount >= 3);
    scene.bond(vx, vy, stop.x, stop.y, true, a.x, a.y, b.x, b.y, shrinkStart || 0, 0);
    // Centre the label between the two lines as actually drawn, not the unshifted point.
    scene.atom(ex + (a.x + b.x) / 2, ey + (a.y + b.y) / 2, 'O');
  } else if (item.type === 'nitrileN') {
    scene.tripleBond(vx, vy, stop.x, stop.y, 0, 0);
    scene.atom(ex, ey, 'N');
  }
}

function rowOf(i) { return i % 2 === 0 ? 1 : 0; } // 0 = top row, 1 = bottom row

function buildChainGroups(mol) {
  // per-position list of {type} items to render as branches, mirroring formula.js logic
  const n = mol.chainLength;
  const groups = new Array(n + 1).fill(null).map(() => []);
  mol.substituents.forEach(s => s.positions.forEach(p => groups[p].push({ type: s.type })));
  if (mol.principalGroup) {
    const t = mol.principalGroup.type;
    mol.principalGroup.positions.forEach(p => {
      if (t === 'alcohol') groups[p].push({ type: 'OH' });
      else if (t === 'amine') {
        const nSubs = mol.principalGroup.nSubs;
        groups[p].push(nSubs && nSubs.length ? { type: 'aminoN', nSubs } : { type: 'NH2' });
      }
      else if (t === 'ketone') groups[p].push({ type: 'ketoneO' });
      else if (t === 'aldehyde') groups[p].push({ type: 'ketoneO' });
      else if (t === 'carboxylicAcid') groups[p].push({ type: 'ketoneO' }, { type: 'OH' });
      else if (t === 'amide') groups[p].push({ type: 'ketoneO' }, { type: 'NH2' });
      else if (t === 'nitrile') groups[p].push({ type: 'nitrileN' });
      else if (t === 'thiol') groups[p].push({ type: 'SH' });
    });
  }
  return groups;
}

function renderChain(mol) {
  const n = mol.chainLength;
  const scene = new Scene();
  const pos = [];
  for (let i = 1; i <= n; i++) pos[i] = { x: (i - 1) * BOND, y: rowOf(i) * AMP };
  const groups = buildChainGroups(mol);
  // A bare chain terminus (e.g. the =CH2 end of a terminal alkene) has nothing else
  // nearby, so only shrink whichever end of a double bond actually has another bond.
  const hasOtherBonds = p => (p > 1 && p < n) || (groups[p] && groups[p].length > 0);
  for (let i = 1; i < n; i++) {
    const isDouble = mol.doubleBond && mol.doubleBond.at === i;
    const isTriple = mol.tripleBond && mol.tripleBond.at === i;
    if (isTriple) {
      const shrinkStart = hasOtherBonds(i) ? CHAIN_DOUBLE_BOND_SHRINK : 0;
      const shrinkEnd = hasOtherBonds(i + 1) ? CHAIN_DOUBLE_BOND_SHRINK : 0;
      scene.tripleBond(pos[i].x, pos[i].y, pos[i + 1].x, pos[i + 1].y, shrinkStart, shrinkEnd);
      continue;
    }
    const shrinkStart = isDouble && hasOtherBonds(i) ? CHAIN_DOUBLE_BOND_SHRINK : 0;
    const shrinkEnd = isDouble && hasOtherBonds(i + 1) ? CHAIN_DOUBLE_BOND_SHRINK : 0;
    scene.bond(pos[i].x, pos[i].y, pos[i + 1].x, pos[i + 1].y, !!isDouble, undefined, undefined, undefined, undefined, shrinkStart, shrinkEnd);
  }
  // ensure every vertex is registered even if n === 1
  pos.slice(1).forEach(p => { scene.touch(p.x, p.y); scene.markVertex(p.x, p.y); });

  // Fixed-direction items (regular branches, halogens, etc.) have no choice of angle, so
  // place them first; label-continuation items (alkoxy/amino) can choose between two
  // starting turns, and placing them second lets that choice see - and dodge - every
  // fixed branch already on the board, not just ones at lower-numbered positions.
  const fixedJobs = [], flexibleJobs = [];
  for (let i = 1; i <= n; i++) {
    const items = groups[i];
    if (!items.length) continue;
    const baseAngle = rowOf(i) === 0 ? -Math.PI / 2 : Math.PI / 2;
    // A carbonyl double bond here leans one line toward each flanking chain carbon
    // (previous/next), so the pair sits symmetrically around the vertex.
    const leanA = i > 1 ? pos[i - 1] : null;
    const leanB = i < n ? pos[i + 1] : null;
    const offsets = spreadOffsets(items.length);
    items.forEach((item, idx) => {
      const a = baseAngle + offsets[idx];
      let avoidPoint = null;
      if (items.length > 1) {
        const others = offsets.filter((_, j) => j !== idx);
        const ox = others.reduce((s, o) => s + Math.cos(baseAngle + o), 0) / others.length;
        const oy = others.reduce((s, o) => s + Math.sin(baseAngle + o), 0) / others.length;
        avoidPoint = { x: pos[i].x + ox * BRANCH_STEP, y: pos[i].y + oy * BRANCH_STEP };
      }
      const job = { x: pos[i].x, y: pos[i].y, dirX: Math.cos(a), dirY: Math.sin(a), item, leanA, leanB, avoidPoint, itemCount: items.length };
      const flexible = ALKOXY_SUBS[item.type] || item.type === 'aminoN';
      (flexible ? flexibleJobs : fixedJobs).push(job);
    });
  }
  fixedJobs.forEach(j => placeAt(scene, j.x, j.y, j.dirX, j.dirY, j.item, j.leanA, j.leanB, j.avoidPoint, undefined, j.itemCount));
  flexibleJobs.forEach(j => placeAt(scene, j.x, j.y, j.dirX, j.dirY, j.item, j.leanA, j.leanB, j.avoidPoint, undefined, j.itemCount));
  return scene.toSvg();
}

function renderRing(mol) {
  const n = mol.chainLength;
  const scene = new Scene();
  const R = BOND_LEN / (2 * Math.sin(Math.PI / n));
  const pos = [];
  for (let i = 1; i <= n; i++) {
    const angle = -Math.PI / 2 + (i - 1) * (2 * Math.PI / n);
    pos[i] = { x: R * Math.cos(angle), y: R * Math.sin(angle) };
  }
  // A 3-membered ring is so tight that the double bond's default inner-line offset
  // (sized for the common 5/6-membered case) overshoots past the opposite edge entirely.
  const innerRatio = n === 3 ? 0.18 : undefined;
  for (let i = 1; i <= n; i++) {
    const j = (i % n) + 1;
    const isDouble = mol.doubleBond && mol.doubleBond.at === i;
    const sign = signToward(pos[i].x, pos[i].y, pos[j].x, pos[j].y, 0, 0);
    const t = perpTranslate(pos[i].x, pos[i].y, pos[j].x, pos[j].y, sign, innerRatio);
    scene.bond(pos[i].x, pos[i].y, pos[j].x, pos[j].y, !!isDouble, 0, 0, t.x, t.y, RING_INNER_SHRINK, RING_INNER_SHRINK);
  }
  const groups = buildChainGroups(mol);
  for (let i = 1; i <= n; i++) {
    const items = groups[i];
    if (!items.length) continue;
    const angle = -Math.PI / 2 + (i - 1) * (2 * Math.PI / n);
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    // A ring carbon's two ring bonds are its flanking bonds (like a mid-chain ketone's
    // two chain neighbours), so a C=O here echoes both rather than floating off to one side.
    const ringPrev = pos[i > 1 ? i - 1 : n];
    const ringNext = pos[i < n ? i + 1 : 1];
    const offsets = spreadOffsets(items.length);
    items.forEach((item, idx) => {
      const a2 = angle + offsets[idx];
      placeAt(scene, pos[i].x, pos[i].y, Math.cos(a2), Math.sin(a2), item, ringPrev, ringNext, null, { x: 0, y: 0 });
    });
  }
  return scene.toSvg();
}

function renderAromatic(mol) {
  const scene = new Scene();
  const n = 6;
  const R = BOND_LEN / (2 * Math.sin(Math.PI / n));
  const pos = [];
  for (let i = 1; i <= n; i++) {
    const angle = -Math.PI / 2 + (i - 1) * (2 * Math.PI / n);
    pos[i] = { x: R * Math.cos(angle), y: R * Math.sin(angle) };
  }
  for (let i = 1; i <= n; i++) {
    const j = (i % n) + 1;
    const sign = signToward(pos[i].x, pos[i].y, pos[j].x, pos[j].y, 0, 0);
    const t = perpTranslate(pos[i].x, pos[i].y, pos[j].x, pos[j].y, sign);
    scene.bond(pos[i].x, pos[i].y, pos[j].x, pos[j].y, i % 2 === 1, 0, 0, t.x, t.y, RING_INNER_SHRINK, RING_INNER_SHRINK);
  }
  const subs = mol.aromaticSubs;
  subs.forEach(s => {
    const ringPos = s.ringPos;
    const angle = -Math.PI / 2 + (ringPos - 1) * (2 * Math.PI / n);
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    if (s.type === 'hydroxy') {
      placeAt(scene, pos[ringPos].x, pos[ringPos].y, dirX, dirY, { type: 'OH' });
    } else {
      placeAt(scene, pos[ringPos].x, pos[ringPos].y, dirX, dirY, { type: s.type });
    }
  });
  return scene.toSvg();
}

function renderEster(mol) {
  const n = mol.chainLength;
  const scene = new Scene();
  // continuous backbone: acyl carbons (n .. 1) - O - alkyl carbons, drawn left to right
  const total = n + 1 + mol.ester.alkylCarbons;
  const xy = i => ({ x: (i - 1) * BOND, y: rowOf(i) * AMP });
  const acylPos = []; // acylPos[k] = backbone index for acyl carbon k (1=carbonyl)
  for (let k = n; k >= 1; k--) acylPos[k] = n - k + 1;
  const linkIndex = n + 1;
  const alkylStart = n + 2;

  for (let k = n; k >= 2; k--) {
    const a = xy(acylPos[k]), b = xy(acylPos[k - 1]);
    scene.bond(a.x, a.y, b.x, b.y, false);
  }
  const carbonylVertex = xy(acylPos[1]);
  const linkVertex = xy(linkIndex);
  const toLink = shortened(carbonylVertex.x, carbonylVertex.y, linkVertex.x, linkVertex.y, LABEL_CLEARANCE);
  scene.bond(carbonylVertex.x, carbonylVertex.y, toLink.x, toLink.y, false);
  scene.atom(linkVertex.x, linkVertex.y, 'O');
  const carbonylODir = rowOf(acylPos[1]) === 0 ? -1 : 1;
  const priorAcylVertex = n > 1 ? xy(acylPos[2]) : null;
  placeAt(scene, carbonylVertex.x, carbonylVertex.y, 0, carbonylODir, { type: 'ketoneO' }, priorAcylVertex, linkVertex);

  let prev = linkVertex;
  for (let k = 0; k < mol.ester.alkylCarbons; k++) {
    const idx = alkylStart + k;
    const v = xy(idx);
    const from = k === 0 ? shortened(v.x, v.y, prev.x, prev.y, LABEL_CLEARANCE) : prev;
    scene.bond(from.x, from.y, v.x, v.y, false);
    prev = v;
  }

  // acyl-chain substituents (halogens / methyl branch)
  const groups = new Array(n + 1).fill(null).map(() => []);
  mol.substituents.forEach(s => s.positions.forEach(p => groups[p].push({ type: s.type })));
  for (let k = 2; k <= n; k++) {
    const items = groups[k];
    if (!items.length) continue;
    const backboneIdx = acylPos[k];
    const v = xy(backboneIdx);
    const baseAngle = rowOf(backboneIdx) === 0 ? -Math.PI / 2 : Math.PI / 2;
    const offsets = spreadOffsets(items.length);
    items.forEach((item, idx) => {
      const a = baseAngle + offsets[idx];
      placeAt(scene, v.x, v.y, Math.cos(a), Math.sin(a), item);
    });
  }
  return scene.toSvg();
}

function renderMolecule(mol) {
  if (mol.family === 'ester') return renderEster(mol);
  if (mol.family === 'aromatic') return renderAromatic(mol);
  if (mol.ring) return renderRing(mol);
  return renderChain(mol);
}

if (typeof module !== 'undefined') {
  module.exports = { renderMolecule };
}
