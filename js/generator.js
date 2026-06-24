// Random organic molecule generator.
// Produces a plain-object "Molecule" describing a physical structure (raw, left-to-right
// or ring-order positions). Direction/IUPAC-numbering choice is handled later by naming.js;
// formula.js and svg-render.js consume the raw positions directly.

const MIN_CHAIN_FOR_FAMILY = {
  alkane: 1, alkene: 2, alkyne: 2, haloalkane: 1, alcohol: 1, aldehyde: 1, ketone: 3,
  carboxylicAcid: 1, amine: 1, amide: 1, ether: 1, nitrile: 1, thiol: 1
};

const RING_CAPABLE = { alkane: true, alkene: true, haloalkane: true, alcohol: true, ketone: true, thiol: true };

// Families that can receive a halogen/ene "combined functional group" extra
// (only used when generating for naming/formula questions, never for class-ID questions).
const COMBINABLE_FAMILIES = ['alkene', 'alkyne', 'haloalkane', 'alcohol', 'aldehyde', 'ketone', 'carboxylicAcid', 'amine', 'amide', 'ether', 'nitrile', 'thiol'];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice(arr) { return arr[randInt(0, arr.length - 1)]; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function maxSlots(pos, n, ring) {
  if (ring) return 2;
  if (n === 1) return 4;
  if (pos === 1 || pos === n) return 3;
  return 2;
}

function makeOccupancy(n) {
  return new Array(n + 1).fill(0);
}

function tryPlace(occupancy, pos, n, ring) {
  return placeWeighted(occupancy, pos, 1, n, ring);
}

function placeWeighted(occupancy, pos, weight, n, ring) {
  if (occupancy[pos] + weight <= maxSlots(pos, n, ring)) { occupancy[pos] += weight; return true; }
  return false;
}

// Bond-order "cost" of each principal characteristic group at its carbon
// (alcohol/amine use a single bond; ketone/aldehyde a C=O; acid/amide a C=O plus C-O/C-N).
const PRINCIPAL_WEIGHT = { alcohol: 1, ketone: 2, aldehyde: 2, carboxylicAcid: 3, amine: 1, amide: 3, nitrile: 3, thiol: 1 };

function mergeByType(list) {
  // list: [{type, pos}] -> [{type, positions:[...]}]
  const byType = {};
  list.forEach(({ type, pos }) => {
    if (!byType[type]) byType[type] = [];
    byType[type].push(pos);
  });
  return Object.keys(byType).map(type => ({ type, positions: byType[type].sort((a, b) => a - b) }));
}

function pickChainLength(family, settings, ring) {
  const lo = Math.max(settings.chainMin, MIN_CHAIN_FOR_FAMILY[family] || 1, ring ? 3 : 1);
  let hi = Math.max(lo, settings.chainMax);
  if (ring) hi = Math.min(hi, 7);
  return randInt(lo, hi);
}

function buildChainMolecule(family, settings, allowCombined) {
  const ring = RING_CAPABLE[family] && settings.features.rings && Math.random() < 0.3;
  const n = pickChainLength(family, settings, ring);
  const occupancy = makeOccupancy(n);
  let doubleBond = null;
  let tripleBond = null;
  let geometry = null;
  let principalGroup = null;
  const subPlacements = []; // {type, pos}

  const allowPosIso = !!settings.features.positionIsomerism;
  const allowMulti = !!settings.features.multiGroups;
  const allowBranch = !!settings.features.branching;

  // --- defining feature for this family ---
  if (family === 'alkene') {
    let pos;
    if (ring) {
      pos = 1; // double bond fixed at ring positions 1-2 by convention
    } else {
      pos = allowPosIso ? randInt(1, Math.max(1, n - 1)) : 1;
    }
    doubleBond = { at: pos };
    tryPlace(occupancy, pos, n, ring);
    tryPlace(occupancy, ring ? (pos % n) + 1 : pos + 1, n, ring);
  } else if (family === 'alkyne') {
    // Triple bond carbons have only one other substituent slot (terminal) or none
    // (internal), so it costs weight 2 (order 3, minus the implicit single backbone bond).
    const pos = allowPosIso ? randInt(1, Math.max(1, n - 1)) : 1;
    tripleBond = { at: pos };
    placeWeighted(occupancy, pos, 2, n, false);
    placeWeighted(occupancy, pos + 1, 2, n, false);
  } else if (family === 'haloalkane') {
    const halTypes = Object.keys(HALOGENS);
    const count = allowMulti && Math.random() < 0.35 ? 2 : 1;
    const usedPositions = [];
    for (let i = 0; i < count; i++) {
      let pos = ring ? 1 : (allowPosIso ? randInt(1, n) : 1);
      if (ring && i > 0) pos = randInt(1, n); // second halogen elsewhere on ring
      if (!ring && i > 0) pos = allowPosIso ? randInt(1, n) : Math.min(n, pos + 1);
      if (usedPositions.includes(pos) && n > 1) pos = pos === n ? pos - 1 : pos + 1;
      if (tryPlace(occupancy, pos, n, ring)) {
        subPlacements.push({ type: choice(halTypes), pos });
        usedPositions.push(pos);
      }
    }
  } else if (family === 'ether') {
    const alkoxyTypes = Object.keys(ALKOXY_SUBS).filter(t => ALKOXY_SUBS[t].carbons <= n);
    const type = alkoxyTypes.length ? choice(alkoxyTypes) : 'methoxy';
    const pos = allowPosIso ? randInt(1, n) : 1;
    if (tryPlace(occupancy, pos, n, ring)) subPlacements.push({ type, pos });
  } else if (SUFFIX_INFO[family]) {
    const info = SUFFIX_INFO[family];
    const positions = [];
    let pos;
    let ohshDegree = null;
    if (info.terminalOnly) {
      pos = 1;
    } else if (ring) {
      pos = 1;
    } else if (family === 'alcohol' || family === 'thiol') {
      // Deliberately spread across primary / secondary / tertiary alcohols (a core VCE
      // distinction - and the same applies to thiols) instead of leaving the degree to
      // chance based on whether the OH/SH and an unrelated branch happen to coincide at
      // the same carbon - which, under the plain position-isomerism-only logic below,
      // made tertiary alcohols essentially unreachable.
      const degreeOptions = ['primary'];
      if (allowPosIso && n >= 3) degreeOptions.push('secondary');
      if (allowPosIso && allowBranch && n >= 4) degreeOptions.push('tertiary');
      ohshDegree = choice(degreeOptions);
      pos = ohshDegree === 'primary' ? 1 : randInt(2, n - 1);
    } else {
      const lo = 1, hi = n;
      pos = allowPosIso ? randInt(lo, hi) : 1;
      if (family === 'ketone') pos = allowPosIso ? randInt(2, Math.max(2, n - 1)) : 2;
    }
    const weight = PRINCIPAL_WEIGHT[family];
    placeWeighted(occupancy, pos, weight, n, ring);
    positions.push(pos);
    if (ohshDegree === 'tertiary' && tryPlace(occupancy, pos, n, ring)) subPlacements.push({ type: 'methyl', pos });

    if (allowMulti && Math.random() < 0.3) {
      let pos2 = null;
      if (info.terminalOnly) {
        pos2 = n > 1 ? n : null;
      } else if (!ring) {
        const candidates = [];
        for (let p = 1; p <= n; p++) if (p !== pos && occupancy[p] + weight <= maxSlots(p, n, ring)) candidates.push(p);
        if (family === 'ketone') {
          const kc = candidates.filter(p => p >= 2 && p <= n - 1);
          pos2 = kc.length ? choice(kc) : null;
        } else {
          pos2 = candidates.length ? choice(candidates) : null;
        }
      } else {
        const candidates = [];
        for (let p = 1; p <= n; p++) if (p !== pos && occupancy[p] + weight <= maxSlots(p, n, ring)) candidates.push(p);
        pos2 = candidates.length ? choice(candidates) : null;
      }
      if (pos2 !== null && placeWeighted(occupancy, pos2, weight, n, ring)) positions.push(pos2);
    }
    principalGroup = { type: family, positions: positions.sort((a, b) => a - b) };
    if (family === 'amine' && settings.features.secondaryTertiaryAmines && principalGroup.positions.length === 1) {
      // Secondary/tertiary amines: 1 or 2 extra simple alkyl groups attached directly to
      // the nitrogen (N-substituents), distinct from the carbon-chain branches above.
      const degree = choice(['primary', 'secondary', 'tertiary']);
      const nAlkylTypes = Object.keys(ALKYL_SUBS);
      if (degree === 'secondary') principalGroup.nSubs = [choice(nAlkylTypes)];
      else if (degree === 'tertiary') principalGroup.nSubs = [choice(nAlkylTypes), choice(nAlkylTypes)];
    }
  }

  // --- combined functional group extra (naming/formula questions only) ---
  const reservedPositions = (principalGroup && principalGroup.type === 'aldehyde') ? principalGroup.positions : [];
  if (allowCombined && settings.features.combinedGroups && COMBINABLE_FAMILIES.includes(family) && Math.random() < 0.45) {
    const unsaturation = doubleBond || tripleBond;
    const skipPositions = unsaturation ? [unsaturation.at, ring ? (unsaturation.at % n) + 1 : unsaturation.at + 1] : [];
    const candidates = [];
    for (let p = 1; p <= n; p++) if (!skipPositions.includes(p) && !reservedPositions.includes(p) && occupancy[p] < maxSlots(p, n, ring)) candidates.push(p);
    if (candidates.length) {
      const pos = choice(candidates);
      const halTypes = Object.keys(HALOGENS);
      if (tryPlace(occupancy, pos, n, ring)) subPlacements.push({ type: choice(halTypes), pos });
    }
    // occasionally also add a double bond to a non-alkene family (e.g. an unsaturated alcohol/acid)
    if (!doubleBond && !tripleBond && !ring && n >= 3 && Math.random() < 0.4) {
      const principalPositions = principalGroup ? principalGroup.positions : [];
      const candidatesEne = [];
      for (let p = 1; p <= n - 1; p++) {
        if (principalPositions.includes(p) || principalPositions.includes(p + 1)) continue;
        candidatesEne.push(p);
      }
      if (candidatesEne.length) {
        const eAt = choice(candidatesEne);
        if (tryPlace(occupancy, eAt, n, ring) && tryPlace(occupancy, eAt + 1, n, ring)) {
          doubleBond = { at: eAt };
        }
      }
    }
  }

  // --- alkyl branching ---
  if (allowBranch) {
    const branchCount = allowMulti && Math.random() < 0.3 ? 2 : (Math.random() < 0.6 ? 1 : 0);
    const branchTypes = Object.keys(ALKYL_SUBS).filter(t => ALKYL_SUBS[t].carbons <= Math.max(1, Math.floor(n / 2)));
    for (let i = 0; i < branchCount; i++) {
      const validPositions = [];
      const lo = ring ? 1 : 2, hi = ring ? n : n - 1;
      for (let p = lo; p <= hi; p++) if (!reservedPositions.includes(p) && occupancy[p] < maxSlots(p, n, ring)) validPositions.push(p);
      if (!validPositions.length) break;
      const pos = choice(validPositions);
      const type = branchTypes.length ? choice(branchTypes) : 'methyl';
      if (tryPlace(occupancy, pos, n, ring)) subPlacements.push({ type, pos });
    }
  }

  // --- geometric isomerism ---
  if (doubleBond && settings.features.geometricIsomerism && !ring) {
    const a = doubleBond.at, b = doubleBond.at + 1;
    const branchAtDoubleBond = subPlacements.some(s => s.pos === a || s.pos === b)
      || (principalGroup && principalGroup.positions.some(p => p === a || p === b));
    if (a >= 2 && b <= n - 1 && !branchAtDoubleBond) {
      geometry = Math.random() < 0.5 ? 'cis' : 'trans';
    }
  }

  return {
    family, ring, chainLength: n,
    doubleBond, tripleBond, geometry, principalGroup,
    substituents: mergeByType(subPlacements)
  };
}

function buildEster(settings, allowCombined) {
  const acylLength = randInt(Math.max(1, settings.chainMin), Math.max(2, settings.chainMax));
  const alkylOptions = Object.keys(ALKYL_SUBS).filter(t => ALKYL_SUBS[t].carbons <= settings.chainMax);
  const alkylType = alkylOptions.length ? choice(alkylOptions) : 'methyl';
  const occupancy = makeOccupancy(acylLength);
  tryPlace(occupancy, 1, acylLength, false); // carbonyl carbon (C1) already "used"
  const acylSubs = [];
  if (allowCombined && settings.features.combinedGroups && acylLength >= 2 && Math.random() < 0.5) {
    const candidates = [];
    for (let p = 2; p <= acylLength; p++) if (occupancy[p] < maxSlots(p, acylLength, false)) candidates.push(p);
    if (candidates.length) {
      const pos = choice(candidates);
      if (tryPlace(occupancy, pos, acylLength, false)) acylSubs.push({ type: choice(Object.keys(HALOGENS)), pos });
    }
  }
  if (settings.features.branching && acylLength >= 3 && Math.random() < 0.4) {
    const candidates = [];
    for (let p = 2; p <= acylLength - 1; p++) if (occupancy[p] < maxSlots(p, acylLength, false)) candidates.push(p);
    if (candidates.length) {
      const pos = choice(candidates);
      if (tryPlace(occupancy, pos, acylLength, false)) acylSubs.push({ type: 'methyl', pos });
    }
  }
  return {
    family: 'ester', ring: false, chainLength: acylLength,
    doubleBond: null, geometry: null, principalGroup: null,
    substituents: mergeByType(acylSubs),
    ester: { alkylType, alkylCarbons: ALKYL_SUBS[alkylType].carbons }
  };
}

function buildAromatic(settings) {
  const subTypes = ['methyl', 'ethyl', 'fluoro', 'chloro', 'bromo', 'iodo'];
  const includeOH = Math.random() < 0.3;
  const allowTri = !!(settings.features && settings.features.triSubstitutedAromatics);
  const triSub = allowTri && Math.random() < 0.4;
  const diSub = !triSub && Math.random() < 0.5;
  const subs = [{ type: includeOH ? 'hydroxy' : choice(subTypes), ringPos: 1 }];
  if (triSub) {
    // The three relative arrangements of 3 substituents on a hexagon, up to rotation:
    // vicinal (1,2,3), asymmetric (1,2,4) and symmetric (1,3,5).
    const pattern = choice([[1, 2, 3], [1, 2, 4], [1, 3, 5]]);
    subs.push({ type: choice(subTypes), ringPos: pattern[1] });
    subs.push({ type: choice(subTypes), ringPos: pattern[2] });
  } else if (diSub) {
    const offset = choice([1, 2, 3]); // ortho, meta, para
    subs.push({ type: choice(subTypes), ringPos: 1 + offset });
  }
  return {
    family: 'aromatic', ring: true, aromatic: true, chainLength: 6,
    doubleBond: null, geometry: null, principalGroup: null,
    substituents: [],
    aromaticSubs: subs
  };
}

function generateMolecule(family, settings, allowCombined) {
  if (family === 'ester') return buildEster(settings, allowCombined);
  if (family === 'aromatic') return buildAromatic(settings);
  return buildChainMolecule(family, settings, allowCombined);
}

if (typeof module !== 'undefined') {
  module.exports = { generateMolecule, randInt, choice, shuffle, MIN_CHAIN_FOR_FAMILY, RING_CAPABLE };
}
