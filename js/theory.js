/*
 * colorは姉妹アプリ「ゆびいろ」と同じ弦の色。colorDarkは同じ色相のまま明度を上げた
 * ダーク背景用で、暗い地の上で青と緑が沈むのを防ぐためだけに置いている。
 */
export const STRINGS = [
  {id: 'G', midi: 55, label: 'ソ線', color: '#3B6FE2', colorDark: '#7FA6F5'},
  {id: 'D', midi: 62, label: 'レ線', color: '#E28B3B', colorDark: '#F0A868'},
  {id: 'A', midi: 69, label: 'ラ線', color: '#E23B3B', colorDark: '#F07272'},
  {id: 'E', midi: 76, label: 'ミ線', color: '#2FA84F', colorDark: '#63C97E'}
];

const STRING_BY_ID = new Map(STRINGS.map(string => [string.id, string]));

export function stringColor(stringId, theme) {
  const string = STRING_BY_ID.get(stringId);
  if (!string) return null;
  return theme === 'dark' ? string.colorDark : string.color;
}


export const KEYS = {
  A: {jp: 'イ長調', de: 'A-dur', sharps: 3},
  D: {jp: 'ニ長調', de: 'D-dur', sharps: 2},
  G: {jp: 'ト長調', de: 'G-dur', sharps: 1},
  C: {jp: 'ハ長調', de: 'C-dur', sharps: 0},
  F: {jp: 'ヘ長調', de: 'F-dur', sharps: 0, flats: 1},
  Bb: {jp: '変ロ長調', de: 'B-dur', sharps: 0, flats: 2},
  Eb: {jp: '変ホ長調', de: 'Es-dur', sharps: 0, flats: 3}
};

const TONIC = {C: 0, G: 7, D: 2, A: 9, F: 5, Bb: 10, Eb: 3};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A'];
const FLAT_LETTER_BY_PC = ['C','D','D','E','E','F','G','G','A','A','B','B'];
const NATURAL_PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const LETTER_INDEX = {C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6};
const LETTER_BY_PC = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const NOTE_NAME_JA = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];

const pitchClass = midi => ((midi % 12) + 12) % 12;
const scalePcs = key => MAJOR.map(interval => (TONIC[key] + interval) % 12);

export function mtof(midi, a4 = 442) {
  return a4 * (2 ** ((midi - 69) / 12));
}

export function cents(freq, midi, a4 = 442) {
  return 1200 * Math.log2(freq / mtof(midi, a4));
}

/*
 * 開放弦は調外でも必ず使い、押さえる指だけを長音階に合わせる。
 * +1〜+7半音の音階音が5つになる場合は低い候補を捨てて上から4つを取る。
 * ♭系では低い4の指も使うため、隣の開放弦と同じ高さとは限らない。
 */
export function fingering(openMidi, key) {
  const scale = scalePcs(key);
  const tones = [];

  for (let midi = openMidi + 1; midi <= openMidi + 7; midi++) {
    if (scale.includes(pitchClass(midi))) tones.push(midi);
  }

  return [
    {finger: 0, midi: openMidi},
    ...tones.slice(-4).map((midi, index) => ({finger: index + 1, midi}))
  ];
}

export function glueOf(fg, finger) {
  const index = fg.findIndex(position => position.finger === finger);
  const glued = [];

  if (index > 0 && fg[index].midi - fg[index - 1].midi === 1) {
    glued.push(fg[index - 1].finger);
  }
  if (index < fg.length - 1 && fg[index + 1].midi - fg[index].midi === 1) {
    glued.push(fg[index + 1].finger);
  }

  return glued;
}

export function positionsForMidi(midi, key) {
  return STRINGS.flatMap(string => fingering(string.midi, key)
    .filter(position => position.midi === midi)
    .map(position => ({stringId: string.id, finger: position.finger})))
    // 同じ高さは耳では区別できないため、代表として扱いやすい少ない指を先にする。
    .sort((a, b) => a.finger - b.finger);
}

export function noteNameJa(midi) {
  return NOTE_NAME_JA[pitchClass(midi)];
}

// 黒鍵の綴りを調に合わせ、調号と異なる自然音にはナチュラルを付ける。
export function midiToStaff(midi, key) {
  const pc = pitchClass(midi);
  const letter = (KEYS[key].flats ? FLAT_LETTER_BY_PC : LETTER_BY_PC)[pc];
  const octave = Math.floor(midi / 12) - 1;
  const naturalMidi = ((octave + 1) * 12) + NATURAL_PC[letter];
  const keyHasSharp = SHARP_ORDER.slice(0, KEYS[key].sharps).includes(letter);
  const keyHasFlat = FLAT_ORDER.slice(0, KEYS[key].flats || 0).includes(letter);
  const keyMidi = naturalMidi + (keyHasSharp ? 1 : keyHasFlat ? -1 : 0);

  let accidental;
  if (midi === keyMidi) {
    accidental = 'none';
  } else if ((keyHasSharp || keyHasFlat) && midi === naturalMidi) {
    accidental = 'natural';
  } else if (midi === naturalMidi + 1) {
    accidental = 'sharp';
  } else if (midi === naturalMidi - 1) {
    accidental = 'flat';
  } else {
    throw new RangeError('midi は整数の半音単位で指定する必要があります');
  }

  // E4の絶対7音階番号を引けば、E4=0かつ同じletterの1オクターブ差=7になる。
  const diatonic = (octave * 7) + LETTER_INDEX[letter] - ((4 * 7) + LETTER_INDEX.E);
  return {letter, octave, diatonic, accidental};
}

/*
 * ト音記号の♯は慣習的に F5, C5, G5, D5, A4, E5, B4 の順に置く。
 * Texas A&M OER「Steps to Music Theory」4.7の順序・F5起点と、VexFlow
 * src/tables.ts のト音記号配置 [0,1.5,-0.5,1,2.5,0.5,2] を照合した。
 * 第5線を0として下向きを正にした後者は、3番目のGが第5線直上のG5であることも示す。
 * これらをE4=0から上向きに数え直すと 8,5,9,6,3,7,4 になる。
 */
const TREBLE_SHARP_POSITIONS = [
  {letter: 'F', diatonic: 8, accidental: 'sharp'},
  {letter: 'C', diatonic: 5, accidental: 'sharp'},
  {letter: 'G', diatonic: 9, accidental: 'sharp'},
  {letter: 'D', diatonic: 6, accidental: 'sharp'},
  {letter: 'A', diatonic: 3, accidental: 'sharp'},
  {letter: 'E', diatonic: 7, accidental: 'sharp'},
  {letter: 'B', diatonic: 4, accidental: 'sharp'}
];

export function keySignature(key) {
  const positions = KEYS[key].flats ? [
    {letter:'B', diatonic:4, accidental:'flat'},
    {letter:'E', diatonic:7, accidental:'flat'},
    {letter:'A', diatonic:3, accidental:'flat'}
  ].slice(0, KEYS[key].flats) : TREBLE_SHARP_POSITIONS.slice(0, KEYS[key].sharps);
  return positions
    .map(position => ({...position}));
}