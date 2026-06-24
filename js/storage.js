// localStorage persistence for customization settings and accuracy stats.

const STORAGE_KEYS = { settings: 'chemquiz_settings_v1', stats: 'chemquiz_stats_v1' };

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return defaultSettings();
    return Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function defaultStats() {
  return { byClass: {}, byType: {}, totalCorrect: 0, totalAttempted: 0 };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.stats);
    return raw ? JSON.parse(raw) : defaultStats();
  } catch (e) {
    return defaultStats();
  }
}

function saveStats(stats) {
  localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
}

function recordAnswer(stats, classKey, qType, correct) {
  stats.totalAttempted++;
  if (correct) stats.totalCorrect++;
  if (!stats.byClass[classKey]) stats.byClass[classKey] = { attempted: 0, correct: 0 };
  stats.byClass[classKey].attempted++;
  if (correct) stats.byClass[classKey].correct++;
  if (!stats.byType[qType]) stats.byType[qType] = { attempted: 0, correct: 0 };
  stats.byType[qType].attempted++;
  if (correct) stats.byType[qType].correct++;
  saveStats(stats);
  return stats;
}

function clearStats() {
  localStorage.removeItem(STORAGE_KEYS.stats);
}

if (typeof module !== 'undefined') {
  module.exports = { loadSettings, saveSettings, loadStats, saveStats, recordAnswer, clearStats, defaultStats };
}
