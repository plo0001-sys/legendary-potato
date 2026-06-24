// Builds quiz question objects from customization settings, using the generator/naming/
// formula/svg modules. Each question already carries its own correct answer so the UI
// layer only has to render and self-check, never re-derive chemistry.

function defaultSettings() {
  const enabledClasses = {};
  ALL_CLASS_KEYS.forEach(k => enabledClasses[k] = !EXTENSION_CLASS_KEYS.includes(k));
  const questionTypes = {};
  Object.keys(QUESTION_TYPES).forEach(k => questionTypes[k] = true);
  const features = {};
  Object.keys(FEATURE_KEYS).forEach(k => features[k] = true);
  Object.keys(EXTENSION_FEATURE_KEYS).forEach(k => features[k] = false);
  return {
    enabledClasses,
    questionTypes,
    features,
    formulaFormats: { molecular: true, condensed: true },
    chainMin: 1,
    chainMax: 6,
    distractorDifficulty: 'tricky',
    quizLength: 10
  };
}

function pickEnabledKey(map, fallbackList) {
  const enabled = Object.keys(map).filter(k => map[k]);
  return choice(enabled.length ? enabled : fallbackList);
}

function pickFormulaFormat(settings) {
  const enabled = Object.keys(settings.formulaFormats).filter(k => settings.formulaFormats[k]);
  return choice(enabled.length ? enabled : ['molecular']);
}

function buildClassMcOptions(correctKey, settings) {
  let candidates;
  if (settings.distractorDifficulty === 'easy') {
    candidates = shuffle(ALL_CLASS_KEYS.filter(k => k !== correctKey));
  } else {
    candidates = shuffle((CONFUSION_MAP[correctKey] || []).filter(k => ALL_CLASS_KEYS.includes(k)));
  }
  const others = shuffle(ALL_CLASS_KEYS.filter(k => k !== correctKey && !candidates.includes(k)));
  while (candidates.length < 3 && others.length) candidates.push(others.shift());
  candidates = candidates.slice(0, 3);
  const keys = shuffle([correctKey, ...candidates]);
  return keys.map(k => ({ key: k, label: CLASS_LABELS[k] }));
}

function buildQuestion(settings) {
  const qType = pickEnabledKey(settings.questionTypes, Object.keys(QUESTION_TYPES));
  const classKey = pickEnabledKey(settings.enabledClasses, ALL_CLASS_KEYS);

  if (qType === 'classFromDiagram') {
    const mol = generateMolecule(classKey, settings, false);
    return {
      type: qType, classKey, mol,
      prompt: 'What class of compound is shown below?',
      diagramSvg: renderMolecule(mol),
      answerMode: 'mc',
      mcOptions: buildClassMcOptions(classKey, settings),
      mcCorrectKey: classKey,
      correctAnswerHtml: CLASS_LABELS[classKey],
      compoundName: nameMolecule(mol)
    };
  }

  if (qType === 'classFromName') {
    const mol = generateMolecule(classKey, settings, false);
    const name = nameMolecule(mol);
    return {
      type: qType, classKey, mol,
      prompt: 'What class of compound is this?',
      nameDisplay: name,
      answerMode: 'mc',
      mcOptions: buildClassMcOptions(classKey, settings),
      mcCorrectKey: classKey,
      correctAnswerHtml: CLASS_LABELS[classKey],
      compoundName: name
    };
  }

  if (qType === 'nameFromDiagram') {
    const mol = generateMolecule(classKey, settings, true);
    const name = nameMolecule(mol);
    return {
      type: qType, classKey, mol,
      prompt: 'Name this compound (IUPAC name).',
      diagramSvg: renderMolecule(mol),
      answerMode: 'text',
      correctAnswerHtml: name,
      compoundName: name
    };
  }

  // formulaFromDiagram
  let format = pickFormulaFormat(settings);
  const mol = generateMolecule(classKey, settings, true);
  if (format === 'condensed' && condensedStructuralFormulaHtml(mol) === null) format = 'molecular';
  const correctAnswerHtml = format === 'condensed' ? condensedStructuralFormulaHtml(mol) : molecularFormulaHtml(mol);
  return {
    type: qType, classKey, mol,
    prompt: `Write the ${FORMULA_FORMATS[format]} for this compound.`,
    diagramSvg: renderMolecule(mol),
    answerMode: 'text',
    formulaFormat: format,
    correctAnswerHtml,
    compoundName: nameMolecule(mol)
  };
}

function buildQuiz(settings) {
  const qs = [];
  for (let i = 0; i < settings.quizLength; i++) qs.push(buildQuestion(settings));
  return qs;
}

if (typeof module !== 'undefined') {
  module.exports = { defaultSettings, buildQuestion, buildQuiz, buildClassMcOptions };
}
