import { LEVELS, makePhrase as defaultMakePhrase } from './phrase.js';
import {
  TOL,
  createHolder as defaultCreateHolder,
  createMic as defaultCreateMic,
  detect as defaultDetect,
  judgeNote as defaultJudgeNote,
} from './pitch.js';
import {
  KEYS,
  STRINGS,
  fingering,
  midiToStaff,
  mtof,
  noteNameJa,
  positionsForMidi,
} from './theory.js';
import { renderStaff as defaultRenderStaff } from './staff.js';

export function createFuyomiApp(dependencies = {}) {
const window = dependencies.window ?? globalThis.window;
const document = dependencies.document ?? globalThis.document;
if (!window || !document) throw new TypeError('app の起動には window と document が必要です');

const clock = dependencies.clock ?? {
  now: () => window.performance.now(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timer) => window.clearTimeout(timer),
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (frame) => window.cancelAnimationFrame(frame),
};
const microphone = dependencies.microphone ?? {};
const createMic = microphone.create ?? defaultCreateMic;
const detect = microphone.detect ?? defaultDetect;
const createHolder = dependencies.createHolder ?? defaultCreateHolder;
const judgeNote = dependencies.judgeNote ?? defaultJudgeNote;
const makePhrase = dependencies.makePhrase ?? defaultMakePhrase;
const renderStaff = dependencies.renderStaff ?? defaultRenderStaff;
const localStorage = dependencies.storage ?? window.localStorage;
const navigator = dependencies.navigator ?? window.navigator ?? globalThis.navigator;
const ResizeObserver = dependencies.ResizeObserver ?? window.ResizeObserver ?? globalThis.ResizeObserver;
const performance = {now: () => clock.now()};
const requestAnimationFrame = (callback) => clock.requestAnimationFrame(callback);
const cancelAnimationFrame = (frame) => clock.cancelAnimationFrame(frame);
const microphoneAvailable = () => {
  if (typeof microphone.available === 'function') return Boolean(microphone.available());
  if (Object.hasOwn(microphone, 'available')) return Boolean(microphone.available);
  // create を注入した検証環境は、ブラウザの navigator とは独立してマイクを提供できる。
  if (typeof microphone.create === 'function') return true;
  return Boolean(navigator?.mediaDevices?.getUserMedia);
};

const STORAGE_KEY = 'fuyomi';
const DEFAULTS = Object.freeze({
  level: 1,
  key: 'A',
  count: 5,
  hint: 'off',
  sound: 'on',
  tolerance: 'loose',
  a4: 442,
});
const VALID_COUNTS = new Set([3, 5, 10]);
const VALID_A4 = new Set([440, 442, 443]);
const STRING_BY_ID = new Map(STRINGS.map((string) => [string.id, string]));
const TONIC_MIDI = { C: 60, G: 67, D: 62, A: 69 };

const byId = (id) => document.getElementById(id);
const elements = {
  setupScreen: byId('setup-screen'),
  checkScreen: byId('check-screen'),
  practiceScreen: byId('practice-screen'),
  resultScreen: byId('result-screen'),
  settingsForm: byId('settings-form'),
  levelSelect: byId('level-select'),
  keySelect: byId('key-select'),
  countSelect: byId('count-select'),
  hintSelect: byId('hint-select'),
  soundSelect: byId('sound-select'),
  toleranceSelect: byId('tolerance-select'),
  a4Select: byId('a4-select'),
  levelDescription: byId('level-description'),
  teacherNotice: byId('teacher-notice'),
  checkStatus: byId('check-status'),
  checkGuidance: byId('check-guidance'),
  listeningMark: document.querySelector('.listening-mark'),
  withoutMicButton: byId('without-mic-button'),
  checkCancelButton: byId('check-cancel-button'),
  practiceCount: byId('practice-count'),
  practiceKey: byId('practice-key'),
  manualNotice: byId('manual-notice'),
  staffWrap: byId('staff-wrap'),
  noteCount: byId('note-count'),
  holdTrack: byId('hold-track'),
  holdFill: byId('hold-fill'),
  practiceStatus: byId('practice-status'),
  hintPanel: byId('hint-panel'),
  hintName: byId('hint-name'),
  hintFingering: byId('hint-fingering'),
  samePitchNote: byId('same-pitch-note'),
  fourthFingerNote: byId('fourth-finger-note'),
  hintButton: byId('hint-button'),
  exampleButton: byId('example-button'),
  manualNextButton: byId('manual-next-button'),
  skipButton: byId('skip-button'),
  quitButton: byId('quit-button'),
  resultSummary: byId('result-summary'),
  resultModeNote: byId('result-mode-note'),
  troubleList: byId('trouble-list'),
  nextSuggestion: byId('next-suggestion'),
  recordList: byId('record-list'),
  retryButton: byId('retry-button'),
  backButton: byId('back-button'),
  introDialog: byId('intro-dialog'),
  introStaff: byId('intro-staff'),
  introCloseButton: byId('intro-close-button'),
};

const screens = {
  setup: elements.setupScreen,
  check: elements.checkScreen,
  practice: elements.practiceScreen,
  result: elements.resultScreen,
};

const state = {
  screen: 'setup',
  sessionId: 0,
  config: null,
  mic: null,
  toneContext: null,
  holder: null,
  animationFrame: 0,
  timers: new Set(),
  oscillators: new Set(),
  checkFrames: 0,
  checkConfirmed: false,
  manualTransitionQueued: false,
  listenMode: true,
  phraseIndex: 0,
  phrase: null,
  previousPhrase: null,
  noteIndex: 0,
  outcomes: [],
  hintStage: 0,
  missFlash: false,
  processing: false,
  voiceMuteUntil: 0,
  records: [],
};

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

function currentTheme() {
  return colorScheme.matches ? 'dark' : 'light';
}

function readStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizedSettings(raw = {}) {
  const level = Number(raw.level);
  const count = Number(raw.count);
  const a4 = Number(raw.a4);
  return {
    level: LEVELS[level] ? level : DEFAULTS.level,
    key: KEYS[raw.key] ? raw.key : DEFAULTS.key,
    count: VALID_COUNTS.has(count) ? count : DEFAULTS.count,
    hint: raw.hint === 'on' ? 'on' : DEFAULTS.hint,
    sound: raw.sound === 'off' ? 'off' : DEFAULTS.sound,
    tolerance: TOL[raw.tolerance] ? raw.tolerance : DEFAULTS.tolerance,
    a4: VALID_A4.has(a4) ? a4 : DEFAULTS.a4,
  };
}

function queryOverrides() {
  const params = new URLSearchParams(window.location.search);
  const overrides = {};
  const locked = new Set();

  const level = Number(params.get('level'));
  if (params.has('level') && LEVELS[level]) {
    overrides.level = level;
    locked.add('level');
  }

  const key = (params.get('key') || '').toUpperCase();
  if (params.has('key') && KEYS[key]) {
    overrides.key = key;
    locked.add('key');
  }

  const count = Number(params.get('n'));
  if (params.has('n') && VALID_COUNTS.has(count)) {
    overrides.count = count;
    locked.add('count');
  }

  const hint = params.get('hint');
  if (params.has('hint') && (hint === 'on' || hint === 'off')) {
    overrides.hint = hint;
    locked.add('hint');
  }

  return { overrides, locked, hasQuery: window.location.search.length > 1 };
}

const stored = readStorage();
const query = queryOverrides();
const initialSettings = normalizedSettings({
  ...DEFAULTS,
  ...(stored.settings || {}),
  ...query.overrides,
});

function settingsFromForm() {
  return normalizedSettings({
    level: elements.levelSelect.value,
    key: elements.keySelect.value,
    count: elements.countSelect.value,
    hint: elements.hintSelect.value,
    sound: elements.soundSelect.value,
    tolerance: elements.toleranceSelect.value,
    a4: elements.a4Select.value,
  });
}

function saveSettings(settings) {
  try {
    const current = readStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      settings,
    }));
  } catch {
    // 保存できない環境でも、現在のセッションはそのまま続けられる。
  }
}

function markIntroSeen() {
  try {
    const current = readStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      introSeen: true,
    }));
  } catch {
    // 保存できなければ、説明が次回も出るだけで練習自体は壊れない。
  }
}

function populateSettings(settings) {
  elements.levelSelect.replaceChildren(...Object.entries(LEVELS).map(([value, level]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `レベル${value}　${level.label}`;
    return option;
  }));

  elements.toleranceSelect.replaceChildren(...Object.entries(TOL).map(([value, tolerance]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = tolerance.label;
    return option;
  }));

  elements.levelSelect.value = String(settings.level);
  elements.keySelect.value = settings.key;
  elements.countSelect.value = String(settings.count);
  elements.hintSelect.value = settings.hint;
  elements.soundSelect.value = settings.sound;
  elements.toleranceSelect.value = settings.tolerance;
  elements.a4Select.value = String(settings.a4);

  const controls = {
    level: elements.levelSelect,
    key: elements.keySelect,
    count: elements.countSelect,
    hint: elements.hintSelect,
  };
  query.locked.forEach((name) => {
    controls[name].disabled = true;
    controls[name].setAttribute('aria-describedby', 'teacher-notice');
  });
  elements.teacherNotice.hidden = !query.hasQuery;
  updateLevelDescription();
}

function updateLevelDescription() {
  const level = Number(elements.levelSelect.value);
  if (level === 6) {
    elements.levelDescription.textContent = '4の指は隣の開放弦と同じ高さ。音では区別できないので、弦は自分で見て確かめます。';
    return;
  }
  elements.levelDescription.textContent = `第1ポジションで、${LEVELS[level].label}を使います。`;
}

function showScreen(name) {
  state.screen = name;
  Object.entries(screens).forEach(([screenName, screen]) => {
    screen.hidden = screenName !== name;
  });
  window.scrollTo(0, 0);
}

function later(callback, delay, token = state.sessionId) {
  const timer = clock.setTimeout(() => {
    state.timers.delete(timer);
    if (token === state.sessionId) callback();
  }, delay);
  state.timers.add(timer);
  return timer;
}

function clearTimers() {
  state.timers.forEach((timer) => clock.clearTimeout(timer));
  state.timers.clear();
}

function stopOscillators() {
  state.oscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // すでに停止済みでも、画面遷移の後片づけは続ける。
    }
  });
  state.oscillators.clear();
}

function closeRuntime() {
  clearTimers();
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
  stopOscillators();

  const mic = state.mic;
  state.mic = null;
  if (mic) mic.close();

  const toneContext = state.toneContext;
  state.toneContext = null;
  if (toneContext && toneContext.state !== 'closed') {
    toneContext.close().catch(() => {});
  }

  state.holder = null;
  state.processing = false;
}

function invalidateSession() {
  state.sessionId += 1;
  closeRuntime();
}

function resetCheckView() {
  elements.checkStatus.textContent = 'マイクを準備しています';
  elements.listeningMark.classList.remove('is-heard');
  elements.checkGuidance.querySelectorAll('[data-guide]').forEach((item) => {
    item.hidden = true;
  });
}

function revealGuide(name) {
  const guide = elements.checkGuidance.querySelector(`[data-guide="${name}"]`);
  if (guide) guide.hidden = false;
}

function queueManualPractice(message, token, delay = 1600) {
  if (state.manualTransitionQueued || token !== state.sessionId) return;
  state.manualTransitionQueued = true;
  state.listenMode = false;
  elements.checkStatus.textContent = message;
  revealGuide('volume');
  revealGuide('permission');
  revealGuide('noise');
  later(() => beginPractice(token, false), delay, token);
}

function micFailureMessage(error) {
  if (!microphoneAvailable()) {
    return 'この環境ではマイクを使えません。音を聞かないモードへ切り替えます。';
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'マイクが許可されませんでした。音を聞かないモードへ切り替えます。';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return '使えるマイクが見つかりません。音を聞かないモードへ切り替えます。';
  }
  return 'マイクを準備できませんでした。音を聞かないモードへ切り替えます。';
}

async function startMicrophone(token) {
  if (!microphoneAvailable()) {
    queueManualPractice(micFailureMessage(), token);
    return;
  }

  try {
    const mic = await createMic();
    if (token !== state.sessionId || state.screen !== 'check') {
      mic.close();
      return;
    }
    state.mic = mic;
    elements.checkStatus.textContent = '音を待っています';
    startAudioLoop(token);
  } catch (error) {
    // 自動フォールバックや「音を聞かない」選択の後に届いた失敗は、現在の練習を触らない。
    if (token !== state.sessionId || state.screen !== 'check') return;
    queueManualPractice(micFailureMessage(error), token);
  }
}

function startSession(config) {
  invalidateSession();
  const token = state.sessionId;
  state.config = { ...config };
  state.listenMode = true;
  state.checkFrames = 0;
  state.checkConfirmed = false;
  state.manualTransitionQueued = false;
  state.phraseIndex = 0;
  state.phrase = null;
  state.previousPhrase = null;
  state.noteIndex = 0;
  state.outcomes = [];
  state.hintStage = 0;
  state.missFlash = false;
  state.voiceMuteUntil = 0;
  state.records = [];

  resetCheckView();
  showScreen('check');

  later(() => revealGuide('volume'), 2600, token);
  later(() => revealGuide('permission'), 5400, token);
  later(() => revealGuide('noise'), 8200, token);
  later(() => {
    queueManualPractice('音を確認できませんでした。音を聞かないモードへ切り替えます。', token, 1400);
  }, 11200, token);
  void startMicrophone(token);
}

function confirmSound(token) {
  if (state.checkConfirmed || token !== state.sessionId) return;
  state.checkConfirmed = true;
  clearTimers();
  elements.listeningMark.classList.add('is-heard');
  elements.checkStatus.textContent = '聞こえてるよ';
  later(() => beginPractice(token, true), 650, token);
}

function buildCandidates(config) {
  const byMidi = new Map();
  for (const string of STRINGS) {
    for (const position of fingering(string.midi, config.key)) {
      const candidate = {
        midi: position.midi,
        stringId: string.id,
        finger: position.finger,
      };
      const current = byMidi.get(candidate.midi);
      // 出題範囲ではなく全4弦を競合させ、同じ高さだけは押さえる指の少ない運指を代表にする。
      if (!current || candidate.finger < current.finger) byMidi.set(candidate.midi, candidate);
    }
  }
  return [...byMidi.values()].sort((left, right) => left.midi - right.midi);
}

function beginPractice(token, listenMode) {
  if (token !== state.sessionId) return;
  clearTimers();
  state.listenMode = listenMode && Boolean(state.mic);
  state.manualTransitionQueued = false;
  state.holder = createHolder(TOL[state.config.tolerance]);
  // 音確認で伸ばした音を最初の出題へ持ち越さず、いったん途切れてから受け付ける。
  state.holder.reset();

  if (!state.listenMode) {
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = 0;
    const mic = state.mic;
    state.mic = null;
    if (mic) mic.close();
  }

  showScreen('practice');
  loadPhrase();
  if (state.listenMode && !state.animationFrame) startAudioLoop(token);
}

function loadPhrase() {
  state.phrase = makePhrase({
    level: state.config.level,
    key: state.config.key,
    length: 4,
    prev: state.previousPhrase,
  });
  state.noteIndex = 0;
  state.outcomes = Array(4).fill(null);
  state.processing = false;
  state.missFlash = false;
  startCurrentRecord();
  elements.practiceStatus.textContent = state.listenMode
    ? 'いま明るくなっている音を弾きます。'
    : '弾けたら「弾けたので次へ」で進みます。';
  renderPractice();
}

function currentNote() {
  return state.phrase?.notes[state.noteIndex] || null;
}

function currentRecord() {
  return state.records.at(-1) || null;
}

function startCurrentRecord() {
  const note = currentNote();
  if (!note) return;
  const staff = midiToStaff(note.midi, state.config.key);
  const record = {
    phraseNumber: state.phraseIndex + 1,
    noteNumber: state.noteIndex + 1,
    midi: note.midi,
    stringId: note.stringId,
    finger: note.finger,
    staff,
    mode: state.listenMode ? 'mic' : 'manual',
    shownAt: performance.now(),
    firstVoiceMs: null,
    retries: 0,
    detectedMidis: [],
    hints: new Set(),
    outcome: null,
  };
  state.records.push(record);
  state.hintStage = state.config.hint === 'on' ? 2 : 0;
  if (state.hintStage === 2) {
    record.hints.add('音名（最初から）');
    record.hints.add('推奨運指（最初から）');
  }
  updateHoldProgress(0);
}

function nearestMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / state.config.a4));
}

function processPracticeAudio(now, detection, token) {
  if (!state.holder || token !== state.sessionId) return;
  const tolerance = TOL[state.config.tolerance];
  const voiced = detection.f > 0 && detection.conf > tolerance.conf;

  if (state.processing) {
    // 表示待ちの間も無声だけは holder へ渡し、判定後の再武装を見落とさない。
    if (!voiced) state.holder.feed(now, detection);
    return;
  }

  const record = currentRecord();
  if (!record) return;

  if (voiced && now >= state.voiceMuteUntil && record.firstVoiceMs == null) {
    record.firstVoiceMs = Math.max(0, now - record.shownAt);
  }

  const held = state.holder.feed(now, detection);
  updateHoldProgress(state.holder.progress());
  if (!held) return;

  const detectedMidi = nearestMidi(held.freq);
  record.detectedMidis.push(detectedMidi);
  const note = currentNote();
  const result = judgeNote({
    freq: held.freq,
    targetMidi: note.midi,
    candidates: buildCandidates(state.config),
    cfg: tolerance,
    a4: state.config.a4,
  });

  if (result.ok) {
    passCurrentNote('mic', token);
  } else {
    missCurrentNote(result, token);
  }
}

function startAudioLoop(token) {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);

  const frame = (now) => {
    if (token !== state.sessionId || !state.mic) {
      state.animationFrame = 0;
      return;
    }

    try {
      const detection = detect(state.mic.read(), state.mic.sampleRate);
      if (state.screen === 'check' && !state.checkConfirmed) {
        if (detection.f > 0 && detection.conf > TOL.loose.conf) {
          state.checkFrames += 1;
          if (state.checkFrames >= 2) confirmSound(token);
        } else {
          state.checkFrames = 0;
        }
      } else if (state.screen === 'practice' && state.listenMode) {
        processPracticeAudio(now, detection, token);
      }
    } catch {
      if (state.screen === 'check') {
        queueManualPractice('マイクの音を読み取れませんでした。音を聞かないモードへ切り替えます。', token);
      } else if (state.screen === 'practice') {
        switchPracticeToManual();
      }
      return;
    }

    state.animationFrame = requestAnimationFrame(frame);
  };

  state.animationFrame = requestAnimationFrame(frame);
}

function switchPracticeToManual() {
  if (!state.listenMode) return;
  state.listenMode = false;
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
  const mic = state.mic;
  state.mic = null;
  if (mic) mic.close();
  state.holder?.reset();
  const record = currentRecord();
  if (record) record.mode = 'manual';
  elements.practiceStatus.textContent = 'マイクの音を読めなくなったため、自分で進むモードへ切り替えました。';
  renderPractice();
}

function passCurrentNote(mode, token = state.sessionId) {
  if (state.processing || token !== state.sessionId) return;
  const record = currentRecord();
  if (!record) return;
  record.outcome = 'passed';
  state.outcomes[state.noteIndex] = 'passed';
  state.processing = true;
  state.missFlash = false;
  state.holder?.reset();
  updateHoldProgress(0);
  elements.practiceStatus.textContent = mode === 'mic' ? '聞こえたよ。' : '次の音へ進みます。';
  renderPractice();

  if (state.noteIndex === state.phrase.notes.length - 1) {
    void completePhrase(token);
    return;
  }

  later(() => {
    state.noteIndex += 1;
    state.processing = false;
    startCurrentRecord();
    elements.practiceStatus.textContent = state.listenMode
      ? '次の音を弾きます。'
      : '弾けたら「弾けたので次へ」で進みます。';
    renderPractice();
  }, 300, token);
}

function missCurrentNote(result, token) {
  const record = currentRecord();
  if (!record || token !== state.sessionId) return;
  record.retries += 1;
  record.hints.add('音名（外した後）');
  state.hintStage = Math.max(state.hintStage, 1);
  state.processing = true;
  state.missFlash = true;
  state.holder.reset();
  updateHoldProgress(0);

  const heard = result.heard;
  if (!heard
    || !Number.isFinite(heard.midi)
    || typeof heard.stringId !== 'string'
    || !Number.isInteger(heard.finger)) {
    throw new TypeError('judgeNote は不合格時に heard を返す契約です');
  }
  const stringLabel = STRING_BY_ID.get(heard.stringId)?.label || `${heard.stringId}線`;
  elements.practiceStatus.textContent = `いまのは ${noteNameJa(heard.midi)} の高さに聞こえたよ（${stringLabel}の${heard.finger}の高さ）`;
  renderPractice();

  later(() => {
    state.processing = false;
    state.missFlash = false;
    elements.practiceStatus.textContent = '同じ音を、もう一度そのまま続けます。';
    renderPractice();
  }, 620, token);
}

function skipCurrentNote() {
  if (state.processing || state.screen !== 'practice') return;
  const record = currentRecord();
  if (!record) return;
  record.outcome = 'skipped';
  state.outcomes[state.noteIndex] = 'skipped';
  state.processing = true;
  state.holder?.reset();
  updateHoldProgress(0);
  elements.practiceStatus.textContent = 'この音はとばして、次へ進みます。';
  renderPractice();

  const token = state.sessionId;
  if (state.noteIndex === state.phrase.notes.length - 1) {
    void completePhrase(token);
    return;
  }

  later(() => {
    state.noteIndex += 1;
    state.processing = false;
    startCurrentRecord();
    elements.practiceStatus.textContent = state.listenMode
      ? '次の音を弾きます。'
      : '弾けたら「弾けたので次へ」で進みます。';
    renderPractice();
  }, 280, token);
}

async function completePhrase(token) {
  if (token !== state.sessionId) return;
  const allPassed = state.outcomes.every((outcome) => outcome === 'passed');
  let soundDuration = 0;
  if (allPassed) {
    elements.practiceStatus.textContent = '4音そろいました。';
    renderPractice();
    if (state.config.sound === 'on') soundDuration = await playCompletionChord();
  } else {
    elements.practiceStatus.textContent = '次のフレーズへ進みます。';
    renderPractice();
  }
  if (token !== state.sessionId) return;

  later(() => {
    if (state.phraseIndex + 1 >= state.config.count) {
      finishSession();
      return;
    }
    state.previousPhrase = state.phrase;
    state.phraseIndex += 1;
    loadPhrase();
  }, Math.max(520, soundDuration + 180), token);
}

function revealHint() {
  if (state.processing || state.screen !== 'practice') return;
  const record = currentRecord();
  if (!record) return;

  if (state.hintStage === 0) {
    state.hintStage = 1;
    record.hints.add('音名');
    elements.practiceStatus.textContent = 'まず音名を見て、もう一度譜面に戻ります。';
  } else if (state.hintStage === 1) {
    state.hintStage = 2;
    record.hints.add('推奨運指');
    elements.practiceStatus.textContent = 'このアプリが勧める運指も出しました。';
  } else {
    elements.practiceStatus.textContent = '音名と、このアプリが勧める運指を表示しています。';
  }
  renderPractice();
}

function buildStaffNotes() {
  return state.phrase.notes.map((note, index) => {
    let noteState = 'todo';
    if (index < state.noteIndex) {
      noteState = state.outcomes[index] === 'passed' ? 'done' : 'miss';
    } else if (index === state.noteIndex) {
      if (state.processing && state.outcomes[index] === 'passed') noteState = 'done';
      else if (state.processing && state.outcomes[index] === 'skipped') noteState = 'miss';
      else noteState = state.missFlash ? 'miss' : 'current';
    }

    let hint = null;
    if (index === state.noteIndex && state.hintStage >= 1) {
      hint = { nameJa: noteNameJa(note.midi) };
      if (state.hintStage >= 2) {
        hint.stringId = note.stringId;
        hint.finger = note.finger;
      }
    }
    return { midi: note.midi, state: noteState, hint };
  });
}

function alternatePositionText(note) {
  const alternate = positionsForMidi(note.midi, state.config.key)
    .find((position) => position.stringId !== note.stringId || position.finger !== note.finger);
  if (!alternate) return '';
  const label = STRING_BY_ID.get(alternate.stringId)?.label || `${alternate.stringId}線`;
  return `※ ${label}の${alternate.finger}と同じ高さ`;
}

function renderPractice() {
  if (!state.phrase || state.screen !== 'practice') return;
  const displayWidth = Math.max(280, Math.round(elements.staffWrap.clientWidth || 400));
  const staffNotes = buildStaffNotes();
  const theme = currentTheme();
  // 横の必要幅はstaff.jsが線間単位で積算するため、DOMの実幅をそのまま渡す。
  elements.staffWrap.innerHTML = renderStaff({
    key: state.config.key,
    notes: staffNotes,
    width: displayWidth,
    theme,
  });

  elements.practiceCount.textContent = `${state.phraseIndex + 1} / ${state.config.count} フレーズ`;
  elements.practiceKey.textContent = `${KEYS[state.config.key].jp}（${state.config.key}）`;
  elements.noteCount.textContent = `${Math.min(state.noteIndex + 1, 4)} / 4音`;
  elements.manualNotice.hidden = state.listenMode;
  elements.manualNextButton.hidden = state.listenMode;
  elements.exampleButton.hidden = state.config.sound !== 'on';

  const note = currentNote();
  const showHint = Boolean(note) && state.hintStage >= 1;
  elements.hintPanel.hidden = !showHint;
  if (showHint) {
    elements.hintName.textContent = `音名　${noteNameJa(note.midi)}`;
    elements.hintFingering.hidden = state.hintStage < 2;
    elements.hintFingering.textContent = state.hintStage >= 2
      ? `このアプリが勧める運指　${STRING_BY_ID.get(note.stringId).label}の${note.finger}`
      : '';

    const alternate = state.hintStage >= 2 ? alternatePositionText(note) : '';
    elements.samePitchNote.hidden = !alternate;
    elements.samePitchNote.textContent = alternate;
    elements.fourthFingerNote.hidden = !(state.hintStage >= 2 && state.config.level === 6 && note.finger === 4);
  }
}

function updateHoldProgress(progress) {
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  elements.holdFill.style.width = `${percent}%`;
  elements.holdTrack.setAttribute('aria-valuenow', String(percent));
}

async function audioContextForTone() {
  if (state.mic?.ctx && state.mic.ctx.state !== 'closed') {
    if (state.mic.ctx.state === 'suspended') await state.mic.ctx.resume();
    return state.mic.ctx;
  }
  if (!state.toneContext || state.toneContext.state === 'closed') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.toneContext = new AudioContextClass();
  }
  if (state.toneContext.state === 'suspended') await state.toneContext.resume();
  return state.toneContext;
}

function scheduleTone(context, midi, start, duration, volume = 0.055) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(mtof(midi, state.config.a4), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
  gain.gain.setValueAtTime(volume, Math.max(start + 0.03, start + duration - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  state.oscillators.add(oscillator);
  oscillator.addEventListener('ended', () => state.oscillators.delete(oscillator), { once: true });
}

async function playSequence(midis, { noteDuration = 0.52, gap = 0.09, chord = false } = {}) {
  const token = state.sessionId;
  try {
    const context = await audioContextForTone();
    // AudioContextの準備中に「やめる」が押されたら、閉じたContextへ音を予約しない。
    if (token !== state.sessionId || state.screen !== 'practice' || context?.state === 'closed') {
      return 0;
    }
    if (!context) {
      elements.practiceStatus.textContent = 'この端末では、おてほんの音を鳴らせません。';
      return 0;
    }
    stopOscillators();
    const start = context.currentTime + 0.035;
    if (chord) {
      midis.forEach((midi) => scheduleTone(context, midi, start, noteDuration, 0.032));
    } else {
      midis.forEach((midi, index) => {
        scheduleTone(context, midi, start + index * (noteDuration + gap), noteDuration);
      });
    }
    const seconds = chord
      ? noteDuration
      : midis.length * noteDuration + Math.max(0, midis.length - 1) * gap;
    const duration = Math.ceil(seconds * 1000) + 90;
    const muteUntil = performance.now() + duration + 140;
    state.voiceMuteUntil = Math.max(state.voiceMuteUntil, muteUntil);
    state.holder?.muteUntil(muteUntil);
    updateHoldProgress(0);
    return duration;
  } catch {
    elements.practiceStatus.textContent = 'おてほんの音を準備できませんでした。';
    return 0;
  }
}

async function playExample(allNotes) {
  if (state.screen !== 'practice' || state.config.sound !== 'on' || state.processing) return;
  const record = currentRecord();
  if (record) record.hints.add(allNotes ? '4音のおてほん' : 'おてほん');
  elements.practiceStatus.textContent = allNotes
    ? '4音のおてほんを鳴らしています。'
    : 'いまの音のおてほんを鳴らしています。';
  const midis = allNotes ? state.phrase.notes.map((note) => note.midi) : [currentNote().midi];
  const duration = await playSequence(midis, {
    noteDuration: allNotes ? 0.42 : 0.64,
    gap: 0.09,
  });
  const token = state.sessionId;
  later(() => {
    if (state.screen !== 'practice' || state.processing) return;
    elements.practiceStatus.textContent = state.listenMode
      ? '同じ音を弾いてみます。'
      : '弾けたら「弾けたので次へ」で進みます。';
  }, duration + 80, token);
}

async function playCompletionChord() {
  const tonic = TONIC_MIDI[state.config.key];
  return playSequence([tonic, tonic + 4, tonic + 7], {
    noteDuration: 0.42,
    chord: true,
  });
}

function staffPositionLabel(staff) {
  const value = staff.diatonic;
  if (value >= 0 && value <= 8) {
    return value % 2 === 0
      ? `第${value / 2 + 1}線`
      : `第${(value + 1) / 2}間`;
  }
  const known = {
    '-1': '五線のすぐ下の間',
    '-2': '下第1加線',
    '-3': '下第1加線の下',
    '-4': '下第2加線',
    '-5': '下第2加線の下',
    9: '五線のすぐ上の間',
    10: '上第1加線',
    11: '上第1加線の上',
  };
  return known[value] || `五線位置 ${value}`;
}

function hintSummary(record) {
  return record.hints.size ? [...record.hints].join('、') : 'なし';
}

function detectionSummary(record) {
  if (!record.detectedMidis.length) return '検出なし';
  return record.detectedMidis.map((midi) => noteNameJa(midi)).join(' → ');
}

function firstVoiceSummary(record) {
  if (record.mode === 'manual') return '不明（音を聞かないモード）';
  if (record.firstVoiceMs == null) return '検出なし';
  return `${(record.firstVoiceMs / 1000).toFixed(1)}秒`;
}

function aggregateTrouble() {
  const grouped = new Map();
  state.records.forEach((record, index) => {
    if (record.retries <= 0) return;
    const key = record.midi;
    const existing = grouped.get(key) || {
      midi:record.midi,
      retries:0,
      firstIndex:index,
      fingerings:[],
    };
    existing.retries += record.retries;
    if (!existing.fingerings.some(fingering =>
      fingering.stringId === record.stringId && fingering.finger === record.finger)) {
      existing.fingerings.push({stringId:record.stringId, finger:record.finger});
    }
    grouped.set(key, existing);
  });
  return [...grouped.values()]
    .sort((left, right) => right.retries - left.retries || left.firstIndex - right.firstIndex)
    .slice(0, 3);
}

function renderResults() {
  const total = state.records.length;
  const cleanMic = state.records.filter((record) =>
    record.mode === 'mic'
    && record.outcome === 'passed'
    && record.retries === 0
    && record.hints.size === 0).length;
  const cleanManual = state.records.filter((record) =>
    record.mode === 'manual'
    && record.outcome === 'passed'
    && record.retries === 0
    && record.hints.size === 0).length;
  const modes = new Set(state.records.map((record) => record.mode));

  if (modes.size === 1 && modes.has('manual')) {
    elements.resultSummary.textContent = `${state.config.count}フレーズ（${total}音）のうち、${cleanManual}音をヒントなしで一度で進めました。`;
    elements.resultModeNote.textContent = '音を聞かないモードの自己記録です。音高は確認していません。';
    elements.resultModeNote.hidden = false;
  } else if (modes.size > 1) {
    elements.resultSummary.textContent = `${state.config.count}フレーズ（${total}音）のうち、音高確認で${cleanMic}音、自己確認で${cleanManual}音をヒントなしの一度目に進めました。`;
    elements.resultModeNote.textContent = '途中から音を聞かないモードへ切り替わった記録です。';
    elements.resultModeNote.hidden = false;
  } else {
    elements.resultSummary.textContent = `${state.config.count}フレーズ（${total}音）のうち、${cleanMic}音をヒントなしで一発で通せました。`;
    elements.resultModeNote.hidden = true;
    elements.resultModeNote.textContent = '';
  }

  const trouble = aggregateTrouble();
  elements.troubleList.replaceChildren();
  if (!trouble.length) {
    const item = document.createElement('li');
    item.className = 'empty-item';
    item.textContent = 'やり直しとして記録された音はありません。';
    elements.troubleList.append(item);
  } else {
    trouble.forEach((record) => {
      const item = document.createElement('li');
      const fingerings = record.fingerings.map(fingering => {
        const stringLabel = STRING_BY_ID.get(fingering.stringId)?.label || `${fingering.stringId}線`;
        return `${stringLabel}の${fingering.finger}`;
      }).join('／');
      item.textContent = `${noteNameJa(record.midi)}で${record.retries}回やり直した（勧めた運指: ${fingerings}）`;
      elements.troubleList.append(item);
    });
  }

  const skipped = state.records.filter((record) => record.outcome === 'skipped').length;
  if (modes.has('manual')) {
    elements.nextSuggestion.textContent = '次は、マイクが使える場所で同じ設定を一度。';
  } else if (skipped > 0) {
    elements.nextSuggestion.textContent = '次は、とばした音だけ音名のヒントを使ってもう一度。';
  } else {
    elements.nextSuggestion.textContent = '次は、同じ設定でもう一度。';
  }

  elements.recordList.replaceChildren();
  state.records.forEach((record) => {
    const card = document.createElement('article');
    card.className = 'record-card';
    const title = document.createElement('h3');
    title.textContent = `${record.phraseNumber}フレーズ目・${record.noteNumber}音目　${staffPositionLabel(record.staff)}（${noteNameJa(record.midi)}）`;

    const facts = document.createElement('dl');
    facts.className = 'record-facts';
    const rows = [
      ['出題の譜面位置', staffPositionLabel(record.staff)],
      ['検出した音高', detectionSummary(record)],
      ['最初の発音まで', firstVoiceSummary(record)],
      ['やり直し回数', `${record.retries}回`],
      ['使ったヒント', hintSummary(record)],
    ];
    rows.forEach(([term, description]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = description;
      facts.append(dt, dd);
    });
    card.append(title, facts);
    elements.recordList.append(card);
  });
}

function finishSession() {
  state.sessionId += 1;
  closeRuntime();
  renderResults();
  showScreen('result');
}

function returnToSettings() {
  invalidateSession();
  showScreen('setup');
}

function renderIntroStaff() {
  elements.introStaff.innerHTML = renderStaff({
    key: 'C',
    notes: [
      { midi: 69, state: 'current', hint: null },
      { midi: 71, state: 'todo', hint: null },
    ],
    width: 320,
    theme: currentTheme(),
  });
}

function showIntroIfNeeded() {
  if (stored.introSeen) return;
  renderIntroStaff();
  elements.introDialog.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => elements.introCloseButton.focus());
}

elements.settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const config = settingsFromForm();
  saveSettings(config);
  startSession(config);
});

elements.settingsForm.addEventListener('change', () => {
  updateLevelDescription();
  saveSettings(settingsFromForm());
});

elements.withoutMicButton.addEventListener('click', () => {
  if (state.screen !== 'check') return;
  state.listenMode = false;
  beginPractice(state.sessionId, false);
});

elements.checkCancelButton.addEventListener('click', returnToSettings);
elements.hintButton.addEventListener('click', revealHint);
elements.skipButton.addEventListener('click', skipCurrentNote);
elements.manualNextButton.addEventListener('click', () => passCurrentNote('manual'));
elements.quitButton.addEventListener('click', returnToSettings);
elements.retryButton.addEventListener('click', () => startSession({ ...state.config }));
elements.backButton.addEventListener('click', returnToSettings);

let exampleHoldTimer = 0;
let exampleLongPressed = false;
elements.exampleButton.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  exampleLongPressed = false;
  clock.clearTimeout(exampleHoldTimer);
  exampleHoldTimer = clock.setTimeout(() => {
    exampleLongPressed = true;
    void playExample(true);
  }, 560);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
  elements.exampleButton.addEventListener(type, () => clock.clearTimeout(exampleHoldTimer));
});
elements.exampleButton.addEventListener('click', () => {
  if (exampleLongPressed) {
    exampleLongPressed = false;
    return;
  }
  void playExample(false);
});
elements.exampleButton.addEventListener('contextmenu', (event) => event.preventDefault());

elements.introCloseButton.addEventListener('click', () => {
  markIntroSeen();
  elements.introDialog.hidden = true;
  document.body.classList.remove('modal-open');
  elements.levelSelect.focus();
});

const resizeObserver = new ResizeObserver(() => {
  if (state.screen === 'practice') renderPractice();
});
resizeObserver.observe(elements.staffWrap);

const handleThemeChange = () => {
  if (!elements.introDialog.hidden) renderIntroStaff();
  if (state.screen === 'practice') renderPractice();
};
if (typeof colorScheme.addEventListener === 'function') {
  colorScheme.addEventListener('change', handleThemeChange);
} else {
  colorScheme.addListener(handleThemeChange);
}

window.addEventListener('pagehide', () => {
  invalidateSession();
});

populateSettings(initialSettings);
showScreen('setup');
showIntroIfNeeded();

return Object.freeze({
  destroy(){
    invalidateSession();
  },
});
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  createFuyomiApp({window, document});
}
