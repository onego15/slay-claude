// Card definitions. Text tokens: {D}=damage, {B}=block, {M}/{N}=magic numbers, {H}=hits.
// play(c, s, t): c=combat API, s=resolved stats (upgrade applied), t=target enemy (or null).

export const CARDS = {};
const def = (id, o) => {
  CARDS[id] = { id, hits: 1, exhaust: false, target: 'self', ...o };
};

// ---------------------------------------------------------------- starter
def('strike', {
  name: '斬撃', type: 'attack', rarity: 'starter', cost: 1, target: 'enemy',
  dmg: 6, up: { dmg: 9 }, text: '{D}ダメージを与える。', art: 'sword', tags: ['strike'],
  async play(c, s, t) { await c.attack(t, s.dmg); },
});
def('defend', {
  name: '防御', type: 'skill', rarity: 'starter', cost: 1,
  blk: 5, up: { blk: 8 }, text: 'ブロックを{B}得る。', art: 'shield',
  async play(c, s) { await c.gainBlock(s.blk); },
});
def('lantern_edge', {
  name: '灯の刃', type: 'attack', rarity: 'starter', cost: 1, target: 'enemy',
  dmg: 7, mag: 1, up: { dmg: 9, mag: 2 }, text: '{D}ダメージを与える。\n輝きを{M}得る。', art: 'lanternblade',
  async play(c, s, t) { await c.attack(t, s.dmg); await c.radiance(s.mag); },
});

// ---------------------------------------------------------------- common attacks
def('twin_fang', {
  name: '双牙', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
  dmg: 4, hits: 2, up: { dmg: 5 }, text: '{D}ダメージを{H}回与える。', art: 'twinblade',
  async play(c, s, t) { await c.attack(t, s.dmg, s.hits); },
});
def('flint', {
  name: '火打ち', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
  dmg: 5, mag: 3, up: { dmg: 6, mag: 4 }, text: '{D}ダメージを与える。\n灼熱{M}を与える。', art: 'flint',
  async play(c, s, t) { await c.attack(t, s.dmg); await c.apply(t, 'burn', s.mag); },
});
def('shield_bash', {
  name: '盾撃', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
  up: { cost: 0 }, text: '現在のブロックに等しいダメージを与える。', art: 'shieldbash',
  calcDmg: (c) => c.player.block, async play(c, s, t) { await c.attack(t, c.player.block); },
});
def('sweep', {
  name: '薙ぎ払い', type: 'attack', rarity: 'common', cost: 1, target: 'all',
  dmg: 7, up: { dmg: 10 }, text: '敵全体に{D}ダメージを与える。', art: 'sweep',
  async play(c, s) { await c.attack('all', s.dmg); },
});
def('rockbreaker', {
  name: '砕岩撃', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
  dmg: 12, mag: 2, up: { dmg: 15, mag: 3 }, text: '{D}ダメージを与える。\n脆弱{M}を与える。', art: 'hammer',
  async play(c, s, t) { await c.attack(t, s.dmg, 1, { heavy: true }); await c.apply(t, 'vulnerable', s.mag); },
});
def('light_bolt', {
  name: '光弾', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
  dmg: 3, mag: 1, up: { dmg: 5 }, text: '{D}ダメージを与える。\n輝きを{M}得る。', art: 'lightorb',
  async play(c, s, t) { await c.attack(t, s.dmg, 1, { element: 'light' }); await c.radiance(s.mag); },
});
def('chain_flame', {
  name: '炎鎖', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
  dmg: 6, up: { dmg: 8 }, text: '{D}ダメージを与える。\n対象が灼熱状態なら、もう一度与える。', art: 'chain',
  async play(c, s, t) {
    const burning = (t.statuses.burn || 0) > 0;
    await c.attack(t, s.dmg, burning ? 2 : 1, { element: 'fire' });
  },
});
def('quick_cut', {
  name: '抜き打ち', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
  dmg: 4, mag: 1, up: { dmg: 6 }, text: '{D}ダメージを与える。\nカードを{M}枚引く。', art: 'dagger',
  async play(c, s, t) { await c.attack(t, s.dmg); await c.draw(s.mag); },
});

// ---------------------------------------------------------------- common skills
def('parry', {
  name: '見切り', type: 'skill', rarity: 'common', cost: 1,
  blk: 7, mag: 1, up: { blk: 10 }, text: 'ブロックを{B}得る。\nカードを{M}枚引く。', art: 'parry',
  async play(c, s) { await c.gainBlock(s.blk); await c.draw(s.mag); },
});
def('iron_wall', {
  name: '城壁', type: 'skill', rarity: 'common', cost: 2,
  blk: 14, up: { blk: 18 }, text: 'ブロックを{B}得る。', art: 'wall',
  async play(c, s) { await c.gainBlock(s.blk); },
});
def('lantern_ward', {
  name: '灯の加護', type: 'skill', rarity: 'common', cost: 1,
  blk: 6, mag: 1, up: { blk: 9 }, text: 'ブロックを{B}得る。\n輝きを{M}得る。', art: 'ward',
  async play(c, s) { await c.gainBlock(s.blk); await c.radiance(s.mag); },
});
def('prayer', {
  name: '祈り', type: 'skill', rarity: 'common', cost: 0, exhaust: true,
  mag: 2, up: { mag: 3 }, text: '輝きを{M}得る。\n焼却。', art: 'prayer',
  async play(c, s) { await c.radiance(s.mag); },
});
def('oil_flask', {
  name: '油撒き', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
  mag: 6, up: { mag: 9 }, text: '灼熱{M}を与える。', art: 'oil',
  async play(c, s, t) { await c.apply(t, 'burn', s.mag); },
});
def('insight', {
  name: '閃き', type: 'skill', rarity: 'common', cost: 1,
  mag: 2, up: { mag: 3 }, text: 'カードを{M}枚引く。', art: 'eye',
  async play(c, s) { await c.draw(s.mag); },
});

// ---------------------------------------------------------------- uncommon
def('flash_slash', {
  name: '閃光斬', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
  dmg: 4, mag: 3, up: { dmg: 6, mag: 4 }, text: '{D}ダメージを与える。\n（輝き1つにつき+{M}）\n輝きを全て消費する。', art: 'flash',
  calcDmg: (c, s) => s.dmg + s.mag * (c.player.statuses.radiance || 0),
  async play(c, s, t) {
    const n = c.player.statuses.radiance || 0;
    await c.spendRadiance();
    await c.attack(t, s.dmg + s.mag * n, 1, { element: 'light', big: n >= 5 });
  },
});
def('flame_dance', {
  name: '焔の舞', type: 'attack', rarity: 'uncommon', cost: 1, target: 'all',
  dmg: 3, mag: 3, up: { dmg: 4, mag: 4 }, text: '敵全体に{D}ダメージと\n灼熱{M}を与える。', art: 'flamedance',
  async play(c, s) { await c.attack('all', s.dmg, 1, { element: 'fire' }); await c.apply('all', 'burn', s.mag); },
});
def('ashen_strike', {
  name: '灰燼撃', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
  dmg: 7, mag: 3, up: { dmg: 10, mag: 4 }, text: '{D}ダメージを与える。\n（焼却したカード1枚につき+{M}）', art: 'ashblade',
  calcDmg: (c, s) => s.dmg + s.mag * c.exhaust.length,
  async play(c, s, t) { await c.attack(t, s.dmg + s.mag * c.exhaust.length); },
});
def('finisher', {
  name: 'とどめ', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
  dmg: 9, up: { dmg: 12 }, text: '{D}ダメージを与える。\nこれで敵を倒すと、エネルギー1を得てカードを1枚引く。', art: 'execute',
  async play(c, s, t) {
    await c.attack(t, s.dmg);
    if (!t.alive) { await c.gainEnergy(1); await c.draw(1); }
  },
});
def('triple_thrust', {
  name: '三段突き', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
  dmg: 6, hits: 3, up: { dmg: 8 }, text: '{D}ダメージを{H}回与える。', art: 'spear',
  async play(c, s, t) { await c.attack(t, s.dmg, s.hits); },
});
def('detonate', {
  name: '爆燃', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
  up: { cost: 0 }, text: '対象の灼熱に等しいダメージを、ブロックを無視して与える（灼熱は減らない）。', art: 'explode',
  async play(c, s, t) { await c.burnBurst(t); },
});
def('smoke', {
  name: '煙幕', type: 'skill', rarity: 'uncommon', cost: 1,
  blk: 7, mag: 1, up: { blk: 9, mag: 2 }, text: 'ブロックを{B}得る。\n敵全体に弱体{M}を与える。', art: 'smoke',
  async play(c, s) { await c.gainBlock(s.blk); await c.apply('all', 'weak', s.mag); },
});
def('radiant_shield', {
  name: '光の盾', type: 'skill', rarity: 'uncommon', cost: 1,
  blk: 4, mag: 2, up: { blk: 6, mag: 3 }, text: 'ブロックを{B}得る。\n（輝き1つにつき+{M}）', art: 'radiantshield',
  calcBlk: (c, s) => s.blk + s.mag * (c.player.statuses.radiance || 0),
  async play(c, s) { await c.gainBlock(s.blk + s.mag * (c.player.statuses.radiance || 0)); },
});
def('ash_rite', {
  name: '灰の儀', type: 'skill', rarity: 'uncommon', cost: 0,
  mag: 1, up: { mag: 2 }, text: '手札のカード1枚を焼却する。\nエネルギー1を得て、カードを{M}枚引く。', art: 'ashrite',
  async play(c, s) {
    const card = await c.chooseHand('焼却するカードを選択');
    if (card) await c.exhaustCard(card);
    await c.gainEnergy(1); await c.draw(s.mag);
  },
});
def('life_flame', {
  name: '命の灯', type: 'skill', rarity: 'uncommon', cost: 0, exhaust: true,
  mag: 3, up: { mag: 2 }, text: 'HPを{M}失う。\nエネルギー2を得る。\n焼却。', art: 'heartflame',
  async play(c, s) { await c.loseHp(s.mag); await c.gainEnergy(2); },
});
def('fighting_spirit', {
  name: '闘志', type: 'power', rarity: 'uncommon', cost: 1,
  mag: 2, up: { mag: 3 }, text: '筋力を{M}得る。', art: 'fist',
  async play(c, s) { await c.apply(c.player, 'strength', s.mag); },
});
def('beacon', {
  name: '灯台', type: 'power', rarity: 'uncommon', cost: 1,
  mag: 1, up: { cost: 0 }, text: 'ターン開始時、輝きを{M}得る。', art: 'beacon',
  async play(c, s) { await c.apply(c.player, 'beacon', s.mag); },
});
def('thorn_mail', {
  name: '茨の鎧', type: 'power', rarity: 'uncommon', cost: 1,
  mag: 3, up: { mag: 5 }, text: '反撃{M}を得る。', art: 'thorn',
  async play(c, s) { await c.apply(c.player, 'thorns', s.mag); },
});
def('ash_pact', {
  name: '灰の契約', type: 'power', rarity: 'uncommon', cost: 1,
  mag: 4, up: { mag: 6 }, text: 'カードを焼却するたび、ブロックを{M}得る。', art: 'pact',
  async play(c, s) { await c.apply(c.player, 'ash_pact', s.mag); },
});

// ---------------------------------------------------------------- rare
def('inferno', {
  name: '業火', type: 'skill', rarity: 'rare', cost: 1, target: 'enemy', exhaust: true,
  up: { cost: 0 }, text: '対象の灼熱を2倍にする。\n焼却。', art: 'inferno',
  async play(c, s, t) { await c.apply(t, 'burn', t.statuses.burn || 0, { inferno: true }); },
});
def('heavens_light', {
  name: '天光', type: 'attack', rarity: 'rare', cost: 2, target: 'all',
  mag: 5, up: { mag: 7 }, text: '輝きを全て消費し、1つにつき敵全体に{M}ダメージを与える。', art: 'sunburst',
  calcDmg: (c, s) => s.mag * (c.player.statuses.radiance || 0),
  async play(c, s) {
    const n = c.player.statuses.radiance || 0;
    await c.spendRadiance();
    await c.attack('all', s.mag * n, 1, { element: 'light', big: true });
  },
});
def('mirror_shield', {
  name: '鏡盾', type: 'skill', rarity: 'rare', cost: 2,
  up: { cost: 1 }, text: '現在のブロックを2倍にする。', art: 'mirror',
  async play(c) { await c.gainBlock(c.player.block, { raw: true }); },
});
def('bulwark', {
  name: '堅守', type: 'power', rarity: 'rare', cost: 2,
  up: { cost: 1 }, text: 'ブロックがターン開始時に消えなくなる。', art: 'fortress',
  async play(c) { await c.apply(c.player, 'bulwark', 1); },
});
def('burning_soul', {
  name: '燃ゆる魂', type: 'power', rarity: 'rare', cost: 2,
  mag: 3, up: { mag: 4 }, text: 'ターン開始時、敵全体に灼熱{M}を与える。', art: 'phoenix',
  async play(c, s) { await c.apply(c.player, 'burning_soul', s.mag); },
});
def('solar_heart', {
  name: '太陽の心臓', type: 'power', rarity: 'rare', cost: 1,
  mag: 3, up: { mag: 5 }, text: '輝きを得るたび、ランダムな敵に{M}ダメージを与える。', art: 'sun',
  async play(c, s) { await c.apply(c.player, 'solar_heart', s.mag); },
});
def('blade_storm', {
  name: '剣の嵐', type: 'attack', rarity: 'rare', cost: 'X', target: 'enemy',
  dmg: 6, up: { dmg: 8 }, text: 'エネルギーを全て消費し、{D}ダメージをX回与える。', art: 'bladestorm',
  async play(c, s, t, x) { if (x > 0) await c.attack(t, s.dmg, x, { big: x >= 4 }); },
});

// ---------------------------------------------------------------- status / curse
def('ash', {
  name: '灰', type: 'status', rarity: 'special', cost: -1, unplayable: true,
  text: '使用不可。\nターン終了時に手札にあると、2ダメージを受け焼却される。', art: 'ashcard',
});
def('mud', {
  name: '泥', type: 'status', rarity: 'special', cost: 1, exhaust: true,
  text: '焼却。', art: 'mud', async play() {},
});
def('regret', {
  name: '未練', type: 'curse', rarity: 'special', cost: -1, unplayable: true,
  text: '使用不可。\n過去に囚われた想い。', art: 'curse',
});

export const REWARD_POOL = Object.values(CARDS).filter((c) => ['common', 'uncommon', 'rare'].includes(c.rarity));

let uidCounter = 1;
export function makeCard(id, upgraded = false) {
  if (!CARDS[id]) throw new Error('Unknown card ' + id);
  return { uid: uidCounter++, id, upgraded };
}

// Merge upgrade values into a stats object.
export function cardStats(inst) {
  const d = CARDS[inst.id];
  const s = { cost: d.cost, dmg: d.dmg || 0, blk: d.blk || 0, mag: d.mag || 0, hits: d.hits || 1 };
  if (inst.upgraded && d.up) Object.assign(s, d.up);
  if (inst.costOverride !== undefined) s.cost = inst.costOverride;
  return s;
}

export function canUpgrade(inst) {
  const d = CARDS[inst.id];
  return !inst.upgraded && !!d.up;
}

export function cardName(inst) {
  return CARDS[inst.id].name + (inst.upgraded ? '+' : '');
}

export const STARTER_DECK = ['strike', 'strike', 'strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'defend', 'lantern_edge'];
