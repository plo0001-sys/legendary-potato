(function () {
  let settings = loadSettings();
  let stats = loadStats();
  let quiz = [];
  let qIndex = 0;
  let score = 0;
  let sessionByClass = {};
  let selectedMcKey = null;
  let revealed = false;

  const el = id => document.getElementById(id);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    el(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (id === 'screen-home') el('nav-home').classList.add('active');
    if (id === 'screen-customize') el('nav-customize').classList.add('active');
    if (id === 'screen-stats') el('nav-stats').classList.add('active');
  }

  function labelOf(v) { return typeof v === 'object' ? v.label : v; }

  function renderCheckboxGroup(container, items, currentMap) {
    container.innerHTML = '';
    Object.keys(items).forEach(key => {
      const label = document.createElement('label');
      label.className = 'option-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.key = key;
      input.checked = !!currentMap[key];
      label.appendChild(input);
      const span = document.createElement('span');
      span.textContent = labelOf(items[key]);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function renderRadioGroup(container, options, currentValue, name) {
    container.innerHTML = '';
    options.forEach(([value, label]) => {
      const lab = document.createElement('label');
      lab.className = 'option-checkbox';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === currentValue;
      lab.appendChild(input);
      const span = document.createElement('span');
      span.textContent = label;
      lab.appendChild(span);
      container.appendChild(lab);
    });
  }

  function readCheckboxGroup(container) {
    const out = {};
    container.querySelectorAll('input[type=checkbox]').forEach(input => { out[input.dataset.key] = input.checked; });
    return out;
  }

  function readRadioGroup(container, name) {
    const checked = container.querySelector(`input[name=${name}]:checked`);
    return checked ? checked.value : null;
  }

  function splitClassLabels() {
    const core = {}, ext = {};
    ALL_CLASS_KEYS.forEach(k => {
      if (EXTENSION_CLASS_KEYS.includes(k)) ext[k] = CLASS_LABELS[k];
      else core[k] = CLASS_LABELS[k];
    });
    return { core, ext };
  }

  function renderCustomizeForm() {
    renderCheckboxGroup(el('qtype-options'), QUESTION_TYPES, settings.questionTypes);
    const { core, ext } = splitClassLabels();
    renderCheckboxGroup(el('class-options'), core, settings.enabledClasses);
    renderCheckboxGroup(el('extension-class-options'), ext, settings.enabledClasses);
    renderCheckboxGroup(el('feature-options'), FEATURE_KEYS, settings.features);
    renderCheckboxGroup(el('extension-feature-options'), EXTENSION_FEATURE_KEYS, settings.features);
    renderCheckboxGroup(el('formula-options'), FORMULA_FORMATS, settings.formulaFormats);
    renderRadioGroup(el('distractor-options'), [
      ['tricky', 'Plausible near-misses (recommended)'],
      ['easy', 'Random / easy distractors']
    ], settings.distractorDifficulty, 'distractor');

    el('chain-min').value = settings.chainMin;
    el('chain-max').value = settings.chainMax;
    el('chain-min-val').textContent = settings.chainMin;
    el('chain-max-val').textContent = settings.chainMax;
    el('quiz-length').value = settings.quizLength;
    el('quiz-length-val').textContent = settings.quizLength;
  }

  function readCustomizeForm() {
    const next = {
      questionTypes: readCheckboxGroup(el('qtype-options')),
      enabledClasses: Object.assign({}, readCheckboxGroup(el('class-options')), readCheckboxGroup(el('extension-class-options'))),
      features: Object.assign({}, readCheckboxGroup(el('feature-options')), readCheckboxGroup(el('extension-feature-options'))),
      formulaFormats: readCheckboxGroup(el('formula-options')),
      distractorDifficulty: readRadioGroup(el('distractor-options'), 'distractor') || 'tricky',
      chainMin: parseInt(el('chain-min').value, 10),
      chainMax: parseInt(el('chain-max').value, 10),
      quizLength: parseInt(el('quiz-length').value, 10)
    };
    if (!Object.values(next.enabledClasses).some(Boolean)) next.enabledClasses = Object.assign({}, settings.enabledClasses);
    if (!Object.values(next.questionTypes).some(Boolean)) next.questionTypes = Object.assign({}, settings.questionTypes);
    if (!Object.values(next.formulaFormats).some(Boolean)) next.formulaFormats = { molecular: true, condensed: true };
    return next;
  }

  function summarizeSettings() {
    const classCount = Object.values(settings.enabledClasses).filter(Boolean).length;
    const typeCount = Object.values(settings.questionTypes).filter(Boolean).length;
    return `<b>${settings.quizLength}</b> questions &middot; <b>${classCount}</b>/${ALL_CLASS_KEYS.length} compound classes &middot; ` +
      `<b>${typeCount}</b>/${Object.keys(QUESTION_TYPES).length} question types &middot; chain length <b>${settings.chainMin}-${settings.chainMax}</b>`;
  }

  function refreshHomeSummary() {
    el('home-summary').innerHTML = summarizeSettings();
  }

  // --- customize screen wiring ---
  el('nav-home').addEventListener('click', () => showScreen('screen-home'));
  el('nav-customize').addEventListener('click', () => { renderCustomizeForm(); showScreen('screen-customize'); });
  el('nav-stats').addEventListener('click', () => { renderStats(); showScreen('screen-stats'); });
  el('open-customize-btn').addEventListener('click', () => { renderCustomizeForm(); showScreen('screen-customize'); });
  el('results-customize-btn').addEventListener('click', () => { renderCustomizeForm(); showScreen('screen-customize'); });

  // --- functional group reference modal (available from any screen) ---
  function openReferenceModal() { el('reference-modal').classList.remove('hidden'); }
  function closeReferenceModal() { el('reference-modal').classList.add('hidden'); }
  el('open-reference-btn').addEventListener('click', openReferenceModal);
  el('close-reference-btn').addEventListener('click', closeReferenceModal);
  el('reference-modal').addEventListener('click', (e) => { if (e.target.id === 'reference-modal') closeReferenceModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el('reference-modal').classList.contains('hidden')) closeReferenceModal();
  });

  el('chain-min').addEventListener('input', () => {
    el('chain-min-val').textContent = el('chain-min').value;
    if (parseInt(el('chain-min').value, 10) > parseInt(el('chain-max').value, 10)) {
      el('chain-max').value = el('chain-min').value;
      el('chain-max-val').textContent = el('chain-max').value;
    }
  });
  el('chain-max').addEventListener('input', () => {
    el('chain-max-val').textContent = el('chain-max').value;
    if (parseInt(el('chain-max').value, 10) < parseInt(el('chain-min').value, 10)) {
      el('chain-min').value = el('chain-max').value;
      el('chain-min-val').textContent = el('chain-min').value;
    }
  });
  el('quiz-length').addEventListener('input', () => { el('quiz-length-val').textContent = el('quiz-length').value; });

  el('classes-all-btn').addEventListener('click', () => {
    el('class-options').querySelectorAll('input[type=checkbox]').forEach(i => i.checked = true);
  });
  el('classes-none-btn').addEventListener('click', () => {
    el('class-options').querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
  });
  el('extension-all-btn').addEventListener('click', () => {
    ['extension-class-options', 'extension-feature-options'].forEach(id =>
      el(id).querySelectorAll('input[type=checkbox]').forEach(i => i.checked = true));
  });
  el('extension-none-btn').addEventListener('click', () => {
    ['extension-class-options', 'extension-feature-options'].forEach(id =>
      el(id).querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false));
  });

  el('reset-customize-btn').addEventListener('click', () => {
    settings = defaultSettings();
    saveSettings(settings);
    renderCustomizeForm();
    refreshHomeSummary();
  });

  el('save-customize-btn').addEventListener('click', (e) => {
    e.preventDefault();
    settings = readCustomizeForm();
    saveSettings(settings);
    refreshHomeSummary();
    startQuiz();
  });

  // --- quiz flow ---
  el('start-quiz-btn').addEventListener('click', startQuiz);
  el('restart-quiz-btn').addEventListener('click', startQuiz);

  function startQuiz() {
    quiz = buildQuiz(settings);
    qIndex = 0;
    score = 0;
    sessionByClass = {};
    showScreen('screen-quiz');
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz[qIndex];
    selectedMcKey = null;
    revealed = false;

    el('quiz-progress-text').textContent = `Question ${qIndex + 1} of ${quiz.length}`;
    el('quiz-score-text').textContent = `Score: ${score}/${qIndex}`;
    el('question-type-tag').textContent = QUESTION_TYPES[q.type].label;
    el('question-prompt').textContent = q.prompt;
    el('question-diagram').innerHTML = q.diagramSvg || '';
    el('question-diagram').classList.toggle('hidden', !q.diagramSvg);
    el('question-name-display').innerHTML = q.nameDisplay || '';

    const answerArea = el('answer-area');
    answerArea.innerHTML = '';
    if (q.answerMode === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'text-answer-input';
      input.placeholder = 'Type your answer here...';
      input.autocomplete = 'off';
      answerArea.appendChild(input);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'mc-options';
      q.mcOptions.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'mc-option';
        div.dataset.key = opt.key;
        div.textContent = opt.label;
        div.addEventListener('click', () => {
          if (revealed) return;
          wrap.querySelectorAll('.mc-option').forEach(o => o.classList.remove('selected'));
          div.classList.add('selected');
          selectedMcKey = opt.key;
        });
        wrap.appendChild(div);
      });
      answerArea.appendChild(wrap);
    }

    el('reveal-area').classList.add('hidden');
    el('reveal-area').innerHTML = '';
    el('reveal-btn').classList.remove('hidden');
    el('mark-correct-btn').classList.add('hidden');
    el('mark-incorrect-btn').classList.add('hidden');
    el('next-question-btn').classList.add('hidden');
  }

  function compoundNameLine(q) {
    // Skip when the name is already shown elsewhere on screen (it IS the prompt or the answer).
    if (q.type === 'classFromName' || q.type === 'nameFromDiagram') return '';
    return `<div class="compound-name-line"><span class="answer-label">Compound:</span> ${q.compoundName}</div>`;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (el('screen-home').classList.contains('active')) {
      e.preventDefault();
      el('start-quiz-btn').click();
      return;
    }
    if (el('screen-results').classList.contains('active')) {
      e.preventDefault();
      el('restart-quiz-btn').click();
      return;
    }
    if (!el('screen-quiz').classList.contains('active')) return;
    if (!el('reveal-btn').classList.contains('hidden')) {
      e.preventDefault();
      el('reveal-btn').click();
    } else if (!el('mark-correct-btn').classList.contains('hidden')) {
      e.preventDefault();
      el('mark-correct-btn').click();
    } else if (!el('next-question-btn').classList.contains('hidden')) {
      e.preventDefault();
      el('next-question-btn').click();
    }
  });

  el('reveal-btn').addEventListener('click', () => {
    const q = quiz[qIndex];
    revealed = true;
    el('reveal-area').classList.remove('hidden');

    if (q.answerMode === 'mc') {
      document.querySelectorAll('#answer-area .mc-option').forEach(div => {
        if (div.dataset.key === q.mcCorrectKey) div.classList.add('correct');
        else if (div.dataset.key === selectedMcKey) div.classList.add('incorrect');
      });
      const correct = selectedMcKey === q.mcCorrectKey;
      el('reveal-area').innerHTML = (correct
        ? '<span class="answer-label">Correct!</span>'
        : `<span class="answer-label">Correct answer:</span> ${q.correctAnswerHtml}`) + compoundNameLine(q);
      finishGrading(q, correct);
    } else {
      el('reveal-area').innerHTML = `<span class="answer-label">Correct answer:</span> ${q.correctAnswerHtml}` + compoundNameLine(q);
      el('reveal-btn').classList.add('hidden');
      el('mark-correct-btn').classList.remove('hidden');
      el('mark-incorrect-btn').classList.remove('hidden');
    }
  });

  function advanceQuestion() {
    qIndex++;
    if (qIndex < quiz.length) renderQuestion();
    else showResults();
  }

  el('mark-correct-btn').addEventListener('click', () => { finishGrading(quiz[qIndex], true); advanceQuestion(); });
  el('mark-incorrect-btn').addEventListener('click', () => { finishGrading(quiz[qIndex], false); advanceQuestion(); });

  function finishGrading(q, correct) {
    if (correct) score++;
    if (!sessionByClass[q.classKey]) sessionByClass[q.classKey] = { attempted: 0, correct: 0 };
    sessionByClass[q.classKey].attempted++;
    if (correct) sessionByClass[q.classKey].correct++;
    recordAnswer(stats, q.classKey, q.type, correct);
    el('quiz-score-text').textContent = `Score: ${score}/${qIndex + 1}`;
    el('reveal-btn').classList.add('hidden');
    el('mark-correct-btn').classList.add('hidden');
    el('mark-incorrect-btn').classList.add('hidden');
    el('next-question-btn').classList.remove('hidden');
  }

  el('next-question-btn').addEventListener('click', advanceQuestion);

  function showResults() {
    el('results-summary').textContent = `You scored ${score} / ${quiz.length}`;
    const rows = Object.keys(sessionByClass).map(k => {
      const r = sessionByClass[k];
      const pct = Math.round((r.correct / r.attempted) * 100);
      return `<tr><td>${CLASS_LABELS[k]}</td><td>${r.correct}/${r.attempted}</td><td>${pct}%</td></tr>`;
    }).join('');
    el('results-breakdown').innerHTML = `<table><thead><tr><th>Compound class</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>${rows}</tbody></table>`;
    showScreen('screen-results');
  }

  // --- stats screen ---
  function accTag(pct) {
    if (pct >= 80) return `<span class="strong-tag">${pct}%</span>`;
    if (pct < 50) return `<span class="weak-tag">${pct}%</span>`;
    return `${pct}%`;
  }

  function renderBreakdownTable(map, labelFor) {
    const keys = Object.keys(map);
    if (!keys.length) return '<p>No attempts recorded yet.</p>';
    const rows = keys.map(k => {
      const r = map[k];
      const pct = r.attempted ? Math.round((r.correct / r.attempted) * 100) : 0;
      return `<tr><td>${labelFor(k)}</td><td>${r.correct}/${r.attempted}</td><td>${accTag(pct)}</td>
        <td><div class="acc-bar-bg"><div class="acc-bar-fill" style="width:${pct}%"></div></div></td></tr>`;
    }).join('');
    return `<table><thead><tr><th>Category</th><th>Correct</th><th>Accuracy</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderStats() {
    const overallPct = stats.totalAttempted ? Math.round((stats.totalCorrect / stats.totalAttempted) * 100) : 0;
    let html = `<p><b>${stats.totalCorrect}/${stats.totalAttempted}</b> correct overall (${accTag(overallPct)})</p>`;
    html += '<h3>By compound class</h3>' + renderBreakdownTable(stats.byClass, k => CLASS_LABELS[k]);
    html += '<h3>By question type</h3>' + renderBreakdownTable(stats.byType, k => QUESTION_TYPES[k].label);
    el('stats-content').innerHTML = html;
  }

  el('clear-stats-btn').addEventListener('click', () => {
    clearStats();
    stats = loadStats();
    renderStats();
  });

  // --- init ---
  refreshHomeSummary();
  showScreen('screen-home');
})();
