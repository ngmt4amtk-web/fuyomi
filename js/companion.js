// 表情を揃えた生成画像を1枚のシートにまとめ、正誤のたびの読み込み待ちをなくす。
// DOM操作はapp.jsが受け持つ。
export function companionStage(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 5 && n <= 8 ? n - 3 : 1;
}

export const COMPANIONS = ['fluffy', 'dino', 'dog'];

export function renderCompanion(level, happy = false, gloomy = false, kind = 'fluffy') {
  const selected = COMPANIONS.includes(kind) ? kind : 'fluffy';
  const stage = companionStage(level);
  const mood = gloomy ? 'gloomy' : happy ? 'happy' : 'idle';
  // 絵柄と表情は生成素材を使い、レベルの進行は周囲の飾りと星で共通に示す。
  return `<div class="companion-dog ${happy && !gloomy ? 'is-happy' : ''}" data-kind="${selected}" data-stage="${stage}" aria-hidden="true"><div class="dog-portrait" data-mood="${mood}"></div>${stage > 1 ? `<span class="dog-medal">${'★'.repeat(stage - 1)}</span>` : ''}</div>`;
}
