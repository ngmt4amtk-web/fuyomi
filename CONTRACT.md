# API契約（これは仕様。勝手に変えない。変えたい理由があれば実装せず報告する）

すべて ES モジュール。ビルド工程なし。DOM に触るのは `js/app.js` だけ。
`theory.js` `phrase.js` は純関数のみ。`staff.js` は SVG を**文字列として返す**（node からテスト
できるようにするため。document を使わない）。

## js/theory.js（実装済み・検証済み）
```js
export const STRINGS  // [{id:'G',midi:55,label:'ソ線',color:'#3B6FE2'}, D:62, A:69, E:76]
export const KEYS     // {A:{jp:'イ長調',de:'A-dur',sharps:3}, D:2, G:1, C:0}
export function mtof(midi, a4)            // a4 既定 442
export function cents(freq, midi, a4)
export function fingering(openMidi, key)  // [{finger:0..4, midi}] 第1ポジション
export function glueOf(fg, finger)        // 半音で隣り合う指
export function positionsForMidi(midi, key) // [{stringId, finger}] 指の少ない順
export function noteNameJa(midi)          // 'ラ' 'ド♯'
export function midiToStaff(midi, key)
// → {letter, octave, diatonic, accidental:'none'|'sharp'|'natural'|'flat'}
//   diatonic は E4（ト音記号の五線の最下線）を 0 とする整数。F4=1 G4=2 A4=3 B4=4（第3線）
//   C5=5 D5=6 E5=7 F5=8（最上線）／ D4=-1 C4=-2（下第1加線）B3=-3 A3=-4（下第2加線）G3=-5
//   B5=11。臨時記号は「調号がその letter に与える高さ」と実際の midi を比べて決める。
export function keySignature(key)
// → [{letter, diatonic, accidental:'sharp'}]。検証済みの値:
//   G: F♯(8) / D: F♯(8) C♯(5) / A: F♯(8) C♯(5) G♯(9) / C: []
//   （出典照合済み: Texas A&M OER "Steps to Music Theory" 4.7 と VexFlow src/tables.ts）
```

## js/phrase.js
```js
export const LEVELS = {
  1:{label:'ラ線だけ',   strings:['A'],             maxFinger:3},
  2:{label:'ミ線だけ',   strings:['E'],             maxFinger:3},
  3:{label:'ラ線とミ線', strings:['A','E'],         maxFinger:3},
  4:{label:'レ線とソ線', strings:['D','G'],         maxFinger:3},
  5:{label:'4本ぜんぶ',  strings:['G','D','A','E'], maxFinger:3},
  6:{label:'4の指まで',  strings:['G','D','A','E'], maxFinger:4}
};
export function makePhrase({level, key, length=4, prev=null, rng=Math.random})
// → {notes:[{midi, stringId, finger}], key, level}
// ルール（テストで機械検証する）:
//  - 隣り合う音は原則2度（順次進行）。跳躍（3度以上）は1フレーズに最大1回、最大4度まで。
//  - 最後の音は安定音（その調の主音・第3音・第5音のいずれかの音名）。
//  - 同じ音の連続は2回まで。最低2種類の音高を含む。
//  - level.strings と maxFinger から作る運指の範囲内。
//  - prev と midi 列が完全一致しない。
//  - 同じ高さが2通りで取れるときは、直前の音と同じ弦になる取り方を優先（弦を無駄に跨がせない）。
//  - **多様性**: 異なる seed 100個で生成したフレーズのうち80種類以上が異なること。
//    （生成器が数パターンに収束してはいけない。ここは実測でテストする）
```

## js/pitch.js（ゆびいろからの移植・実装済み）
```js
export const TOL = { loose:{hold:225,spread:170,tol:90,conf:0.22}, mid:{300,130,70,0.30}, tight:{400,90,45,0.38} };
export const RESCUE_MAX_CENTS = 250;  // 救済の上限（decisions.md 採用3）
export function detect(x, sr)          // → {f, conf, rms}  YIN/CMND
export function median(a)
export async function createMic()      // → {read(), sampleRate, close(), ctx}
export function createHolder(cfg)      // → {feed(now,det), progress(), reset(), muteUntil(t)}
export function judgeNote({freq, targetMidi, candidates, cfg, a4})
// → {ok:true, cents} | {ok:false, heard:{midi,stringId,finger}, cents}
// 3段の救済。ただし第2段・第3段は |cents| <= RESCUE_MAX_CENTS のときだけ有効。
```

## js/staff.js（document を使わない・実装済み）
```js
export function renderStaff({key, notes, width, theme})
// notes = [{midi, state:'done'|'current'|'todo'|'miss', hint:{stringId,finger,nameJa}|null}]
// → SVG文字列。五線・ト音記号（自前パス）・調号・音符・符幹・加線・臨時記号・状態の描き分け。
export const CLEF_PATH
```

## js/app.js（これから作る）
上記を組み合わせる。DOM・localStorage（キー `fuyomi`）・URLクエリでの設定上書き・
音の確認画面・練習画面・結果画面・おてほんの音。詳細は `docs/decisions.md` に従う。

## tests/run.mjs
node 22 の標準機能だけ（`node:test` / `node:assert`）。`node tests/run.mjs` が exit 0 で緑。
