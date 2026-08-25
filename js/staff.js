import { keySignature, midiToStaff, stringColor } from './theory.js';

// 出典: Bravura 1.204 (Steinberg Media Technologies GmbH), SIL OFL 1.1。UPM 1000 の輪郭を x'=4x/1000, y'=-4y/1000 で五線間隔座標へ変換した。
export const CLEF_PATH = [
  'M1.88 -3.772C2.012 -3.772 2.12 -3.664 2.12 -3.444C2.12 -3.168 1.988 -2.912 1.676 -2.6',
  'C1.612 -2.536 1.516 -2.444 1.424 -2.364C1.396 -2.34 1.38 -2.344 1.372 -2.396',
  'C1.356 -2.5 1.348 -2.636 1.348 -2.764C1.348 -3.388 1.636 -3.772 1.88 -3.772Z',
  'M1.72 -0.412C1.712 -0.46 1.716 -0.472 1.764 -0.468C2.088 -0.44 2.356 -0.168 2.356 0.184',
  'C2.356 0.436 2.204 0.64 1.98 0.752C1.932 0.776 1.924 0.776 1.916 0.728Z',
  'M1.444 -1.048C1.456 -0.972 1.456 -0.976 1.384 -0.952C1.032 -0.832 0.804 -0.516 0.804 -0.176',
  'C0.804 0.184 0.992 0.44 1.264 0.532C1.296 0.544 1.344 0.556 1.372 0.556',
  'C1.404 0.556 1.42 0.536 1.42 0.512C1.42 0.484 1.388 0.472 1.36 0.46',
  'C1.192 0.388 1.072 0.216 1.072 0.032C1.072 -0.196 1.228 -0.368 1.472 -0.436',
  'C1.536 -0.452 1.544 -0.448 1.552 -0.404L1.752 0.788C1.76 0.832 1.756 0.832 1.696 0.844',
  'C1.632 0.856 1.552 0.864 1.472 0.864C0.772 0.864 0.32 0.476 0.32 -0.08',
  'C0.32 -0.316 0.36 -0.632 0.692 -1.008C0.932 -1.276 1.116 -1.424 1.304 -1.576',
  'C1.344 -1.608 1.352 -1.604 1.36 -1.56Z',
  'M1.504 -1.66C1.496 -1.708 1.504 -1.712 1.528 -1.736C1.592 -1.796 1.676 -1.88 1.752 -1.964',
  'C2.088 -2.332 2.288 -2.808 2.288 -3.26C2.288 -3.608 2.192 -3.952 2.028 -4.192',
  'C1.968 -4.28 1.864 -4.392 1.82 -4.392C1.764 -4.392 1.64 -4.288 1.56 -4.2',
  'C1.264 -3.872 1.168 -3.372 1.168 -2.956C1.168 -2.724 1.196 -2.464 1.224 -2.3',
  'C1.232 -2.252 1.236 -2.244 1.188 -2.204C0.932 -1.992 0.656 -1.748 0.448 -1.492',
  'C0.172 -1.148 0 -0.776 0 -0.348C0 0.348 0.476 1.008 1.456 1.008',
  'C1.548 1.008 1.652 1 1.732 0.984C1.776 0.976 1.784 0.972 1.792 1.02',
  'C1.84 1.288 1.9 1.636 1.9 1.824C1.9 2.416 1.5 2.488 1.264 2.488',
  'C1.048 2.488 0.944 2.424 0.944 2.372C0.944 2.344 0.98 2.332 1.072 2.304',
  'C1.196 2.268 1.34 2.16 1.34 1.928C1.34 1.708 1.2 1.52 0.956 1.52',
  'C0.688 1.52 0.528 1.732 0.528 1.98C0.528 2.24 0.684 2.632 1.288 2.632',
  'C1.556 2.632 2.076 2.512 2.076 1.832C2.076 1.604 2.004 1.224 1.96 0.976',
  'C1.952 0.928 1.956 0.932 2.012 0.908C2.416 0.748 2.684 0.408 2.684 -0.044',
  'C2.684 -0.556 2.308 -1.008 1.72 -1.008C1.616 -1.008 1.616 -1.008 1.604 -1.08Z',
].join('');

const SHARP_PATH = [
  'M0.672 0.18C0.648 0.26 0.46 0.34 0.368 0.34C0.344 0.34 0.324 0.332 0.32 0.32',
  'C0.312 0.304 0.308 0.216 0.308 0.12C0.308 -0.004 0.312 -0.144 0.32 -0.176',
  'C0.328 -0.244 0.512 -0.328 0.612 -0.328C0.64 -0.328 0.664 -0.32 0.672 -0.304',
  'C0.68 -0.284 0.688 -0.184 0.688 -0.076C0.688 0.032 0.68 0.144 0.672 0.18Z',
  'M0.948 -0.472C0.976 -0.484 0.996 -0.516 0.996 -0.54V-0.824C0.996 -0.844 0.984 -0.856 0.968 -0.856',
  'C0.96 -0.856 0.956 -0.856 0.948 -0.852C0.948 -0.852 0.868 -0.82 0.848 -0.816',
  'C0.82 -0.816 0.792 -0.836 0.792 -0.868V-1.356C0.792 -1.38 0.768 -1.4 0.736 -1.4',
  'C0.696 -1.4 0.672 -1.38 0.672 -1.356V-0.836C0.668 -0.796 0.656 -0.744 0.62 -0.72',
  'C0.572 -0.692 0.436 -0.636 0.368 -0.62C0.332 -0.62 0.32 -0.668 0.32 -0.7V-1.18',
  'C0.32 -1.204 0.292 -1.224 0.264 -1.224C0.224 -1.224 0.2 -1.204 0.2 -1.18V-0.64',
  'C0.2 -0.584 0.176 -0.544 0.152 -0.532C0.128 -0.52 0.048 -0.488 0.048 -0.488',
  'C0.02 -0.48 0 -0.448 0 -0.424V-0.14C0 -0.116 0.012 -0.104 0.032 -0.104',
  'C0.036 -0.104 0.044 -0.108 0.048 -0.108C0.048 -0.108 0.108 -0.132 0.136 -0.148',
  'C0.14 -0.148 0.144 -0.152 0.148 -0.152C0.176 -0.152 0.2 -0.112 0.2 -0.08V0.316',
  'C0.2 0.36 0.18 0.396 0.156 0.408C0.132 0.416 0.048 0.452 0.048 0.452',
  'C0.02 0.46 0 0.492 0 0.516V0.8C0 0.824 0.012 0.836 0.032 0.836',
  'C0.036 0.836 0.044 0.832 0.048 0.832C0.048 0.832 0.104 0.808 0.14 0.796',
  'C0.144 0.792 0.148 0.792 0.152 0.792C0.18 0.792 0.2 0.836 0.2 0.856V1.348',
  'C0.2 1.372 0.224 1.392 0.252 1.392C0.292 1.392 0.32 1.372 0.32 1.348V0.792',
  'C0.32 0.74 0.34 0.712 0.36 0.704L0.604 0.604C0.608 0.604 0.616 0.6 0.62 0.6',
  'C0.652 0.6 0.672 0.648 0.672 0.672V1.172C0.672 1.196 0.696 1.216 0.724 1.216',
  'C0.768 1.216 0.792 1.196 0.792 1.172V0.604C0.792 0.572 0.808 0.524 0.836 0.512',
  'C0.864 0.5 0.948 0.468 0.948 0.468C0.976 0.456 0.996 0.424 0.996 0.4V0.116',
  'C0.996 0.096 0.984 0.084 0.968 0.084C0.96 0.084 0.956 0.084 0.948 0.088L0.844 0.128',
  'C0.82 0.128 0.792 0.104 0.792 0.056V-0.316C0.792 -0.344 0.812 -0.42 0.844 -0.432Z',
].join('');

const NATURAL_PATH = [
  'M0.148 -0.156C0.148 -0.212 0.392 -0.316 0.488 -0.316C0.512 -0.316 0.524 -0.312 0.524 -0.296',
  'V0.116C0.524 0.188 0.296 0.28 0.196 0.28C0.168 0.28 0.148 0.272 0.148 0.256Z',
  'M0.564 -0.724C0.556 -0.724 0.552 -0.72 0.548 -0.72C0.548 -0.72 0.292 -0.628 0.188 -0.628',
  'C0.164 -0.628 0.148 -0.632 0.148 -0.648V-1.316C0.148 -1.344 0.124 -1.364 0.1 -1.364H0.048',
  'C0.02 -1.364 0 -1.344 0 -1.316V0.744C0 0.768 0.012 0.78 0.032 0.78',
  'C0.036 0.78 0.044 0.776 0.048 0.776C0.048 0.776 0.056 0.776 0.06 0.772',
  'C0.116 0.748 0.34 0.652 0.456 0.652C0.496 0.652 0.524 0.664 0.524 0.696V1.292',
  'C0.524 1.32 0.544 1.34 0.572 1.34H0.624C0.648 1.34 0.672 1.32 0.672 1.292V-0.716',
  'C0.672 -0.736 0.656 -0.748 0.64 -0.748C0.636 -0.748 0.628 -0.748 0.624 -0.744Z',
].join('');

const NOTEHEAD_PATH = 'M0.388 0.5C0.744 0.5 1.18 0.172 1.18 -0.168C1.18 -0.372 1.02 -0.5 0.792 -0.5C0.352 -0.5 0 -0.176 0 0.168C0 0.376 0.172 0.5 0.388 0.5Z';

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
// 弦の色と指番号をどこまで出すか。'off' は五線だけを読ませる元の見た目。
const VALID_MARKS = new Set(['both', 'color', 'off']);

const CLEF_METRICS = { left: 0, top: -4.392, right: 2.684, bottom: 2.632 };
const NOTEHEAD_METRICS = {
  left: 0,
  top: -0.5,
  right: 1.18,
  bottom: 0.5,
  // Bravura metadataのstemUpSE / stemDownNWをSVGの下向き座標へ反転した接続点。
  stemUp: { x: 1.18, y: -0.168 },
  stemDown: { x: 0, y: 0.168 },
};
const STEM_LENGTH = 3.5;
const STEM_STROKE_WIDTH = 0.13;
const LEDGER_HALF_WIDTH = 0.96;
const LINE_STROKE_WIDTH = 1 / 8;
const ACCIDENTAL_METRICS = {
  sharp: { pathWidth: 0.996, top: -1.4, bottom: 1.392 },
  natural: { pathWidth: 0.672, top: -1.364, bottom: 1.34 },
};
const NOTE_ACCIDENTAL_OFFSET = 1.72;
const CURRENT_HIGHLIGHT_HALF_WIDTH = 2.55 / 2;
const HINT_FONT_SIZE = 0.86;
const FINGER_FONT_SIZE = 0.95;
// 音符のいちばん高い描画物から指番号のベースラインまでの隙間（線間単位）。
const FINGER_GAP = 0.52;
// 数字の高さの見積もり。実フォントのcap heightより広く取り、上端が切れないようにする。
const FINGER_CAP_HEIGHT = FINGER_FONT_SIZE * 0.82;
const STANDARD_NOTE_SLOTS = 4;
// SVG座標を小数化しても規定の最小値を割らないための線間単位の安全幅。
const HORIZONTAL_ROUNDING_GUARD = 0.01;
const HORIZONTAL_LAYOUT = Object.freeze({
  leftMargin: 0.5,
  clefRightGap: 0.6 + HORIZONTAL_ROUNDING_GUARD,
  signatureGap: 0.15 + HORIZONTAL_ROUNDING_GUARD,
  signatureRightGap: 0.8 + HORIZONTAL_ROUNDING_GUARD,
  minimumNoteStep: 3 + HORIZONTAL_ROUNDING_GUARD,
  minimumDrawingGap: 0.5 + HORIZONTAL_ROUNDING_GUARD,
  rightMargin: 1.2 + HORIZONTAL_ROUNDING_GUARD,
});

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

/*
 * 弦の色を使うときは、色相が「どの弦か」を、濃さが「どこまで進んだか」を担う。
 * ただし外した直後だけは弦の色をやめる。ミ線の緑と合格の緑が同じ意味に見えるのを避ける。
 */
function noteAppearance(state, palette, stringInk) {
  if (!stringInk) {
    if (state === 'done') return { ink: palette.done, opacity: 1 };
    if (state === 'miss') return { ink: palette.miss, opacity: 0.92 };
    if (state === 'current') return { ink: palette.foreground, opacity: 1 };
    return { ink: palette.foreground, opacity: 0.55 };
  }

  if (state === 'done') return { ink: stringInk, opacity: 0.82 };
  if (state === 'miss') return { ink: palette.miss, opacity: 0.92 };
  if (state === 'current') return { ink: stringInk, opacity: 1 };
  return { ink: stringInk, opacity: 0.42 };
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
  const scale = space;
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

function noteHorizontalExtents(staffNote, label) {
  const halfHeadWidth = NOTEHEAD_METRICS.right / 2;
  const halfStemStroke = STEM_STROKE_WIDTH / 2;
  let drawingLeft = halfHeadWidth;
  let drawingRight = halfHeadWidth;

  if (staffNote.diatonic < 4) drawingRight += halfStemStroke;
  else drawingLeft += halfStemStroke;

  if (ledgerDiatonics(staffNote.diatonic).length) {
    const ledgerExtent = LEDGER_HALF_WIDTH + LINE_STROKE_WIDTH / 2;
    drawingLeft = Math.max(drawingLeft, ledgerExtent);
    drawingRight = Math.max(drawingRight, ledgerExtent);
  }

  const accidentalMetrics = ACCIDENTAL_METRICS[staffNote.accidental];
  if (accidentalMetrics) {
    drawingLeft = Math.max(
      drawingLeft,
      NOTE_ACCIDENTAL_OFFSET + accidentalMetrics.pathWidth / 2,
    );
  }

  /*
   * currentの帯を端の音でも欠けさせず、状態が進むたびに4音全体が左右へ動かないよう、
   * 帯の有無にかかわらず同じ外側寸法を予約する。ヒントは実フォントより広い1文字1emで見積もる。
   */
  const hintHalfWidth = label ? [...label].length * HINT_FONT_SIZE / 2 : 0;
  return {
    drawingLeft,
    drawingRight,
    outerLeft: Math.max(drawingLeft, CURRENT_HIGHLIGHT_HALF_WIDTH, hintHalfWidth),
    outerRight: Math.max(drawingRight, CURRENT_HIGHLIGHT_HALF_WIDTH, hintHalfWidth),
  };
}

function horizontalLayout(signatureItems, plottedNotes) {
  let cursor = HORIZONTAL_LAYOUT.leftMargin;
  const clefX = cursor;
  cursor += CLEF_METRICS.right - CLEF_METRICS.left;
  cursor += HORIZONTAL_LAYOUT.clefRightGap;

  const signatureXs = signatureItems.map((item, index) => {
    const metrics = ACCIDENTAL_METRICS[item.accidental];
    const center = cursor + metrics.pathWidth / 2;
    cursor += metrics.pathWidth;
    if (index < signatureItems.length - 1) cursor += HORIZONTAL_LAYOUT.signatureGap;
    return center;
  });
  if (signatureItems.length) cursor += HORIZONTAL_LAYOUT.signatureRightGap;

  const noteBoundary = cursor;
  const extents = plottedNotes.map(({ staffNote, note }) => (
    noteHorizontalExtents(staffNote, hintText(note.hint))
  ));
  let minimumStep = HORIZONTAL_LAYOUT.minimumNoteStep;
  for (let index = 1; index < extents.length; index += 1) {
    minimumStep = Math.max(
      minimumStep,
      extents[index - 1].drawingRight
        + extents[index].drawingLeft
        + HORIZONTAL_LAYOUT.minimumDrawingGap,
    );
  }

  /*
   * ふよみの1フレーズは4音なので、説明用の1〜2音でも4音譜と同じ縮尺を保つ。
   * 実際の音が少ない場合だけ予約した音域いっぱいへ均等配置し、中央に偏らせない。
   */
  const slotCount = Math.max(STANDARD_NOTE_SLOTS, plottedNotes.length);
  const noteSpan = minimumStep * (slotCount - 1);
  const firstExtent = extents[0]?.outerLeft ?? CURRENT_HIGHLIGHT_HALF_WIDTH;
  const lastExtent = extents.at(-1)?.outerRight ?? CURRENT_HIGHLIGHT_HALF_WIDTH;
  const firstX = noteBoundary + firstExtent;
  const actualStep = plottedNotes.length > 1
    ? noteSpan / (plottedNotes.length - 1)
    : 0;
  const noteXs = plottedNotes.length === 1
    ? [firstX + noteSpan / 2]
    : plottedNotes.map((_, index) => firstX + actualStep * index);
  const need = firstX + noteSpan + lastExtent + HORIZONTAL_LAYOUT.rightMargin;

  return { need, clefX, signatureXs, noteXs, noteStep: actualStep };
}

/**
 * ト音記号つきの五線譜を、DOMへ触れずSVG文字列として返す。
 * @param {{key:string, notes:Array, width:number, theme:'light'|'dark', marks:'both'|'color'|'off'}} options
 * @returns {string}
 */
export function renderStaff({ key, notes, width, theme, marks } = {}) {
  const logicalWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : 400;
  const palette = THEMES[theme] || THEMES.light;
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  const selectedMarks = VALID_MARKS.has(marks) ? marks : 'off';
  const colorByString = selectedMarks !== 'off';
  const showFinger = selectedMarks === 'both';
  const sourceNotes = Array.isArray(notes) ? notes : [];
  const signature = keySignature(key);
  const signatureItems = Array.isArray(signature) ? signature : [];

  const plottedNotes = sourceNotes.map((note, index) => {
    const staffNote = midiToStaff(note.midi, key);
    const state = VALID_STATES.has(note.state) ? note.state : 'todo';
    const stringInk = colorByString ? stringColor(note.stringId, selectedTheme) : null;
    return { note, index, staffNote, state, stringInk };
  });
  const layout = horizontalLayout(signatureItems, plottedNotes);
  // 横の必要量を線間単位で先に確定するため、左の記号が太っても4音の取り分を侵食しない。
  const staffSpace = logicalWidth / layout.need;

  // 五線上端を0、五線間隔を1として、Bravura輪郭の実寸まで含めて縦範囲を求める。
  let contentTop = 3 + CLEF_METRICS.top;
  let contentBottom = 3 + CLEF_METRICS.bottom;

  for (const item of signatureItems) {
    const y = 4 - item.diatonic / 2;
    const metrics = ACCIDENTAL_METRICS[item.accidental];
    contentTop = Math.min(contentTop, y + metrics.top);
    contentBottom = Math.max(contentBottom, y + metrics.bottom);
  }

  for (const entry of plottedNotes) {
    const { staffNote } = entry;
    const y = 4 - staffNote.diatonic / 2;
    let noteTop = y + NOTEHEAD_METRICS.top;
    // 指番号は符頭の中心線上に置くので、真上にある符頭と加線だけをよける。
    // 棒は符頭の右端から伸びるため、数字とは横にずれていて当たらない。
    let fingerAnchor = noteTop;
    contentBottom = Math.max(contentBottom, y + NOTEHEAD_METRICS.bottom);

    if (staffNote.diatonic < 4) {
      noteTop = Math.min(noteTop, y - STEM_LENGTH - STEM_STROKE_WIDTH / 2);
    } else {
      contentBottom = Math.max(contentBottom, y + STEM_LENGTH + STEM_STROKE_WIDTH / 2);
    }

    const accidentalMetrics = ACCIDENTAL_METRICS[staffNote.accidental];
    if (accidentalMetrics) {
      noteTop = Math.min(noteTop, y + accidentalMetrics.top);
      contentBottom = Math.max(
        contentBottom,
        y + accidentalMetrics.bottom,
      );
    }

    for (const ledger of ledgerDiatonics(staffNote.diatonic)) {
      const ledgerY = 4 - ledger / 2;
      noteTop = Math.min(noteTop, ledgerY - LINE_STROKE_WIDTH / 2);
      fingerAnchor = Math.min(fingerAnchor, ledgerY - LINE_STROKE_WIDTH / 2);
      contentBottom = Math.max(contentBottom, ledgerY + LINE_STROKE_WIDTH / 2);
    }

    entry.fingerAnchor = fingerAnchor;
    contentTop = Math.min(contentTop, noteTop);
  }

  if (showFinger) {
    for (const entry of plottedNotes) {
      if (!Number.isInteger(entry.note.finger)) continue;
      /*
       * 五線の上端（0）より上を最低線にする。音符の上端だけで決めると、五線の中に
       * ある音の数字が線と重なってどちらも読めなくなる。低い音はここで一列に揃い、
       * 上加線へ飛び出た音だけが自分の加線のぶんだけ持ち上がる。
       */
      entry.fingerLine = Math.min(entry.fingerAnchor, 0) - FINGER_GAP;
      contentTop = Math.min(contentTop, entry.fingerLine - FINGER_CAP_HEIGHT);
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

  const staffLeft = staffSpace * HORIZONTAL_LAYOUT.leftMargin;
  const staffRight = logicalWidth - staffSpace * HORIZONTAL_LAYOUT.leftMargin;
  const clefX = layout.clefX * staffSpace;
  const clefY = yForDiatonic(2);
  const clefScale = staffSpace;

  const staffLines = Array.from({ length: 5 }, (_, index) => {
    const y = staffTop + index * staffSpace;
    return `<path data-role="staff-line" data-line-index="${index}" data-y="${number(y)}" d="M ${number(staffLeft)} ${number(y)} H ${number(staffRight)}" fill="none" stroke="${palette.staff}" stroke-width="${number(staffSpace * LINE_STROKE_WIDTH)}" stroke-linecap="round"/>`;
  }).join('');

  const highlights = plottedNotes.map(({ index, state }) => {
    if (state !== 'current') return '';
    const x = layout.noteXs[index] * staffSpace;
    const bandWidth = staffSpace * 2.55;
    const y = staffTop - staffSpace * 0.78;
    const height = staffSpace * 5.56;
    return `<rect data-role="current-highlight" data-note-index="${index}" x="${number(x - bandWidth / 2)}" y="${number(y)}" width="${number(bandWidth)}" height="${number(height)}" rx="${number(staffSpace * 0.72)}" fill="${palette.highlight}" opacity="${selectedTheme === 'dark' ? '0.42' : '0.62'}"/>`;
  }).join('');

  const clef = `<path data-role="clef" data-g-center-y="${number(clefY)}" d="${CLEF_PATH}" transform="translate(${number(clefX)} ${number(clefY)}) scale(${number(clefScale)})" fill="${palette.foreground}"/>`;

  const keyAccidentals = signatureItems.map((item, index) => {
    const x = layout.signatureXs[index] * staffSpace;
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

  const renderedNotes = plottedNotes.map(({ note, index, staffNote, state, stringInk, fingerLine }) => {
    const x = layout.noteXs[index] * staffSpace;
    const y = yForDiatonic(staffNote.diatonic);
    const direction = staffNote.diatonic < 4 ? 'up' : 'down';
    const appearance = noteAppearance(state, palette, stringInk);
    const noteheadLeftX = x - staffSpace * NOTEHEAD_METRICS.right / 2;
    const stemAnchor = direction === 'up'
      ? NOTEHEAD_METRICS.stemUp
      : NOTEHEAD_METRICS.stemDown;
    const stemX = noteheadLeftX + staffSpace * stemAnchor.x;
    const stemStartY = y + staffSpace * stemAnchor.y;
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
          x: x - staffSpace * NOTE_ACCIDENTAL_OFFSET,
          y,
          space: staffSpace,
          color: appearance.ink,
        })
      : '';

    const label = hintText(note.hint);
    const hint = label
      ? `<text data-role="hint" data-note-index="${index}" x="${number(x)}" y="${number(hintY)}" text-anchor="middle" fill="${appearance.ink}" opacity="0.84" font-family="-apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif" font-size="${number(staffSpace * 0.86)}" font-weight="500">${escapeXml(label)}</text>`
      : '';

    const fingerY = fingerLine == null ? null : staffTop + fingerLine * staffSpace;
    const fingerMark = fingerY != null && Number.isInteger(note.finger)
      ? `<text data-role="finger" data-note-index="${index}" data-finger="${note.finger}" data-string="${escapeXml(note.stringId ?? '')}" x="${number(x)}" y="${number(fingerY)}" text-anchor="middle" fill="${appearance.ink}" font-family="-apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif" font-size="${number(staffSpace * FINGER_FONT_SIZE)}" font-weight="700">${escapeXml(note.finger)}</text>`
      : '';

    return [
      `<g data-role="note" data-index="${index}" data-midi="${escapeXml(note.midi)}" data-diatonic="${staffNote.diatonic}" data-state="${state}" data-string="${escapeXml(note.stringId ?? '')}" data-x="${number(x)}" data-y="${number(y)}" data-ink="${appearance.ink}" opacity="${appearance.opacity}">`,
      ledgers,
      noteAccidental,
      `<path data-role="notehead" data-note-index="${index}" data-x="${number(x)}" data-y="${number(y)}" d="${NOTEHEAD_PATH}" transform="translate(${number(noteheadLeftX)} ${number(y)}) scale(${number(staffSpace)})" fill="${appearance.ink}"/>`,
      `<path data-role="stem" data-note-index="${index}" data-direction="${direction}" data-y-start="${number(stemStartY)}" data-y-end="${number(stemEndY)}" d="M ${number(stemX)} ${number(stemStartY)} V ${number(stemEndY)}" fill="none" stroke="${appearance.ink}" stroke-width="${number(staffSpace * STEM_STROKE_WIDTH)}" stroke-linecap="round"/>`,
      fingerMark,
      hint,
      '</g>',
    ].join('');
  }).join('');

  return [
    `<svg width="100%" viewBox="0 0 ${number(logicalWidth)} ${number(logicalHeight)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="ト音記号の五線譜" data-theme="${selectedTheme}" data-marks="${selectedMarks}" data-staff-space="${number(staffSpace)}" data-staff-top="${number(staffTop)}" data-staff-bottom="${number(staffBottom)}" data-layout-need="${number(layout.need)}" data-note-step="${number(layout.noteStep * staffSpace)}">`,
    highlights,
    staffLines,
    clef,
    keyAccidentals,
    renderedNotes,
    '</svg>',
  ].join('');
}
