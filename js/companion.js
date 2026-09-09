// 表情を揃えた生成画像を1枚のシートにまとめ、正誤のたびの読み込み待ちをなくす。
// DOM操作はapp.jsが受け持つ。
export function companionStage(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
}

export const COMPANIONS = ['fluffy', 'dino', 'dog'];

export function renderCompanion(level, happy = false, gloomy = false, kind = 'fluffy') {
  const selected = COMPANIONS.includes(kind) ? kind : 'fluffy';
  const stage = companionStage(level);
  const mood = gloomy ? 'gloomy' : happy ? 'happy' : 'idle';
  // 各段階に描き下ろした3表情を使う。枠や星で段階の絵を代用しない。
  return `<div class="companion-dog ${gloomy ? 'is-gloomy' : happy ? 'is-happy' : ''}" data-kind="${selected}" data-stage="${stage}" aria-hidden="true"><div class="dog-portrait" data-mood="${mood}"></div>${happy && !gloomy ? `<span class="reaction-particles">${Array.from({length: stage + 4}, (_, i) => `<i style="--i:${i};--count:${stage + 4}"></i>`).join('')}</span>` : ''}</div>`;
}
