import { keySignature, midiToStaff } from './theory.js';

// 五線間隔を 1 とする座標系。SVGの原点は G4 の線上で、下向きを正とする。
// 輪郭ではなく一本の骨格にすることで、尾・上の弧・交差・G4中心の渦を形そのもので示す。
export const CLEF_PATH = [
  'M -0.34 3.40',
  'C 0.16 3.46 0.52 3.15 0.39 2.84',
  'C 0.32 2.67 0.15 2.57 0.03 2.60',
  'C -0.03 1.82 0.13 0.35 0.10 -1.00',
  'C 0.07 -2.11 -0.14 -3.18 0.08 -3.94',
  'C 0.20 -4.35 0.34 -4.58 0.22 -4.60',
  'C -0.36 -4.68 -0.91 -4.18 -1.06 -3.31',
  'C -1.20 -2.49 -0.72 -1.38 0.10 -1.00',
  'C -0.45 -0.70 -1.25 -0.20 -1.34 0.55',
  'C -1.39 0.74 -1.38 0.88 -1.30 0.94',
  'C -1.00 1.14 -0.42 1.10 0.12 0.88',
  'C 0.72 0.63 1.22 0.37 1.30 0.08',
  'C 1.18 -0.38 0.68 -0.72 0.12 -0.70',
  'C -0.38 -0.68 -0.62 -0.38 -0.62 -0.02',
  'C -0.62 0.31 -0.34 0.52 -0.03 0.50',
  'C 0.28 0.49 0.46 0.27 0.43 0.02',
  'C 0.40 -0.21 0.16 -0.33 -0.08 -0.27',
  'C -0.23 -0.21 -0.29 -0.06 -0.22 0.00',
  'C -0.15 0.05 -0.06 0.03 0.00 0.00',
].join(' ');

// 横画は右へ行くほど少し上がる。縦画より太くして、通常の♯の骨格に寄せる。
const SHARP_PATH = [
  'M 0.36 -1.72 L 0.68 -1.78 L 0.52 1.72 L 0.20 1.78 Z',
  'M 1.18 -1.72 L 1.50 -1.78 L 1.34 1.72 L 1.02 1.78 Z',
  'M 0.02 -0.83 L 1.70 -1.12 L 1.67 -0.55 L 0.00 -0.26 Z',
  'M 0.00 0.31 L 1.67 0.02 L 1.65 0.59 L 0.02 0.88 Z',
].join(' ');

// 2本の縦画を上下にずらし、中央を斜めの短い画でつないだ♮の輪郭。
const NATURAL_PATH = [
  'M 0.18 -1.64 L 0.50 -1.70 L 0.50 0.08 L 1.32 -0.24',
  'L 1.32 -1.14 L 1.64 -1.20 L 1.64 1.58 L 1.32 1.64',
  'L 1.32 0.27 L 0.50 0.59 L 0.50 1.12 L 0.18 1.18 Z',
].join(' ');

const THEMES = {
  light: {
    foreground: '#252A2E',
    staff: '#343A3F',
    highlight: '#CFE4F1',
    done: '#557763',
    miss: '#A36F48',
    hint: '#68727A',
  },
  dark: {
    foreground: '#E8ECEF',
    staff: '#C9D0D5',
    highlight: '#41657A',
    done: '#82A78D',
    miss: '#C09269',
    hint: '#AEB8BF',
  },
};

const STRING_LABELS = {
  G: 'ソ線',
  D: 'レ線',
  A: 'ラ線',
  E: 'ミ線',
};

const VALID_STATES = new Set(['todo', 'current', 'done', 'miss']);

const CLEF_SCALE = 1;
const CLEF_STROKE_WIDTH = 0.40;
const CLEF_PATH_TOP = -4.68;
const CLEF_PATH_BOTTOM = 3.46;
const NOTEHEAD_RX = 0.66;
const NOTEHEAD_RY = 0.38;
const NOTEHEAD_ANGLE = -20;
const STEM_LENGTH = 3.5;
const STEM_INSET = 0.10;
const STEM_X = 0.62;
const STEM_STROKE_WIDTH = 0.13;
const LEDGER_HALF_WIDTH = 0.96;
const LINE_STROKE_WIDTH = 1 / 8;
const ACCIDENTAL_METRICS = {
  sharp: { pathWidth: 1.70, scale: 0.76, top: -1.78, bottom: 1.78 },
  natural: { pathWidth: 1.64, scale: 0.78, top: -1.70, bottom: 1.64 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function number(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function noteAppearance(state, palette) {
  if (state === 'done') return { ink: palette.done, opacity: 1 };
  if (state === 'miss') return { ink: palette.miss, opacity: 0.92 };
  if (state === 'current') return { ink: palette.foreground, opacity: 1 };
  return { ink: palette.foreground, opacity: 0.55 };
}

function accidentalPath(accidental) {
  if (accidental === 'sharp') return SHARP_PATH;
  if (accidental === 'natural') return NATURAL_PATH;
  return null;
}

function renderAccidental({ accidental, role, index, diatonic, x, y, space, color }) {
  const path = accidentalPath(accidental);
  if (!path) return '';

  const metrics = ACCIDENTAL_METRICS[accidental];
  const scale = space * metrics.scale;
  const translateX = x - (metrics.pathWidth * scale) / 2;
  return `<path data-role="${role}" data-accidental="${accidental}" data-index="${index}" data-diatonic="${diatonic}" data-x="${number(x)}" data-y="${number(y)}" d="${path}" transform="translate(${number(translateX)} ${number(y)}) scale(${number(scale)})" fill="${color}"/>`;
}

function ledgerDiatonics(diatonic) {
  const positions = [];
  if (diatonic < 0) {
    for (let ledger = -2; ledger >= diatonic; ledger -= 2) positions.push(ledger);
  } else if (diatonic > 8) {
    for (let ledger = 10; ledger <= diatonic; ledger += 2) positions.push(ledger);
  }
  return positions;
}

function hintText(hint) {
  if (!hint) return '';
  const parts = [];
  if (hint.nameJa != null && hint.nameJa !== '') parts.push(String(hint.nameJa));

  const stringLabel = hint.stringId == null
    ? ''
    : (STRING_LABELS[hint.stringId] || String(hint.stringId));
  const finger = hint.finger == null ? '' : String(hint.finger);
  const fingering = [stringLabel, finger].filter(Boolean).join(' ');
  if (fingering) parts.push(fingering);
  return parts.join(' · ');
}

/**
 * ト音記号つきの五線譜を、DOMへ触れずSVG文字列として返す。
 * @param {{key:string, notes:Array, width:number, theme:'light'|'dark'}} options
 * @returns {string}
 */
export function renderStaff({ key, notes, width, theme } = {}) {
  const logicalWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : 400;
  const staffSpace = clamp(logicalWidth / 38, 8, 12);
  const palette = THEMES[theme] || THEMES.light;
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  const sourceNotes = Array.isArray(notes) ? notes : [];
  const signature = keySignature(key);
  const signatureItems = Array.isArray(signature) ? signature : [];

  const plottedNotes = sourceNotes.map((note, index) => {
    const staffNote = midiToStaff(note.midi, key);
    const state = VALID_STATES.has(note.state) ? note.state : 'todo';
    return { note, index, staffNote, state };
  });

  // 五線上端を0、五線間隔を1として、線幅と回転後の外接矩形まで含めて縦範囲を求める。
  // 概算値に余白を足す方式だと、低い音の♮だけが丸め誤差ではみ出すためである。
  const clefStrokeHalf = CLEF_STROKE_WIDTH * CLEF_SCALE / 2;
  const angle = Math.abs(NOTEHEAD_ANGLE) * Math.PI / 180;
  const noteheadYRadius = Math.hypot(
    NOTEHEAD_RX * Math.sin(angle),
    NOTEHEAD_RY * Math.cos(angle),
  );
  let contentTop = 3 + CLEF_PATH_TOP * CLEF_SCALE - clefStrokeHalf;
  let contentBottom = 3 + CLEF_PATH_BOTTOM * CLEF_SCALE + clefStrokeHalf;

  for (const item of signatureItems) {
    const y = 4 - item.diatonic / 2;
    const metrics = ACCIDENTAL_METRICS[item.accidental];
    contentTop = Math.min(contentTop, y + metrics.top * metrics.scale);
    contentBottom = Math.max(contentBottom, y + metrics.bottom * metrics.scale);
  }

  for (const { staffNote } of plottedNotes) {
    const y = 4 - staffNote.diatonic / 2;
    contentTop = Math.min(contentTop, y - noteheadYRadius);
    contentBottom = Math.max(contentBottom, y + noteheadYRadius);

    if (staffNote.diatonic < 4) {
      contentTop = Math.min(contentTop, y - STEM_LENGTH - STEM_STROKE_WIDTH / 2);
      contentBottom = Math.max(contentBottom, y + STEM_INSET + STEM_STROKE_WIDTH / 2);
    } else {
      contentTop = Math.min(contentTop, y - STEM_INSET - STEM_STROKE_WIDTH / 2);
      contentBottom = Math.max(contentBottom, y + STEM_LENGTH + STEM_STROKE_WIDTH / 2);
    }

    const accidentalMetrics = ACCIDENTAL_METRICS[staffNote.accidental];
    if (accidentalMetrics) {
      contentTop = Math.min(
        contentTop,
        y + accidentalMetrics.top * accidentalMetrics.scale,
      );
      contentBottom = Math.max(
        contentBottom,
        y + accidentalMetrics.bottom * accidentalMetrics.scale,
      );
    }

    for (const ledger of ledgerDiatonics(staffNote.diatonic)) {
      const ledgerY = 4 - ledger / 2;
      contentTop = Math.min(contentTop, ledgerY - LINE_STROKE_WIDTH / 2);
      contentBottom = Math.max(contentBottom, ledgerY + LINE_STROKE_WIDTH / 2);
    }
  }

  const topMargin = staffSpace * 0.72;
  const staffTop = topMargin - contentTop * staffSpace;
  const staffBottom = staffTop + 4 * staffSpace;
  const contentBottomY = staffTop + contentBottom * staffSpace;
  const hasHints = plottedNotes.some(({ note }) => hintText(note.hint));
  const hintY = contentBottomY + staffSpace * 1.28;
  const logicalHeight = hasHints
    ? hintY + staffSpace * 0.72
    : contentBottomY + staffSpace * 0.72;
  const yForDiatonic = (diatonic) => staffBottom - diatonic * staffSpace / 2;

  const staffLeft = staffSpace * 0.78;
  const staffRight = logicalWidth - staffSpace * 0.78;
  const clefX = staffLeft + staffSpace * 2.58;
  const clefY = yForDiatonic(2);
  const clefScale = staffSpace * CLEF_SCALE;

  const signatureStart = staffLeft + staffSpace * 5.45;
  // 375pxでも隣の♯との間に1px以上の空白を残し、アンチエイリアスで結合させない。
  const signatureStep = staffSpace * 1.48;
  const signatureEnd = signatureItems.length
    ? signatureStart + (signatureItems.length - 1) * signatureStep + staffSpace * 0.76
    : staffLeft + staffSpace * 4.78;
  const noteRegionLeft = signatureEnd + staffSpace * 1.12;
  const noteRegionWidth = Math.max(staffSpace * 3, staffRight - noteRegionLeft);
  const noteStep = sourceNotes.length ? noteRegionWidth / sourceNotes.length : 0;

  const staffLines = Array.from({ length: 5 }, (_, index) => {
    const y = staffTop + index * staffSpace;
    return `<path data-role="staff-line" data-line-index="${index}" data-y="${number(y)}" d="M ${number(staffLeft)} ${number(y)} H ${number(staffRight)}" fill="none" stroke="${palette.staff}" stroke-width="${number(staffSpace * LINE_STROKE_WIDTH)}" stroke-linecap="round"/>`;
  }).join('');

  const highlights = plottedNotes.map(({ index, state }) => {
    if (state !== 'current') return '';
    const x = noteRegionLeft + noteStep * (index + 0.5);
    const bandWidth = staffSpace * 2.55;
    const y = staffTop - staffSpace * 0.78;
    const height = staffSpace * 5.56;
    return `<rect data-role="current-highlight" data-note-index="${index}" x="${number(x - bandWidth / 2)}" y="${number(y)}" width="${number(bandWidth)}" height="${number(height)}" rx="${number(staffSpace * 0.72)}" fill="${palette.highlight}" opacity="${selectedTheme === 'dark' ? '0.42' : '0.62'}"/>`;
  }).join('');

  const clef = `<path data-role="clef" data-g-center-y="${number(clefY)}" d="${CLEF_PATH}" transform="translate(${number(clefX)} ${number(clefY)}) scale(${number(clefScale)})" fill="none" stroke="${palette.foreground}" stroke-width="${number(CLEF_STROKE_WIDTH)}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const keyAccidentals = signatureItems.map((item, index) => {
    const x = signatureStart + index * signatureStep;
    const y = yForDiatonic(item.diatonic);
    return renderAccidental({
      accidental: item.accidental,
      role: 'key-signature',
      index,
      diatonic: item.diatonic,
      x,
      y,
      space: staffSpace,
      color: palette.foreground,
    });
  }).join('');

  const renderedNotes = plottedNotes.map(({ note, index, staffNote, state }) => {
    const x = noteRegionLeft + noteStep * (index + 0.5);
    const y = yForDiatonic(staffNote.diatonic);
    const direction = staffNote.diatonic < 4 ? 'up' : 'down';
    const appearance = noteAppearance(state, palette);
    const stemX = direction === 'up'
      ? x + staffSpace * STEM_X
      : x - staffSpace * STEM_X;
    const stemStartY = direction === 'up'
      ? y + staffSpace * STEM_INSET
      : y - staffSpace * STEM_INSET;
    const stemEndY = direction === 'up'
      ? y - staffSpace * STEM_LENGTH
      : y + staffSpace * STEM_LENGTH;

    const ledgers = ledgerDiatonics(staffNote.diatonic).map((ledger, ledgerIndex) => {
      const ledgerY = yForDiatonic(ledger);
      return `<path data-role="ledger-line" data-note-index="${index}" data-ledger-index="${ledgerIndex}" data-diatonic="${ledger}" data-y="${number(ledgerY)}" d="M ${number(x - staffSpace * LEDGER_HALF_WIDTH)} ${number(ledgerY)} H ${number(x + staffSpace * LEDGER_HALF_WIDTH)}" fill="none" stroke="${appearance.ink}" stroke-width="${number(staffSpace * LINE_STROKE_WIDTH)}" stroke-linecap="round"/>`;
    }).join('');

    const noteAccidental = accidentalPath(staffNote.accidental)
      ? renderAccidental({
          accidental: staffNote.accidental,
          role: 'note-accidental',
          index,
          diatonic: staffNote.diatonic,
          x: x - staffSpace * 1.72,
          y,
          space: staffSpace,
          color: appearance.ink,
        })
      : '';

    const label = hintText(note.hint);
    const hint = label
      ? `<text data-role="hint" data-note-index="${index}" x="${number(x)}" y="${number(hintY)}" text-anchor="middle" fill="${appearance.ink}" opacity="0.84" font-family="-apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif" font-size="${number(staffSpace * 0.86)}" font-weight="500">${escapeXml(label)}</text>`
      : '';

    return [
      `<g data-role="note" data-index="${index}" data-midi="${escapeXml(note.midi)}" data-diatonic="${staffNote.diatonic}" data-state="${state}" data-x="${number(x)}" data-y="${number(y)}" data-ink="${appearance.ink}" opacity="${appearance.opacity}">`,
      ledgers,
      noteAccidental,
      `<ellipse data-role="notehead" data-note-index="${index}" cx="${number(x)}" cy="${number(y)}" rx="${number(staffSpace * NOTEHEAD_RX)}" ry="${number(staffSpace * NOTEHEAD_RY)}" transform="rotate(${NOTEHEAD_ANGLE} ${number(x)} ${number(y)})" fill="${appearance.ink}"/>`,
      `<path data-role="stem" data-note-index="${index}" data-direction="${direction}" data-y-start="${number(stemStartY)}" data-y-end="${number(stemEndY)}" d="M ${number(stemX)} ${number(stemStartY)} V ${number(stemEndY)}" fill="none" stroke="${appearance.ink}" stroke-width="${number(staffSpace * STEM_STROKE_WIDTH)}" stroke-linecap="round"/>`,
      hint,
      '</g>',
    ].join('');
  }).join('');

  return [
    `<svg width="100%" height="auto" viewBox="0 0 ${number(logicalWidth)} ${number(logicalHeight)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="ト音記号の五線譜" data-theme="${selectedTheme}" data-staff-space="${number(staffSpace)}" data-staff-top="${number(staffTop)}" data-staff-bottom="${number(staffBottom)}">`,
    highlights,
    staffLines,
    clef,
    keyAccidentals,
    renderedNotes,
    '</svg>',
  ].join('');
}
