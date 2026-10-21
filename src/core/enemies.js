// Enemy definitions. ai(e, c, rng) returns the next move id; moves[].act(c, e) performs it.
// intent kinds: attack, defend, buff, debuff, attack_debuff, attack_defend, defend_buff, summon, charge, sleep
export const ENEMIES = {};
const def = (id, o) => { ENEMIES[id] = { id, ...o }; };

const last = (e, n = 1) => e.history[e.history.length - n];
const lastTwo = (e, m) => last(e) === m && last(e, 2) === m;

// ---------------------------------------------------------------- normal: early
def('mossguard', {
  name: '苔茸の番人', hp: [44, 48], sprite: 'mossguard', size: 1.0,
  moves: {
    tackle: { name: '体当たり', intent: 'attack', dmg: 11, async act(c, e) { await c.enemyAttack(e, 11); } },
    spores: { name: '胞子散布', intent: 'attack_debuff', dmg: 5, async act(c, e) { await c.enemyAttack(e, 5); await c.apply(c.player, 'weak', 2, { source: e }); } },
    root: { name: '根を張る', intent: 'defend_buff', async act(c, e) { await c.enemyBlock(e, 7); await c.apply(e, 'strength', 2, { source: e }); } },
  },
  ai(e, c, r) {
    if (e.history.length === 0) return r.chance(0.6) ? 'spores' : 'tackle';
    if (last(e) !== 'root' && last(e, 2) !== 'root' && r.chance(0.35)) return 'root';
    if (last(e) === 'spores') return 'tackle';
    if (lastTwo(e, 'tackle')) return 'spores';
    return r.chance(0.55) ? 'tackle' : 'spores';
  },
});

def('ash_wolf', {
  name: '灰狼', hp: [30, 34], sprite: 'wolf', size: 1.0,
  moves: {
    bite: { name: '噛みつき', intent: 'attack', dmg: 4, hits: 2, async act(c, e) { await c.enemyAttack(e, 4, 2); } },
    howl: { name: '遠吠え', intent: 'buff', async act(c, e) { for (const w of c.livingEnemies()) if (w.def.id === 'ash_wolf') await c.apply(w, 'strength', 2, { source: e }); } },
    pounce: { name: '飛びかかり', intent: 'attack', dmg: 10, async act(c, e) { await c.enemyAttack(e, 10); } },
  },
  ai(e, c, r) {
    if (e.history.length === 0) return r.chance(0.4) ? 'howl' : 'bite';
    if (last(e) === 'howl') return r.chance(0.5) ? 'pounce' : 'bite';
    const opts = [['bite', 40], ['pounce', 40], ['howl', e.history.filter((h) => h === 'howl').length < 2 ? 20 : 0]];
    const pick = r.weighted(opts.filter(([m]) => m !== last(e)));
    return pick;
  },
});

def('shadow_bat', {
  name: '影蝙蝠', hp: [12, 15], sprite: 'bat', size: 0.75, flying: true,
  moves: {
    leech: { name: '吸血', intent: 'attack', dmg: 4, async act(c, e) { const d = await c.enemyAttack(e, 4); if (d > 0) await c.healEnemy(e, 2); } },
    screech: { name: '超音波', intent: 'debuff', async act(c, e) { await c.apply(c.player, 'vulnerable', 1, { source: e }); } },
  },
  ai(e, c, r) {
    if (last(e) === 'screech') return 'leech';
    if (lastTwo(e, 'leech')) return 'screech';
    return r.chance(0.7) ? 'leech' : 'screech';
  },
});

def('mire_slime', {
  name: '泥沼スライム', hp: [52, 56], sprite: 'slime', size: 1.05,
  moves: {
    slam: { name: '叩きつけ', intent: 'attack', dmg: 12, async act(c, e) { await c.enemyAttack(e, 12); } },
    ooze: { name: '粘液', intent: 'attack_debuff', dmg: 6, async act(c, e) { await c.enemyAttack(e, 6); await c.addCards('mud', 'discard', 2, e); } },
  },
  ai(e, c, r) {
    if (e.history.length === 0) return 'ooze';
    if (lastTwo(e, 'slam')) return 'ooze';
    if (last(e) === 'ooze') return 'slam';
    return r.chance(0.6) ? 'slam' : 'ooze';
  },
});

// ---------------------------------------------------------------- normal: later
def('rusted_sentinel', {
  name: '錆びた甲冑', hp: [56, 60], sprite: 'armor', size: 1.15, startStatuses: { plated: 4 },
  moves: {
    guard: { name: '構え', intent: 'defend_buff', async act(c, e) { await c.enemyBlock(e, 10); await c.apply(e, 'plated', 2, { source: e }); } },
    slash: { name: '斬撃', intent: 'attack', dmg: 12, async act(c, e) { await c.enemyAttack(e, 12); } },
    cleave: { name: '大振り', intent: 'attack', dmg: 22, heavy: true, async act(c, e) { await c.enemyAttack(e, 22, 1, { heavy: true }); } },
  },
  ai(e) {
    const cycle = ['guard', 'slash', 'cleave'];
    const i = e.history.length % 3;
    return cycle[i];
  },
});

def('briar', {
  name: '茨の精', hp: [46, 50], sprite: 'briar', size: 1.05, startStatuses: { thorns: 2 },
  moves: {
    entangle: { name: '絡みつき', intent: 'attack_debuff', dmg: 7, async act(c, e) { await c.enemyAttack(e, 7); await c.apply(c.player, 'weak', 1, { source: e }); } },
    grow: { name: '棘の成長', intent: 'defend_buff', async act(c, e) { await c.enemyBlock(e, 8); await c.apply(e, 'thorns', 2, { source: e }); } },
    pierce: { name: '刺突', intent: 'attack', dmg: 11, async act(c, e) { await c.enemyAttack(e, 11); } },
  },
  ai(e, c, r) {
    if (e.history.length === 0) return 'entangle';
    if (last(e) !== 'grow' && r.chance(0.3)) return 'grow';
    return last(e) === 'pierce' ? 'entangle' : r.chance(0.6) ? 'pierce' : 'entangle';
  },
});

def('ash_acolyte', {
  name: '灰の巫女', hp: [32, 36], sprite: 'acolyte', size: 0.95,
  moves: {
    mend: { name: '癒しの灯', intent: 'buff', async act(c, e) {
      const t = c.livingEnemies().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      await c.healEnemy(t, 12);
    } },
    ward: { name: '守護', intent: 'defend', async act(c, e) { for (const a of c.livingEnemies()) await c.enemyBlock(a, 7); } },
    ember: { name: '灰の礫', intent: 'attack_debuff', dmg: 6, async act(c, e) { await c.enemyAttack(e, 6); await c.apply(c.player, 'burn', 2, { source: e }); } },
  },
  ai(e, c, r) {
    const hurt = c.livingEnemies().some((a) => a.maxHp - a.hp >= 12);
    if (hurt && last(e) !== 'mend' && r.chance(0.6)) return 'mend';
    if (last(e) === 'ember') return r.chance(0.5) ? 'ward' : 'ember';
    return 'ember';
  },
});

// ---------------------------------------------------------------- elites
def('bone_knight', {
  name: '骸骨騎士', hp: [74, 78], sprite: 'boneknight', size: 1.3, elite: true, startStatuses: { undying: 1 },
  moves: {
    flurry: { name: '連斬', intent: 'attack', dmg: 4, hits: 3, async act(c, e) { await c.enemyAttack(e, 4, 3); } },
    behead: { name: '断頭', intent: 'attack', dmg: 16, heavy: true, async act(c, e) { await c.enemyAttack(e, 16, 1, { heavy: true }); } },
    dread: { name: '戦慄', intent: 'defend_buff', async act(c, e) { await c.enemyBlock(e, 10); await c.apply(e, 'strength', 3, { source: e }); } },
  },
  ai(e, c, r) {
    if (e.history.length === 0) return 'flurry';
    if (last(e) === 'flurry') return 'behead';
    if (last(e) === 'behead') return r.chance(0.6) ? 'dread' : 'flurry';
    return 'flurry';
  },
});

def('candelabra', {
  name: '呪いの燭台', hp: [70, 74], sprite: 'candelabra', size: 1.35, elite: true,
  moves: {
    call: { name: '呼び火', intent: 'summon', async act(c, e) {
      const n = 2 - c.livingEnemies().filter((x) => x.def.id === 'candle_flame').length;
      for (let i = 0; i < n; i++) await c.summon('candle_flame', e);
    } },
    soot: { name: '煤の嵐', intent: 'attack_debuff', dmg: 8, async act(c, e) { await c.enemyAttack(e, 8); await c.addCards('ash', 'draw', 2, e); } },
    blaze: { name: '業炎', intent: 'attack', dmg: 13, async act(c, e) { await c.enemyAttack(e, 13, 1, { element: 'fire' }); } },
  },
  ai(e, c, r) {
    const flames = c.livingEnemies().filter((x) => x.def.id === 'candle_flame').length;
    if (flames === 0 && last(e) !== 'call') return 'call';
    if (last(e) === 'soot') return 'blaze';
    if (last(e) === 'blaze') return 'soot';
    return r.chance(0.5) ? 'soot' : 'blaze';
  },
  onDeath(c, e) { return c.livingEnemies().filter((x) => x.def.id === 'candle_flame'); },
  initialSummons: ['candle_flame', 'candle_flame'],
});
def('candle_flame', {
  name: '燭火', hp: [12, 14], sprite: 'flame', size: 0.7, flying: true, minion: true,
  moves: {
    flicker: { name: '揺らめき', intent: 'attack_debuff', dmg: 3, async act(c, e) { await c.enemyAttack(e, 3, 1, { element: 'fire' }); await c.apply(c.player, 'burn', 2, { source: e }); } },
    flare: { name: '燃え上がり', intent: 'attack', dmg: 7, async act(c, e) { await c.enemyAttack(e, 7, 1, { element: 'fire' }); } },
  },
  ai(e) { return last(e) === 'flicker' ? 'flare' : 'flicker'; },
});

def('gargoyle', {
  name: '石像の魔像', hp: [80, 84], sprite: 'gargoyle', size: 1.35, elite: true, flying: true,
  moves: {
    gaze: { name: '凝視', intent: 'attack_debuff', dmg: 8, async act(c, e) { await c.enemyAttack(e, 8); await c.apply(c.player, 'vulnerable', 2, { source: e }); } },
    dive: { name: '急降下', intent: 'attack', dmg: 18, heavy: true, async act(c, e) { await c.enemyAttack(e, 18, 1, { heavy: true }); } },
    petrify: { name: '石の構え', intent: 'defend_buff', async act(c, e) { await c.enemyBlock(e, 12); await c.apply(e, 'stoneskin', 1, { source: e }); } },
  },
  ai(e) { return ['gaze', 'dive', 'petrify'][e.history.length % 3]; },
});

// ---------------------------------------------------------------- boss
def('lantern_king', {
  name: '虚ろの灯王', hp: [200, 200], sprite: 'boss', size: 2.0, boss: true,
  moves: {
    summon: { name: '呼び声', intent: 'summon', async act(c, e) {
      const n = 2 - c.livingEnemies().filter((x) => x.def.id === 'wisp').length;
      for (let i = 0; i < n; i++) await c.summon('wisp', e);
    } },
    black_flame: { name: '黒炎', intent: 'attack_debuff', dmg: 7, async act(c, e) { await c.enemyAttack(e, 7, 1, { element: 'dark' }); await c.apply(c.player, 'burn', 4, { source: e }); } },
    drain: { name: '魂喰らい', intent: 'attack_debuff', dmg: 12, async act(c, e) {
      await c.enemyAttack(e, 12, 1, { element: 'dark' });
      const n = Math.min(3, c.player.statuses.radiance || 0);
      if (n > 0) await c.apply(c.player, 'radiance', -n, { source: e });
      await c.enemyBlock(e, 4 * n);
    } },
    omen: { name: '終焉の兆し', intent: 'charge', async act(c, e) { await c.enemyBlock(e, 12); } },
    end: { name: '終焉の灯', intent: 'attack', dmg: 30, heavy: true, ultimate: true, async act(c, e) { await c.enemyAttack(e, 30, 1, { heavy: true, ultimate: true }); } },
    // phase 2
    awaken: { name: '覚醒', intent: 'buff', async act(c, e) { await c.apply(e, 'strength', 2, { source: e }); await c.enemyBlock(e, 15); } },
    eclipse: { name: '蝕', intent: 'attack', dmg: 6, hits: 3, async act(c, e) { await c.enemyAttack(e, 6, 3, { element: 'dark' }); } },
    hellfire: { name: '冥炎', intent: 'attack_debuff', dmg: 10, async act(c, e) { await c.enemyAttack(e, 10, 1, { element: 'dark' }); await c.apply(c.player, 'burn', 5, { source: e }); await c.addCards('ash', 'discard', 1, e); } },
    omen2: { name: '滅びの兆し', intent: 'charge', async act(c, e) { await c.enemyBlock(e, 18); } },
    end2: { name: '永夜の灯', intent: 'attack', dmg: 36, heavy: true, ultimate: true, async act(c, e) { await c.enemyAttack(e, 36, 1, { heavy: true, ultimate: true }); } },
  },
  ai(e, c, r) {
    const wisps = c.livingEnemies().filter((x) => x.def.id === 'wisp').length;
    if (e.phase === 2) {
      if (e.history[e.history.length - 1] === 'omen2') return 'end2';
      if (e.phaseTurn === 0) return 'awaken';
      const since = e.history.length - e.history.lastIndexOf('end2');
      if (e.history.lastIndexOf('end2') === -1 ? e.phaseTurn >= 3 : since >= 4) return 'omen2';
      if (wisps === 0 && last(e) !== 'summon' && r.chance(0.4)) return 'summon';
      return last(e) === 'eclipse' ? 'hellfire' : last(e) === 'hellfire' ? 'eclipse' : r.chance(0.5) ? 'eclipse' : 'hellfire';
    }
    const h = e.history.length;
    if (h === 0) return 'summon';
    if (last(e) === 'omen') return 'end';
    if (h === 3 || (h > 4 && (h - 3) % 4 === 0)) return 'omen';
    if (wisps === 0 && last(e) !== 'summon' && r.chance(0.5)) return 'summon';
    if (last(e) === 'black_flame') return 'drain';
    if (last(e) === 'drain') return 'black_flame';
    return r.chance(0.5) ? 'black_flame' : 'drain';
  },
  phaseAt: 0.5,
});
def('wisp', {
  name: '灯魂', hp: [12, 14], sprite: 'wisp', size: 0.7, flying: true, minion: true,
  moves: {
    touch: { name: '冷たい手', intent: 'attack', dmg: 5, async act(c, e) { await c.enemyAttack(e, 5, 1, { element: 'dark' }); } },
    sap: { name: '吸精', intent: 'debuff', async act(c, e) { await c.apply(c.player, 'weak', 1, { source: e }); } },
  },
  ai(e, c, r) { return last(e) === 'sap' ? 'touch' : r.chance(0.75) ? 'touch' : 'sap'; },
});

export const ENCOUNTERS = {
  easy: [['mossguard'], ['mire_slime'], ['shadow_bat', 'shadow_bat', 'shadow_bat'], ['ash_wolf', 'shadow_bat']],
  hard: [['rusted_sentinel'], ['briar'], ['mossguard', 'ash_acolyte'], ['ash_wolf', 'ash_wolf'], ['mire_slime', 'shadow_bat', 'shadow_bat'], ['briar', 'shadow_bat']],
  elite: [['bone_knight'], ['candelabra'], ['gargoyle']],
  boss: [['lantern_king']],
};
