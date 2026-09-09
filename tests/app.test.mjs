import test from 'node:test';
import assert from 'node:assert/strict';

import {createFuyomiApp} from '../js/app.js';
import {mtof} from '../js/theory.js';
import {companionStage, renderCompanion} from '../js/companion.js';

const ELEMENT_IDS = [
  'timer-select', 'timer-chip-off', 'timer-chip-on', 'practice-timer', 'result-time',
  'setup-screen', 'check-screen', 'practice-screen', 'result-screen', 'settings-form',
  'level-select', 'key-select', 'count-select', 'hint-select', 'sound-select',
  'marks-select', 'strings-field', 'strings-note', 'string-legend', 'string-chip-G',
  'string-chip-D', 'string-chip-A', 'string-chip-E',
  'tolerance-select', 'a4-select', 'level-description', 'teacher-notice', 'check-status',
  'check-guidance', 'without-mic-button', 'check-cancel-button', 'practice-count',
  'practice-key', 'manual-notice', 'staff-wrap', 'note-count', 'hold-track', 'hold-fill',
  'practice-status', 'hint-panel', 'hint-name', 'hint-fingering', 'same-pitch-note',
  'fourth-finger-note', 'hint-button', 'example-button', 'manual-next-button', 'skip-button',
  'quit-button', 'result-summary', 'result-mode-note', 'trouble-list', 'next-suggestion',
  'record-list', 'retry-button', 'back-button', 'intro-dialog', 'intro-staff',
  'intro-close-button', 'companion', 'companion-art', 'companion-words',
  'companion-chip-fluffy', 'companion-chip-dino', 'companion-chip-dog'
];

const note = (midi, stringId, finger) => ({midi, stringId, finger});
const DEFAULT_PHRASES = [
  [note(69, 'A', 0), note(71, 'A', 1), note(73, 'A', 2), note(69, 'A', 0)],
  [note(71, 'A', 1), note(73, 'A', 2), note(74, 'A', 3), note(69, 'A', 0)],
  [note(73, 'A', 2), note(71, 'A', 1), note(69, 'A', 0), note(73, 'A', 2)]
];
const SILENT = Object.freeze({f:-1, conf:0, rms:0});

test('相棒は新レベル1〜5で一段ずつ進化する', () => {
  assert.deepEqual([1,2,3,4,5].map(companionStage), [1,2,3,4,5]);
  assert.equal(new Set([1,2,3,4,5].map(level => renderCompanion(level))).size, 5);
});

test('3種類を選べて設定を保存し、再起動時にも復元する', () => {
  for (const kind of ['fluffy','dino','dog']) {
    const h = createHarness();
    h.document.getElementById(`companion-chip-${kind}`).click();
    const settings = JSON.parse(h.storage.getItem('fuyomi')).settings;
    assert.equal(settings.companion,kind);
    h.app.destroy();
    const restored = createHarness({storedSettings:settings});
    for (const other of ['fluffy','dino','dog']) {
      assert.equal(restored.document.getElementById(`companion-chip-${other}`).getAttribute('aria-pressed'),String(kind===other));
    }
    restored.app.destroy();
  }
  const h=createHarness({storedSettings:{companion:'invalid'}});
  assert.equal(h.document.getElementById('companion-chip-fluffy').getAttribute('aria-pressed'),'true');
  h.app.destroy();
});

test('恐竜と犬も正解・不正解・弾き直しに反応する', async () => {
  for (const kind of ['dino','dog']) {
    const h=createHarness({storedSettings:{companion:kind}});
    await startMicPractice(h,{level:5});
    const art=h.document.getElementById('companion-art');
    assert.match(art.innerHTML,new RegExp(`data-kind="${kind}"`));
    assert.match(art.innerHTML,/data-stage="5"/);
    holdMidi(h,71);
    assert.equal(h.document.getElementById('companion').getAttribute('data-reaction'),'miss');
    assert.match(art.innerHTML,/gloomy/);
    h.clock.advance(5000);
    assert.match(art.innerHTML,/gloomy/);
    armWithSilence(h);
    holdMidi(h,69);
    assert.match(art.innerHTML,/is-happy/);
    h.app.destroy();
  }
});

test('レベル3・5は番号なしでも同音異弦の0と4だけを残す', async () => {
  const phrases = [[note(76,'A',4),note(76,'E',0),note(71,'A',1),note(83,'E',4)]];
  for (const level of [2,3,5]) {
    for (const marks of ['off','color']) {
      const h = createHarness({phrases});
      h.document.getElementById('marks-select').value = marks;
      await startMicPractice(h,{level});
      const svg = h.document.getElementById('staff-wrap').innerHTML;
      const labels = [...svg.matchAll(/data-role="finger"[^>]*data-finger="(\d)"/g)].map(m=>m[1]);
      assert.deepEqual(labels, level===2 ? [] : ['4','0']);
      h.app.destroy();
    }
  }
});

test('調にないナチュラルも吹き出しが正しく言い当てる', async () => {
  const h = createHarness({phrases:[[note(73,'A',2),note(74,'A',3),note(71,'A',1),note(69,'A',0)]]});
  await startMicPractice(h);
  holdMidi(h,72);
  assert.equal(h.document.getElementById('companion-words').textContent,'ドの音に聞こえるよ');
  assert.equal(h.document.getElementById('note-count').textContent,'1 / 4音');
  h.app.destroy();
});

test('相棒は4音目を含む全正解に反応し、持続音で二重反応しない', async () => {
  const h = createHarness();
  await startMicPractice(h);
  const companion = h.document.getElementById('companion');
  for (const note of DEFAULT_PHRASES[0]) {
    armWithSilence(h);
    holdMidi(h, note.midi);
    assert.equal(companion.getAttribute('data-reaction'), 'happy');
    h.clock.advance(900);
    assert.equal(companion.getAttribute('data-reaction'), 'idle');
  }
  h.document.getElementById('quit-button').click();
  assert.equal(h.document.getElementById('companion-art').innerHTML, '');
  h.app.destroy();
});

test('不正解の吹き出しは無期限に残り、途切れた後の弾き直し開始で消える', async () => {
  const h = createHarness();
  await startMicPractice(h);
  const companion = h.document.getElementById('companion');
  const words = h.document.getElementById('companion-words');
  holdMidi(h, 71);
  assert.equal(companion.getAttribute('data-reaction'), 'miss');
  assert.equal(words.textContent, 'シの音に聞こえるよ');
  h.clock.advance(10000);
  holdMidi(h, 71);
  assert.equal(companion.getAttribute('data-reaction'), 'miss');
  armWithSilence(h);
  h.clock.advance(10000);
  assert.equal(companion.getAttribute('data-reaction'), 'miss');
  h.setDetection(voiced(69));
  h.clock.frame(20);
  assert.equal(companion.getAttribute('data-reaction'), 'idle');
  holdMidi(h, 69);
  assert.equal(companion.getAttribute('data-reaction'), 'happy');
  h.app.destroy();
});

test('前の正解演出のタイマーが、次の不正解の吹き出しを消さない', async () => {
  const h = createHarness();
  await startMicPractice(h);
  holdMidi(h, 69);
  h.clock.advance(300);
  armWithSilence(h);
  holdMidi(h, 73);
  assert.equal(h.document.getElementById('companion').getAttribute('data-reaction'), 'miss');
  h.clock.advance(1500);
  assert.equal(h.document.getElementById('companion-words').textContent, 'ド♯の音に聞こえるよ');
  h.document.getElementById('skip-button').click();
  assert.equal(h.document.getElementById('companion').getAttribute('data-reaction'), 'idle');
  h.app.destroy();
});

class FakeClassList {
  constructor(){ this.values = new Set(); }
  add(...values){ values.forEach(value => this.values.add(value)); }
  remove(...values){ values.forEach(value => this.values.delete(value)); }
  contains(value){ return this.values.has(value); }
}

class FakeElement {
  constructor(tagName = 'div', id = ''){
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.classList = new FakeClassList();
    this.style = {};
    this.clientWidth = 400;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.guideChildren = new Map();
  }

  addEventListener(type, listener){
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, values = {}){
    const event = {
      type,
      target:this,
      currentTarget:this,
      preventDefault(){},
      ...values
    };
    for(const listener of this.listeners.get(type) || []) listener(event);
  }

  click(){ this.dispatch('click'); }
  focus(){ this.focused = true; }
  setAttribute(name, value){ this.attributes.set(name, String(value)); }
  getAttribute(name){ return this.attributes.get(name) ?? null; }
  replaceChildren(...children){ this.children = children; }
  append(...children){ this.children.push(...children); }

  querySelectorAll(selector){
    if(selector === '[data-guide]') return [...this.guideChildren.values()];
    return [];
  }

  querySelector(selector){
    const match = /^\[data-guide="([^"]+)"\]$/.exec(selector);
    return match ? this.guideChildren.get(match[1]) || null : null;
  }
}

class FakeDocument {
  constructor(){
    this.elements = new Map(ELEMENT_IDS.map(id => [id, new FakeElement('div', id)]));
    this.body = new FakeElement('body', 'body');
    this.listeningMark = new FakeElement('div');
    const guidance = this.getElementById('check-guidance');
    for(const name of ['volume', 'permission', 'noise']){
      const guide = new FakeElement('li');
      guide.hidden = true;
      guidance.guideChildren.set(name, guide);
    }
  }

  getElementById(id){ return this.elements.get(id) || null; }
  querySelector(selector){ return selector === '.listening-mark' ? this.listeningMark : null; }
  createElement(tagName){ return new FakeElement(tagName); }
}

class FakeStorage {
  constructor(){ this.values = new Map([['fuyomi', JSON.stringify({introSeen:true})]]); }
  getItem(key){ return this.values.get(key) ?? null; }
  setItem(key, value){ this.values.set(key, String(value)); }
}

class FakeClock {
  constructor(){
    this.time = 0;
    this.nextId = 1;
    this.timers = new Map();
    this.frames = new Map();
  }

  now(){ return this.time; }

  setTimeout(callback, delay = 0){
    const id = this.nextId++;
    this.timers.set(id, {at:this.time + Math.max(0, delay), callback});
    return id;
  }

  clearTimeout(id){ this.timers.delete(id); }

  requestAnimationFrame(callback){
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id){ this.frames.delete(id); }

  advance(milliseconds){
    const target = this.time + milliseconds;
    while(true){
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if(!due) break;
      const [id, timer] = due;
      this.timers.delete(id);
      this.time = timer.at;
      timer.callback();
    }
    this.time = target;
  }

  frame(milliseconds = 50){
    this.advance(milliseconds);
    const frames = [...this.frames.values()];
    this.frames.clear();
    frames.forEach(callback => callback(this.time));
  }

  get pendingTimers(){ return this.timers.size; }
  get pendingFrames(){ return this.frames.size; }
}

class FakeToneContext {
  constructor(clock){
    this.clock = clock;
    this.state = 'running';
    this.sampleRate = 48000;
    this.destination = {};
  }

  get currentTime(){ return this.clock.now() / 1000; }
  async resume(){ this.state = 'running'; }
  async close(){ this.state = 'closed'; }
  createOscillator(){
    let stopped = false;
    return {
      type:'sine',
      frequency:{setValueAtTime(){}},
      connect(){},
      start(){},
      stop(){
        if(stopped) throw new Error('oscillator already stopped');
        stopped = true;
      },
      addEventListener(){}
    };
  }
  createGain(){
    return {
      gain:{setValueAtTime(){}, exponentialRampToValueAtTime(){}},
      connect(){}
    };
  }
}

class FakeResizeObserver {
  observe(){}
  disconnect(){}
}

function deferred(){
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return {promise, resolve, reject};
}

async function flushAsync(){
  for(let index = 0; index < 6; index++) await Promise.resolve();
}

function createHarness({
  phrases = DEFAULT_PHRASES,
  createMicrophone,
  judgeNote,
  storedSettings,
} = {}){
  const clock = new FakeClock();
  const document = new FakeDocument();
  const storage = new FakeStorage();
  if (storedSettings) storage.setItem('fuyomi', JSON.stringify({settings:storedSettings}));
  const toneContext = new FakeToneContext(clock);
  let detection = SILENT;
  let microphoneClosed = false;
  let phraseCalls = 0;
  const phraseArgs = [];
  const mic = {
    read:() => detection,
    sampleRate:48000,
    ctx:toneContext,
    close(){
      microphoneClosed = true;
      void toneContext.close();
    }
  };
  const navigator = {mediaDevices:{getUserMedia(){}}};
  const window = {
    location:{search:''},
    localStorage:storage,
    navigator,
    performance:{now:() => clock.now()},
    setTimeout:(callback, delay) => clock.setTimeout(callback, delay),
    clearTimeout:(timer) => clock.clearTimeout(timer),
    requestAnimationFrame:(callback) => clock.requestAnimationFrame(callback),
    cancelAnimationFrame:(frame) => clock.cancelAnimationFrame(frame),
    scrollTo(){},
    addEventListener(){},
    matchMedia:() => ({matches:false, addEventListener(){}, addListener(){}}),
    ResizeObserver:FakeResizeObserver,
  };
  window.AudioContext = class extends FakeToneContext {
    constructor(){ super(clock); }
  };

  const app = createFuyomiApp({
    window,
    document,
    clock,
    storage,
    navigator,
    ResizeObserver:FakeResizeObserver,
    microphone:{
      create:createMicrophone || (async () => mic),
      detect:(sample) => sample,
    },
    makePhrase({level, key, strings}){
      const source = phrases[Math.min(phraseCalls, phrases.length - 1)];
      phraseCalls += 1;
      phraseArgs.push({level, key, strings});
      return {level, key, strings, notes:source.map(value => ({...value}))};
    },
    ...(judgeNote ? {judgeNote} : {}),
  });

  return {
    app,
    clock,
    document,
    mic,
    storage,
    setDetection(value){ detection = value; },
    get microphoneClosed(){ return microphoneClosed; },
    get phraseCalls(){ return phraseCalls; },
    get phraseArgs(){ return phraseArgs; },
  };
}

function pressedStrings(document){
  return ['G', 'D', 'A', 'E'].filter(id =>
    document.getElementById(`string-chip-${id}`).getAttribute('aria-pressed') === 'true');
}

function configure(harness, {level = 1, sound = 'off'} = {}){
  harness.document.getElementById('level-select').value = String(level);
  harness.document.getElementById('key-select').value = 'A';
  harness.document.getElementById('count-select').value = '3';
  harness.document.getElementById('hint-select').value = 'off';
  harness.document.getElementById('sound-select').value = sound;
  harness.document.getElementById('tolerance-select').value = 'loose';
  harness.document.getElementById('a4-select').value = '442';
}

function submit(harness){
  harness.document.getElementById('settings-form').dispatch('submit');
}

function voiced(midi){
  return {f:mtof(midi, 442), conf:1, rms:0.2};
}

function armWithSilence(harness){
  harness.setDetection(SILENT);
  harness.clock.frame(20);
}

function holdMidi(harness, midi){
  harness.setDetection(voiced(midi));
  for(let frame = 0; frame < 6; frame++) harness.clock.frame(50);
}

async function startMicPractice(harness, options = {}){
  configure(harness, options);
  submit(harness);
  await flushAsync();

  assert.equal(harness.document.getElementById('practice-screen').hidden, false);
  armWithSilence(harness);
}

async function startManualPractice(harness, options = {}){
  configure(harness, options);
  submit(harness);
  harness.document.getElementById('without-mic-button').click();
  await flushAsync();
  assert.equal(harness.document.getElementById('practice-screen').hidden, false);
}

function skipWholeSession(harness){
  const skip = harness.document.getElementById('skip-button');
  for(let phraseIndex = 0; phraseIndex < 3; phraseIndex++){
    for(let noteIndex = 0; noteIndex < 4; noteIndex++){
      skip.click();
      harness.clock.advance(noteIndex < 3 ? 280 : 520);
    }
  }
}

async function passWholeSession(harness, phrases, misses = new Set()){
  for(let phraseIndex = 0; phraseIndex < 3; phraseIndex++){
    for(let noteIndex = 0; noteIndex < 4; noteIndex++){
      const target = phrases[phraseIndex][noteIndex].midi;
      if(misses.has(`${phraseIndex}:${noteIndex}`)){
        holdMidi(harness, target === 71 ? 73 : 71);
        harness.clock.advance(620);
        armWithSilence(harness);
      }
      holdMidi(harness, target);
      if(noteIndex < 3){
        harness.clock.advance(300);
        armWithSilence(harness);
      } else {
        // 4音そろうと完了の和音が鳴る。和音の予約はawaitの先なので、
        // 時計を進める前にマイクロタスクを流して次フレーズのタイマーを登録させる。
        await flushAsync();
        harness.clock.advance(1000);
        if(phraseIndex < 2) armWithSilence(harness);
      }
    }
  }
}

test('app は DOM・時計・マイクを注入して起動できる境界を公開する', () => {
  assert.equal(typeof createFuyomiApp, 'function');
  const harness = createHarness();
  assert.equal(harness.document.getElementById('setup-screen').hidden, false);
  harness.app.destroy();
});

test('A: レベル1のD5に正確なE5を弾くと不正解になる', async () => {
  const phrases = [
    [note(74, 'A', 3), note(73, 'A', 2), note(71, 'A', 1), note(69, 'A', 0)],
    ...DEFAULT_PHRASES.slice(1)
  ];
  const harness = createHarness({phrases});
  await startMicPractice(harness, {level:1});

  holdMidi(harness, 76);

  assert.match(harness.document.getElementById('practice-status').textContent, /^いまのは ミ の音に聞こえるよ/);
  assert.equal(harness.document.getElementById('note-count').textContent, '1 / 4音');
});

test('C: 合格後に同じA4を伸ばし続けても、無音までは次のA4を合格にしない', async () => {
  const phrases = [
    [note(69, 'A', 0), note(69, 'A', 0), note(71, 'A', 1), note(69, 'A', 0)],
    ...DEFAULT_PHRASES.slice(1)
  ];
  const harness = createHarness({phrases});
  await startMicPractice(harness);

  holdMidi(harness, 69);
  harness.clock.advance(300);
  holdMidi(harness, 69);

  assert.equal(harness.document.getElementById('practice-status').textContent, '次の音を弾きます。');
  armWithSilence(harness);
  holdMidi(harness, 69);
  // 2音目の合格。合格の言葉は記録の本数で順に回るので、ここは2つ目になる。
  assert.equal(harness.document.getElementById('practice-status').textContent, 'いい感じ。');
});

test('D: 手動モード開始後に届いたマイク失敗は練習開始を二重予約しない', async () => {
  const pendingMic = deferred();
  const harness = createHarness({createMicrophone:() => pendingMic.promise});
  configure(harness);
  submit(harness);

  harness.document.getElementById('without-mic-button').click();
  assert.equal(harness.document.getElementById('practice-screen').hidden, false);
  assert.equal(harness.phraseCalls, 1);
  assert.equal(harness.clock.pendingTimers, 0);

  pendingMic.reject(Object.assign(new Error('late failure'), {name:'NotAllowedError'}));
  await flushAsync();
  assert.equal(harness.clock.pendingTimers, 0, '遅い失敗が2回目の beginPractice を予約した');
  harness.clock.advance(1600);
  assert.equal(harness.phraseCalls, 1);
});

test('E: おてほんのミュート中の音を最初の発音として記録しない', async () => {
  const harness = createHarness();
  await startMicPractice(harness, {sound:'on'});

  harness.document.getElementById('example-button').click();
  await flushAsync();
  harness.setDetection(voiced(69));
  harness.clock.frame(50);
  skipWholeSession(harness);

  const firstCard = harness.document.getElementById('record-list').children[0];
  const facts = firstCard.children[1].children;
  const firstVoiceIndex = facts.findIndex(item => item.textContent === '最初の発音まで');
  assert.equal(facts[firstVoiceIndex + 1].textContent, '検出なし');
});

test('F: やり直しは音高でまとめ、勧めた運指を従属情報として表示する', async () => {
  const phrases = [
    [note(69, 'A', 0), note(71, 'A', 1), note(73, 'A', 2), note(69, 'A', 0)],
    [note(69, 'D', 4), note(71, 'A', 1), note(73, 'A', 2), note(69, 'A', 0)],
    DEFAULT_PHRASES[2]
  ];
  const harness = createHarness({phrases});
  await startMicPractice(harness, {level:3});
  await passWholeSession(harness, phrases, new Set(['0:0', '1:0']));

  const trouble = harness.document.getElementById('trouble-list').children;
  assert.equal(trouble.length, 1);
  assert.equal(trouble[0].textContent, 'ラで2回やり直した（勧めた運指: ラ線の0／レ線の4）');
});

test('G: 画面遷移中にやめると、遅いタイマーが結果画面を出さない', async () => {
  const harness = createHarness();
  await startManualPractice(harness);
  const next = harness.document.getElementById('manual-next-button');

  for(let index = 0; index < 11; index++){
    next.click();
    harness.clock.advance(index % 4 === 3 ? 520 : 300);
  }
  next.click();
  harness.document.getElementById('quit-button').click();
  harness.clock.advance(1000);

  assert.equal(harness.document.getElementById('setup-screen').hidden, false);
  assert.equal(harness.document.getElementById('result-screen').hidden, true);
  assert.equal(harness.clock.pendingTimers, 0);
});

test('G: 最終音の合格後に結果へ移ると rAF・タイマー・マイクが残らない', async () => {
  const harness = createHarness();
  await startMicPractice(harness);
  await passWholeSession(harness, DEFAULT_PHRASES);

  assert.equal(harness.document.getElementById('result-screen').hidden, false);
  assert.equal(harness.clock.pendingFrames, 0);
  assert.equal(harness.clock.pendingTimers, 0);
  assert.equal(harness.microphoneClosed, true);
});

test('H: judgeNote が不合格時の heard 契約を破ったら既定候補で隠さない', async () => {
  const harness = createHarness({judgeNote:() => ({ok:false, cents:0})});
  await startMicPractice(harness);
  holdMidi(harness, 69);

  assert.equal(harness.document.getElementById('manual-notice').hidden, false);
  assert.match(harness.document.getElementById('practice-status').textContent, /自分で進むモードへ切り替えました/);
});

test('I: 弦を選ぶレベルでは、押した弦が画面と出題の両方へ届く', async () => {
  const harness = createHarness();
  const document = harness.document;
  const form = document.getElementById('settings-form');
  const field = document.getElementById('strings-field');

  assert.equal(field.hidden, false, 'レベル1では1本選ぶ');

  document.getElementById('level-select').value = '2';
  form.dispatch('change');
  assert.equal(field.hidden, false);
  assert.deepEqual(pressedStrings(document), ['A', 'E'], 'レベル5の既定はラ線とミ線');

  // 3本目を押すと、先に選んだ弦から外れて2本に保たれる。
  document.getElementById('string-chip-G').click();
  assert.deepEqual(pressedStrings(document), ['G', 'E']);
  // 選んでいる弦は押して外せる。外せないボタンにしない。
  document.getElementById('string-chip-E').click();
  assert.deepEqual(pressedStrings(document), ['G']);
  // ただし最後の1本は外さない。出題する弦が無くなるため。
  document.getElementById('string-chip-G').click();
  assert.deepEqual(pressedStrings(document), ['G']);
  document.getElementById('string-chip-E').click();
  assert.deepEqual(pressedStrings(document), ['G', 'E']);

  await startMicPractice(harness, {level:2});
  assert.deepEqual(harness.phraseArgs.at(-1).strings, ['G', 'E']);

  const legend = document.getElementById('string-legend');
  assert.equal(legend.hidden, false);
  assert.deepEqual(legend.children.map(item => item.textContent), ['● ソ線', '● ミ線']);
});

test('I: 弦を選べないレベルではチップを隠し、選択を出題へ持ち込まない', async () => {
  const harness = createHarness();
  const document = harness.document;
  const form = document.getElementById('settings-form');

  document.getElementById('level-select').value = '3';
  form.dispatch('change');
  assert.deepEqual(pressedStrings(document), ['A', 'E']);

  document.getElementById('level-select').value = '5';
  form.dispatch('change');
  assert.equal(document.getElementById('strings-field').hidden, true);

  await startMicPractice(harness, {level:5});
  assert.deepEqual(harness.phraseArgs.at(-1).strings, ['A', 'E'], '選択は保つが出題側が無視する');
});


test('確認音を待たずに問題へ進み、最初の発音を受け付ける', async () => {
  const h = createHarness();
  submit(h);
  await flushAsync();
  assert.equal(h.document.getElementById('practice-screen').hidden, false);
  holdMidi(h, 69);
  assert.equal(h.document.getElementById('companion').getAttribute('data-reaction'), 'happy');
  h.app.destroy();
});

test('タイマーは既定オフ、オンオフの選択を保存・復元する', async () => {
  const h = createHarness();
  assert.equal(h.document.getElementById('timer-select').value, 'off');
  h.document.getElementById('timer-chip-on').click();
  const settings = JSON.parse(h.storage.getItem('fuyomi')).settings;
  assert.equal(settings.timer, 'on');
  const restored = createHarness({storedSettings:settings});
  assert.equal(restored.document.getElementById('timer-chip-on').getAttribute('aria-pressed'), 'true');
  restored.document.getElementById('timer-chip-off').click();
  await startManualPractice(restored);
  assert.equal(restored.document.getElementById('practice-timer').hidden, true);
  skipWholeSession(restored);
  assert.equal(restored.document.getElementById('result-time').hidden, true);
  h.app.destroy(); restored.app.destroy();
});

test('タイマーはマイク準備待ちを含めず、終了で止まり再挑戦はゼロから', async () => {
  const pending = deferred();
  const h = createHarness({storedSettings:{timer:'on'},createMicrophone:()=>pending.promise});
  submit(h);
  h.clock.advance(5000);
  h.document.getElementById('without-mic-button').click();
  assert.equal(h.document.getElementById('practice-timer').textContent, '経過 0:00.0');
  h.clock.advance(1200);
  assert.equal(h.document.getElementById('practice-timer').textContent, '経過 0:01.2');
  for (let i=0; i<12; i++) {
    h.document.getElementById('manual-next-button').click();
    const atLastNote = h.document.getElementById('practice-timer').textContent;
    await flushAsync();
    h.clock.advance(i%4===3 ? 1000 : 300);
    if(i===11) {
      assert.equal(h.document.getElementById('result-time').textContent,
        atLastNote.replace('経過', 'クリアタイム'));
    }
  }
  const result = h.document.getElementById('result-time').textContent;
  h.clock.advance(10000);
  assert.equal(h.document.getElementById('result-time').textContent, result);
  assert.equal(h.clock.pendingTimers,0);
  h.document.getElementById('retry-button').click();
  h.document.getElementById('without-mic-button').click();
  assert.equal(h.document.getElementById('practice-timer').textContent,'経過 0:00.0');
  h.document.getElementById('quit-button').click();
  assert.equal(h.clock.pendingTimers,0);
  h.app.destroy();
});

test('とばした音があるとタイマー結果はクリアと呼ばない', async () => {
  const h = createHarness({storedSettings:{timer:'on'}});
  await startManualPractice(h);
  skipWholeSession(h);
  assert.match(h.document.getElementById('result-time').textContent,/^練習時間（とばした音あり）/);
  assert.equal(h.clock.pendingTimers,0);
  h.app.destroy();
});


test('新レベル1は弦を1本ずつ切り替えて出題へ渡す', async () => {
  for(const string of ['G','D','A','E']) {
    const h=createHarness();
    h.document.getElementById(`string-chip-${string}`).click();
    assert.deepEqual(pressedStrings(h.document),[string]);
    h.document.getElementById(`string-chip-${string}`).click();
    assert.deepEqual(pressedStrings(h.document),[string]);
    await startMicPractice(h);
    assert.deepEqual(h.phraseArgs.at(-1).strings,[string]);
    assert.equal(h.phraseArgs.at(-1).level,1);
    h.app.destroy();
  }
});

test('旧8段階の保存設定は対応する新段階と弦へ一度だけ移行する', () => {
  for(let level=1;level<=8;level++) {
    const h=createHarness({storedSettings:{level,strings:['G','D'],timer:'on',companion:'dog'}});
    assert.equal(h.document.getElementById('level-select').value,String(level<=4?1:level-3));
    if(level<=4) assert.deepEqual(pressedStrings(h.document),[['E','A','D','G'][level-1]]);
    h.document.getElementById('timer-chip-on').click();
    const settings=JSON.parse(h.storage.getItem('fuyomi')).settings;
    assert.equal(settings.levelScheme,2);
    assert.equal(settings.companion,'dog');
    const reopened=createHarness({storedSettings:settings});
    assert.equal(reopened.document.getElementById('level-select').value,String(settings.level));
    assert.deepEqual(pressedStrings(reopened.document),pressedStrings(h.document));
    reopened.app.destroy();h.app.destroy();
  }
});
