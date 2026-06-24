// Derives molecular formula and condensed structural formula strings from a Molecule object.
// Both representations are built from one shared per-carbon bond/branch model so the
// chemistry (valence, implicit H counts) is only worked out once.

function simpleAlkylToken(carbons) {
  if (carbons === 1) return 'CH3';
  return 'CH2'.repeat(carbons - 1) + 'CH3';
}

function alkylComposition(carbons, counts) {
  for (let i = 0; i < carbons; i++) {
    let used = (i === 0 ? 1 : 0) + (i > 0 ? 1 : 0) + (i < carbons - 1 ? 1 : 0);
    counts.C++; counts.H += 4 - used;
  }
}

function branchToken(type) {
  if (HALOGENS[type]) return HALOGENS[type].symbol;
  if (ALKYL_SUBS[type]) return simpleAlkylToken(ALKYL_SUBS[type].carbons);
  if (ALKOXY_SUBS[type]) return 'O' + simpleAlkylToken(ALKOXY_SUBS[type].carbons);
  return type;
}

// An amine's nitrogen with 0/1/2 extra simple alkyl groups attached directly to it
// (secondary/tertiary amines) - the rest of the molecule still sees a single "NH2"-style
// tag on its carbon; this is the actual N-H count and N-substituent text for that tag.
function amineExtra(nSubs) {
  if (!nSubs || !nSubs.length) return 'NH2';
  const h = 2 - nSubs.length;
  const hStr = 'H'.repeat(Math.max(0, h));
  if (nSubs.length === 1) return 'N' + hStr + simpleAlkylToken(ALKYL_SUBS[nSubs[0]].carbons);
  const [a, b] = nSubs;
  if (a === b) return `N(${simpleAlkylToken(ALKYL_SUBS[a].carbons)})2`;
  return `N(${simpleAlkylToken(ALKYL_SUBS[a].carbons)})(${simpleAlkylToken(ALKYL_SUBS[b].carbons)})`;
}

function buildChainStructure(mol) {
  const n = mol.chainLength;
  const ring = mol.ring;
  const used = new Array(n + 1).fill(0);
  const branches = new Array(n + 1).fill(null).map(() => []);
  const principalTag = new Array(n + 1).fill(null);
  const counts = { C: 0, H: 0, O: 0, N: 0, S: 0, F: 0, Cl: 0, Br: 0, I: 0 };
  const amineNSubs = mol.principalGroup && mol.principalGroup.type === 'amine' ? mol.principalGroup.nSubs : null;

  for (let p = 1; p <= n; p++) {
    used[p] += ring ? 2 : (p > 1 ? 1 : 0) + (p < n ? 1 : 0);
  }

  if (mol.doubleBond) {
    const a = mol.doubleBond.at;
    const b = ring ? (a % n) + 1 : a + 1;
    used[a] += 1; used[b] += 1;
  }

  if (mol.tripleBond) {
    const a = mol.tripleBond.at;
    const b = a + 1;
    used[a] += 2; used[b] += 2;
  }

  if (mol.principalGroup) {
    const type = mol.principalGroup.type;
    mol.principalGroup.positions.forEach(p => {
      if (type === 'alcohol') { used[p] += 1; counts.O++; counts.H++; principalTag[p] = 'OH'; }
      else if (type === 'ketone') { used[p] += 2; counts.O++; principalTag[p] = '=O'; }
      else if (type === 'aldehyde') { used[p] += 2; counts.O++; principalTag[p] = 'CHO'; }
      else if (type === 'carboxylicAcid') { used[p] += 3; counts.O += 2; counts.H += 1; principalTag[p] = 'COOH'; }
      else if (type === 'amine') {
        used[p] += 1; counts.N++; counts.H += 2 - (amineNSubs ? amineNSubs.length : 0); principalTag[p] = 'NH2';
        (amineNSubs || []).forEach(t => alkylComposition(ALKYL_SUBS[t].carbons, counts));
      }
      else if (type === 'amide') { used[p] += 3; counts.O++; counts.N++; counts.H += 2; principalTag[p] = 'CONH2'; }
      else if (type === 'nitrile') { used[p] += 3; counts.N++; principalTag[p] = 'CN'; }
      else if (type === 'thiol') { used[p] += 1; counts.S++; counts.H++; principalTag[p] = 'SH'; }
    });
  }

  mol.substituents.forEach(s => {
    s.positions.forEach(p => {
      used[p] += 1;
      branches[p].push(s.type);
      if (HALOGENS[s.type]) counts[HALOGENS[s.type].symbol]++;
      else if (ALKYL_SUBS[s.type]) alkylComposition(ALKYL_SUBS[s.type].carbons, counts);
      else if (ALKOXY_SUBS[s.type]) { counts.O++; alkylComposition(ALKOXY_SUBS[s.type].carbons, counts); }
    });
  });

  const hCount = new Array(n + 1).fill(0);
  for (let p = 1; p <= n; p++) {
    counts.C++;
    hCount[p] = 4 - used[p];
    counts.H += hCount[p];
  }

  return { n, ring, hCount, branches, principalTag, counts, amineNSubs };
}

function esterComposition(mol) {
  const n = mol.chainLength;
  const counts = { C: 0, H: 0, O: 2, N: 0, F: 0, Cl: 0, Br: 0, I: 0 }; // carbonyl O + ester-link O
  const used = new Array(n + 1).fill(0);
  for (let p = 1; p <= n; p++) used[p] += (p > 1 ? 1 : 0) + (p < n ? 1 : 0);
  used[1] += 3; // C=O (2) + C-O-alkyl (1)
  mol.substituents.forEach(s => {
    s.positions.forEach(p => {
      used[p] += 1;
      if (HALOGENS[s.type]) counts[HALOGENS[s.type].symbol]++;
      else if (ALKYL_SUBS[s.type]) alkylComposition(ALKYL_SUBS[s.type].carbons, counts);
    });
  });
  for (let p = 1; p <= n; p++) { counts.C++; counts.H += 4 - used[p]; }
  alkylComposition(mol.ester.alkylCarbons, counts);
  return counts;
}

function moleculeComposition(mol) {
  if (mol.family === 'ester') return esterComposition(mol);
  if (mol.family === 'aromatic') {
    const counts = { C: 6, H: 0, O: 0, N: 0, F: 0, Cl: 0, Br: 0, I: 0 };
    let hOnRing = 6;
    mol.aromaticSubs.forEach(s => {
      hOnRing -= 1;
      if (s.type === 'hydroxy') { counts.O++; counts.H++; }
      else if (HALOGENS[s.type]) counts[HALOGENS[s.type].symbol]++;
      else if (ALKYL_SUBS[s.type]) alkylComposition(ALKYL_SUBS[s.type].carbons, counts);
    });
    counts.H += hOnRing;
    return counts;
  }
  return buildChainStructure(mol).counts;
}

const ELEMENT_ORDER = ['C', 'H', 'Br', 'Cl', 'F', 'I', 'N', 'O', 'S'];

function molecularFormulaHtml(mol) {
  const counts = moleculeComposition(mol);
  return ELEMENT_ORDER.filter(e => counts[e] > 0).map(e => {
    const c = counts[e];
    return c > 1 ? `${e}<sub>${c}</sub>` : e;
  }).join('');
}

function molecularFormulaText(mol) {
  const counts = moleculeComposition(mol);
  return ELEMENT_ORDER.filter(e => counts[e] > 0).map(e => {
    const c = counts[e];
    return c > 1 ? `${e}${c}` : e;
  }).join('');
}

function carbonToken(p, struct) {
  const h = struct.hCount[p];
  const isTerminal = !struct.ring && (p === 1 || p === struct.n);
  const tag = struct.principalTag[p];
  const extras = struct.branches[p].map(branchToken);
  let base;

  if (tag === '=O') base = 'H'.repeat(h) + 'CO';
  else if (tag === 'CHO') base = 'H'.repeat(Math.max(0, h - 1)) + 'CHO';
  else if (tag === 'COOH') base = 'H'.repeat(h) + 'COOH';
  else if (tag === 'CONH2') base = 'H'.repeat(h) + 'CONH2';
  else if (tag === 'CN') base = 'H'.repeat(h) + 'CN';
  else {
    base = h > 0 ? `CH${h > 1 ? h : ''}` : 'C';
    if (tag === 'OH') extras.push('OH');
    else if (tag === 'NH2') extras.push(amineExtra(struct.amineNSubs));
    else if (tag === 'SH') extras.push('SH');
  }

  if (!extras.length) return base;
  if (isTerminal && extras.length === 1) return base + extras[0];
  return base + extras.map(e => `(${e})`).join('');
}

function condensedStructuralFormula(mol) {
  if (mol.ring) return null; // condensed linear notation doesn't apply well to ring structures
  if (mol.family === 'ester') {
    const acyl = buildChainStructure({ ...mol, principalGroup: null, doubleBond: null });
    const tokens = [];
    for (let p = 1; p <= acyl.n; p++) {
      if (p === 1) {
        const h1 = 4 - (3 + (acyl.n > 1 ? 1 : 0));
        const extras = acyl.branches[1].map(branchToken);
        tokens.push('H'.repeat(Math.max(0, h1)) + 'CO' + extras.map(e => `(${e})`).join(''));
      } else {
        tokens.push(carbonToken(p, acyl));
      }
    }
    return tokens.join('') + 'O' + simpleAlkylToken(mol.ester.alkylCarbons);
  }
  const struct = buildChainStructure(mol);
  const tokens = [];
  for (let p = 1; p <= struct.n; p++) tokens.push(carbonToken(p, struct));
  let out = '';
  for (let p = 1; p <= struct.n; p++) {
    if (p > 1) {
      if (mol.doubleBond && mol.doubleBond.at === p - 1) out += '=';
      else if (mol.tripleBond && mol.tripleBond.at === p - 1) out += '≡';
    }
    out += tokens[p - 1];
  }
  return out;
}

function condensedStructuralFormulaHtml(mol) {
  const text = condensedStructuralFormula(mol);
  if (text === null) return null;
  return text.replace(/\d+/g, n => `<sub>${n}</sub>`);
}

if (typeof module !== 'undefined') {
  module.exports = { molecularFormulaHtml, molecularFormulaText, condensedStructuralFormula, condensedStructuralFormulaHtml, moleculeComposition };
}
