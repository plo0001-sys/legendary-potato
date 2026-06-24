// Converts a generated Molecule object (see generator.js) into an IUPAC name string.
// Numbering direction is chosen here (lowest-locant rules); generator.js positions are
// physical/raw and direction-agnostic.

function applyNumbering(p, s0, d, n) {
  const p0 = p - 1;
  return (((p0 - s0) * d) % n + n) % n + 1;
}

function otherUnsatAtom(mol, n, bond) {
  return mol.ring ? (bond.at % n) + 1 : bond.at + 1;
}

function getNumberingCandidates(mol, n) {
  if (!mol.ring) return [{ s0: 0, d: 1 }, { s0: n - 1, d: -1 }];
  if (mol.doubleBond) return [{ s0: 0, d: 1 }, { s0: mol.doubleBond.at, d: -1 }];
  if (mol.principalGroup) return [{ s0: 0, d: 1 }, { s0: 0, d: -1 }];
  const out = [];
  for (let s0 = 0; s0 < n; s0++) { out.push({ s0, d: 1 }); out.push({ s0, d: -1 }); }
  return out;
}

function compareLocantArrays(a, b) {
  const sa = a.slice().sort((x, y) => x - y);
  const sb = b.slice().sort((x, y) => x - y);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const av = sa[i] === undefined ? Infinity : sa[i];
    const bv = sb[i] === undefined ? Infinity : sb[i];
    if (av !== bv) return av - bv;
  }
  return 0;
}

function scoreCandidate(mol, n, cand) {
  const map = p => applyNumbering(p, cand.s0, cand.d, n);
  const principal = mol.principalGroup ? mol.principalGroup.positions.map(map) : null;
  const unsatBond = mol.doubleBond || mol.tripleBond;
  const ene = unsatBond ? [Math.min(map(unsatBond.at), map(otherUnsatAtom(mol, n, unsatBond)))] : null;
  const subs = [];
  mol.substituents.forEach(s => s.positions.forEach(p => subs.push(map(p))));
  return { principal, ene, subs, map };
}

function pickBestCandidate(mol, n) {
  const candidates = getNumberingCandidates(mol, n);
  let best = null;
  candidates.forEach(cand => {
    const sc = scoreCandidate(mol, n, cand);
    if (!best) { best = sc; return; }
    let c = 0;
    if (sc.principal && best.principal) c = compareLocantArrays(sc.principal, best.principal);
    if (c === 0 && sc.ene && best.ene) c = compareLocantArrays(sc.ene, best.ene);
    if (c === 0) c = compareLocantArrays(sc.subs, best.subs);
    if (c < 0) best = sc;
  });
  return best;
}

function showLocant(n, count, ring, terminalOnly, isOnlyFeature, manyGroups) {
  if (terminalOnly) return false;
  if (count >= 2) return true;
  if (ring && isOnlyFeature) return false;
  if (manyGroups) return true;
  return n > 2;
}

function buildSubstituentPrefix(mol, mapFn, n, extraEntries) {
  const isOnlyFeature = !mol.principalGroup && !mol.doubleBond && !mol.tripleBond && mol.substituents.length === 1 && mol.substituents[0].positions.length === 1;
  const totalGroups = mol.substituents.length + (mol.principalGroup ? 1 : 0);
  const manyGroups = totalGroups > 2;
  const entries = mol.substituents.map(s => {
    const info = PREFIX_SUB_TYPES[s.type];
    const mapped = s.positions.map(mapFn).sort((a, b) => a - b);
    const count = mapped.length;
    const multi = count >= 2 ? MULTI_PREFIX[count] : '';
    const show = showLocant(n, count, mol.ring, false, isOnlyFeature, manyGroups);
    const text = (show ? mapped.join(',') + '-' : '') + multi + info.name;
    return { sortKey: info.name, text };
  });
  if (extraEntries) entries.push(...extraEntries);
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  // Locant-prefixed entries (e.g. "2-methyl") and N-prefixed ones (e.g. "N-methyl") are
  // both self-delimited; bare names (locant omitted) rely on the previous entry's hyphen.
  return entries.map((e, i) => (i > 0 && /^(\d|N[,-])/.test(e.text) ? '-' : '') + e.text).join('');
}

// 1 or 2 simple alkyl groups attached directly to an amine's nitrogen (secondary/tertiary
// amines), formatted the same way regular substituent prefixes are - just with "N" in
// place of a numeric locant, e.g. "N-methyl", "N,N-dimethyl", "N-ethyl-N-methyl".
function buildNSubEntries(nSubs) {
  if (!nSubs || !nSubs.length) return [];
  const byType = {};
  nSubs.forEach(t => { byType[t] = (byType[t] || 0) + 1; });
  return Object.keys(byType).map(type => {
    const count = byType[type];
    const info = PREFIX_SUB_TYPES[type];
    const multi = count >= 2 ? MULTI_PREFIX[count] : '';
    const locant = Array(count).fill('N').join(',');
    return { sortKey: info.name, text: `${locant}-${multi}${info.name}` };
  });
}

function buildSuffixPortion(mol, mapFn, n) {
  if (!mol.principalGroup) return null;
  const info = SUFFIX_INFO[mol.principalGroup.type];
  const count = mol.principalGroup.positions.length;
  const mapped = mol.principalGroup.positions.map(mapFn).sort((a, b) => a - b);
  const multi = count >= 2 ? MULTI_PREFIX[count] : '';
  const show = showLocant(n, count, mol.ring, info.terminalOnly, false);
  return { suffixWord: multi + info.suffix, locantStr: mapped.join(','), show };
}

function nameChainFamily(mol) {
  const n = mol.chainLength;
  const best = pickBestCandidate(mol, n);
  const map = best.map;
  const nSubEntries = mol.principalGroup && mol.principalGroup.type === 'amine'
    ? buildNSubEntries(mol.principalGroup.nSubs) : [];
  const prefix = buildSubstituentPrefix(mol, map, n, nSubEntries);
  const root = CHAIN_ROOTS[n];
  const ringTag = mol.ring ? 'cyclo' : '';
  const hasEne = !!mol.doubleBond;
  const hasYne = !!mol.tripleBond;
  const infixWord = hasYne ? 'yne' : 'ene';

  let eneLocantShow = false, eneLocantStr = '';
  if (hasEne || hasYne) {
    if (mol.ring) {
      eneLocantShow = false;
    } else {
      eneLocantShow = n >= 4 || !!mol.principalGroup || mol.substituents.length > 0;
      eneLocantStr = String(best.ene[0]);
    }
  }

  const suffixInfo = buildSuffixPortion(mol, map, n);
  let core;

  if (suffixInfo) {
    const dropE = /^[aeiou]/.test(suffixInfo.suffixWord);
    let stem = ringTag + root + ((hasEne || hasYne) ? (eneLocantShow ? `-${eneLocantStr}-${infixWord}` : infixWord) : 'ane');
    if (dropE) stem = stem.slice(0, -1);
    const suffixPart = suffixInfo.show ? `-${suffixInfo.locantStr}-${suffixInfo.suffixWord}` : suffixInfo.suffixWord;
    core = stem + suffixPart;
  } else {
    core = ringTag + root + ((hasEne || hasYne) ? (eneLocantShow ? `-${eneLocantStr}-${infixWord}` : infixWord) : 'ane');
  }

  let name = (prefix ? prefix + core : core);
  if (mol.geometry) {
    const ez = mol.geometry === 'cis' ? 'Z' : 'E';
    name = `${mol.geometry}-${name} (${ez})`;
  }
  return name;
}

function nameEster(mol) {
  const n = mol.chainLength;
  const map = p => p; // acyl chain numbering is fixed: carbonyl carbon is always C1
  const prefix = buildSubstituentPrefix(mol, map, n);
  const root = CHAIN_ROOTS[n];
  const acidPart = prefix + root + 'an' + 'oate';
  const alkylName = mol.ester.alkylType;
  return `${alkylName} ${acidPart}`;
}

function aromaticOffset(relative) {
  if (relative === 'ortho') return 1;
  if (relative === 'meta') return 2;
  return 3; // para
}

function compareLocantArraysExact(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Tries every rotation/reflection of the ring (or, if a hydroxy is present, only the two
// reflections that keep it at locant 1 - it's always the implied phenol parent) and picks
// the numbering with the lowest locant set, tying broken by giving the alphabetically-first
// substituent the lower locant - the same two IUPAC rules chain numbering already uses.
function numberAromaticSubs(subs, n) {
  const hydroxy = subs.find(s => s.type === 'hydroxy');
  const rotations = hydroxy ? [hydroxy.ringPos - 1] : Array.from({ length: n }, (_, i) => i);
  let best = null;
  rotations.forEach(rot => {
    [1, -1].forEach(dir => {
      const cand = subs.map(s => ({ type: s.type, loc: (((s.ringPos - 1 - rot) * dir) % n + n) % n + 1 }));
      const locants = cand.map(c => c.loc).sort((a, b) => a - b);
      // Tie-break key: each substituent's locant, but listed in ALPHABETICAL order of its
      // name (not locant order) - giving the alphabetically-first substituent's locant
      // priority in the comparison, per the real IUPAC tie-break rule.
      const alphaKey = cand.slice().sort((a, b) => a.type.localeCompare(b.type)).map(c => c.loc);
      if (!best) { best = { locants, alphaKey, cand }; return; }
      const cmp = compareLocantArraysExact(locants, best.locants);
      if (cmp < 0) { best = { locants, alphaKey, cand }; return; }
      if (cmp === 0 && compareLocantArraysExact(alphaKey, best.alphaKey) < 0) {
        best = { locants, alphaKey, cand };
      }
    });
  });
  return best.cand.slice().sort((a, b) => a.loc - b.loc); // [{type, loc}] sorted by loc ascending
}

function formatAromaticSubstituents(cand) {
  const byType = {};
  cand.forEach(c => { (byType[c.type] = byType[c.type] || []).push(c.loc); });
  const entries = Object.keys(byType).map(type => {
    const locs = byType[type].sort((a, b) => a - b);
    const info = PREFIX_SUB_TYPES[type];
    const multi = locs.length >= 2 ? MULTI_PREFIX[locs.length] : '';
    return { sortKey: info.name, text: locs.join(',') + '-' + multi + info.name };
  });
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return entries.map((e, i) => (i > 0 && /^\d/.test(e.text) ? '-' : '') + e.text).join('');
}

function nameAromatic(mol) {
  const subs = mol.aromaticSubs;
  if (subs.length === 1) {
    const s = subs[0];
    if (s.type === 'hydroxy') return 'phenol';
    return PREFIX_SUB_TYPES[s.type].name + 'benzene';
  }
  const cand = numberAromaticSubs(subs, 6);
  const hasHydroxy = subs.some(s => s.type === 'hydroxy');
  let descriptor = '';
  if (subs.length === 2) {
    const diff = Math.abs(cand[1].loc - cand[0].loc);
    descriptor = ` (${{ 1: 'ortho', 2: 'meta', 3: 'para' }[Math.min(diff, 6 - diff)]})`;
  }
  if (hasHydroxy) {
    const others = cand.filter(c => c.type !== 'hydroxy');
    if (!others.length) return 'phenol';
    return `${formatAromaticSubstituents(others)}phenol${descriptor}`;
  }
  return `${formatAromaticSubstituents(cand)}benzene${descriptor}`;
}

function nameMolecule(mol) {
  if (mol.family === 'ester') return nameEster(mol);
  if (mol.family === 'aromatic') return nameAromatic(mol);
  return nameChainFamily(mol);
}

if (typeof module !== 'undefined') {
  module.exports = { nameMolecule, applyNumbering, pickBestCandidate, getNumberingCandidates };
}
