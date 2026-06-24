// Chemistry vocabulary tables shared by the generator, naming, formula and SVG modules.

const CHAIN_ROOTS = [null, 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct'];

const MULTI_PREFIX = [null, null, 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa'];

const ALKYL_SUBS = {
  methyl: { carbons: 1, name: 'methyl' },
  ethyl:  { carbons: 2, name: 'ethyl' },
  propyl: { carbons: 3, name: 'propyl' },
  butyl:  { carbons: 4, name: 'butyl' }
};

const HALOGENS = {
  fluoro: { symbol: 'F', name: 'fluoro' },
  chloro: { symbol: 'Cl', name: 'chloro' },
  bromo:  { symbol: 'Br', name: 'bromo' },
  iodo:   { symbol: 'I', name: 'iodo' }
};

const ALKOXY_SUBS = {
  methoxy: { carbons: 1, name: 'methoxy' },
  ethoxy:  { carbons: 2, name: 'ethoxy' },
  propoxy: { carbons: 3, name: 'propoxy' }
};

// All prefix-only substituent types (never the principal characteristic group)
const PREFIX_SUB_TYPES = Object.assign({}, ALKYL_SUBS, HALOGENS, ALKOXY_SUBS);

// Principal characteristic groups usable on a plain chain/ring, highest priority first.
const SUFFIX_INFO = {
  carboxylicAcid: { suffix: 'oic acid', prefix: 'carboxy', terminalOnly: true },
  nitrile:        { suffix: 'nitrile',  prefix: 'cyano',   terminalOnly: true },
  amide:          { suffix: 'amide',    prefix: 'carbamoyl', terminalOnly: true },
  aldehyde:       { suffix: 'al',       prefix: 'oxo',     terminalOnly: true },
  ketone:         { suffix: 'one',      prefix: 'oxo',     terminalOnly: false },
  alcohol:        { suffix: 'ol',       prefix: 'hydroxy', terminalOnly: false },
  thiol:          { suffix: 'thiol',    prefix: 'sulfanyl', terminalOnly: false },
  amine:          { suffix: 'amine',    prefix: 'amino',   terminalOnly: false }
};

const CLASS_LABELS = {
  alkane: 'Alkane',
  alkene: 'Alkene',
  haloalkane: 'Haloalkane',
  alcohol: 'Alcohol',
  aldehyde: 'Aldehyde',
  ketone: 'Ketone',
  carboxylicAcid: 'Carboxylic acid',
  ester: 'Ester',
  amine: 'Amine',
  amide: 'Amide',
  ether: 'Ether',
  aromatic: 'Aromatic (benzene-based)',
  alkyne: 'Alkyne',
  nitrile: 'Nitrile',
  thiol: 'Thiol'
};

const ALL_CLASS_KEYS = Object.keys(CLASS_LABELS);

// Compound classes (and, in future, other content) that go beyond the core VCE Chemistry
// Units 3&4 syllabus. Shown in their own "Extension" customization section and off by
// default, so a stock VCE-aligned quiz never surprises the user with non-syllabus content.
const EXTENSION_CLASS_KEYS = ['alkyne', 'nitrile', 'thiol'];

// Complexity features that go beyond VCE scope (e.g. amine/aromatic substitution patterns
// not required by the syllabus). Shown alongside EXTENSION_CLASS_KEYS, off by default, but
// stored in settings.features just like the core FEATURE_KEYS.
const EXTENSION_FEATURE_KEYS = {
  secondaryTertiaryAmines: 'Secondary & tertiary amines (R₂NH / R₃N)',
  triSubstitutedAromatics: 'Tri-substituted aromatics (1,2,3- / 1,2,4- / 1,3,5-)'
};

// Plausible "near miss" wrong-answer pools for multiple-choice class questions.
const CONFUSION_MAP = {
  alkane: ['alkene', 'haloalkane', 'cycloalkaneNote'],
  alkene: ['alkane', 'haloalkane', 'aromatic', 'alkyne'],
  haloalkane: ['alkane', 'alkene', 'alcohol'],
  alcohol: ['carboxylicAcid', 'ether', 'aromatic', 'thiol'],
  aldehyde: ['ketone', 'carboxylicAcid', 'ester', 'nitrile'],
  ketone: ['aldehyde', 'ester', 'carboxylicAcid'],
  carboxylicAcid: ['ester', 'aldehyde', 'alcohol', 'nitrile'],
  ester: ['carboxylicAcid', 'ketone', 'ether'],
  amine: ['amide', 'alcohol', 'nitrile'],
  amide: ['amine', 'ester', 'carboxylicAcid', 'nitrile'],
  ether: ['alcohol', 'ester', 'thiol'],
  aromatic: ['alkene', 'alkane'],
  alkyne: ['alkene', 'alkane'],
  nitrile: ['carboxylicAcid', 'amide', 'alkyne'],
  thiol: ['alcohol', 'amine']
};

const QUESTION_TYPES = {
  nameFromDiagram:   { label: 'Name compound from diagram' },
  classFromDiagram:  { label: 'Identify compound class from diagram' },
  classFromName:     { label: 'Identify compound class from name' },
  formulaFromDiagram:{ label: 'Write chemical formula from diagram' }
};

const FEATURE_KEYS = {
  branching: 'Branched alkyl substituents',
  combinedGroups: 'Combined functional groups',
  rings: 'Cycloalkanes / cycloalkenes',
  positionIsomerism: 'Position isomerism',
  multiGroups: 'Multiple identical functional groups (di-, tri-)',
  geometricIsomerism: 'Geometric (cis-trans / E-Z) isomerism'
};

const FORMULA_FORMATS = {
  molecular: 'Molecular formula',
  condensed: 'Condensed structural formula'
};

if (typeof module !== 'undefined') {
  module.exports = {
    CHAIN_ROOTS, MULTI_PREFIX, ALKYL_SUBS, HALOGENS, ALKOXY_SUBS, PREFIX_SUB_TYPES,
    SUFFIX_INFO, CLASS_LABELS, ALL_CLASS_KEYS, EXTENSION_CLASS_KEYS, EXTENSION_FEATURE_KEYS, CONFUSION_MAP, QUESTION_TYPES,
    FEATURE_KEYS, FORMULA_FORMATS
  };
}
