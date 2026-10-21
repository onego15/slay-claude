// Relics: passive hooks called by the combat engine and the run.
// Hooks: onCombatStart(c), onTurnStart(c), onTurnEnd(c), onExhaust(c), onKill(c), onCombatEnd(run), applyBurnBonus
export const RELICS = {};
const def = (id, o) => { RELICS[id] = { id, ...o }; };

def('lantern', {
  name: '灯守のランタン', rarity: 'starter', icon: 'lantern',
  text: '戦闘終了時、HPを6回復する。',
  onCombatEnd(run) { run.heal(6); },
});
def('flintstone', {
  name: '火打石', rarity: 'common', icon: 'flintstone',
  text: '戦闘開始時、敵全体に灼熱3を与える。',
  async onCombatStart(c) { await c.apply('all', 'burn', 3); },
});
def('shield_shard', {
  name: '盾の欠片', rarity: 'common', icon: 'shard',
  text: '戦闘開始時、ブロックを10得る。',
  async onCombatStart(c) { await c.gainBlock(10, { raw: true }); },
});
def('prayer_beads', {
  name: '祈りの数珠', rarity: 'common', icon: 'beads',
  text: '戦闘開始時、輝きを2得る。',
  async onCombatStart(c) { await c.radiance(2); },
});
def('whetstone', {
  name: '砥石', rarity: 'common', icon: 'whetstone',
  text: '戦闘開始時、筋力を1得る。',
  async onCombatStart(c) { await c.apply(c.player, 'strength', 1); },
});
def('silver_quill', {
  name: '銀の羽根', rarity: 'common', icon: 'quill',
  text: '戦闘の最初のターン、カードを2枚多く引く。',
  firstTurnDraw: 2,
});
def('oil_jar', {
  name: '灯油の壺', rarity: 'common', icon: 'oiljar',
  text: '灼熱を与えるとき、その値が1増加する。',
  burnBonus: 1,
});
def('herb_pouch', {
  name: '薬草袋', rarity: 'common', icon: 'herb',
  text: '休息時の回復量が15増加する。',
  restBonus: 15,
});
def('moon_shard', {
  name: '月の欠片', rarity: 'uncommon', icon: 'moon',
  text: '3ターン目ごとに、エネルギーを1多く得る。',
  async onTurnStart(c) { if (c.turn % 3 === 0) await c.gainEnergy(1); },
});
def('thorn_crown', {
  name: '茨の冠', rarity: 'uncommon', icon: 'crown',
  text: '戦闘開始時、反撃3を得る。',
  async onCombatStart(c) { await c.apply(c.player, 'thorns', 3); },
});
def('ash_glass', {
  name: '灰の砂時計', rarity: 'uncommon', icon: 'hourglass',
  text: 'カードを焼却するたび、ランダムな敵に4ダメージを与える。',
  async onExhaust(c) { await c.randomEnemyDamage(4); },
});
def('silver_aegis', {
  name: '白銀の守り', rarity: 'uncommon', icon: 'aegis',
  text: 'ターン終了時、ブロックが0なら、ブロックを6得る。',
  async onTurnEnd(c) { if (c.player.block === 0) await c.gainBlock(6, { raw: true }); },
});
def('war_drum', {
  name: '戦鼓', rarity: 'uncommon', icon: 'drum',
  text: '各ターン最初に使用するアタックのダメージが5増加する。',
  firstAttackBonus: 5,
});
def('warm_ash', {
  name: '温かい灰', rarity: 'uncommon', icon: 'warmash',
  text: '敵を倒すたび、HPを3回復する。',
  async onKill(c) { await c.healPlayer(3); },
});
def('sunstone', {
  name: '太陽石', rarity: 'rare', icon: 'sunstone',
  text: '毎ターン、エネルギーを1多く得る。',
  energyBonus: 1,
});
def('undying_wick', {
  name: '不滅の芯', rarity: 'rare', icon: 'wick',
  text: 'HPが0になったとき、一度だけ最大HPの50%で蘇る。',
});
def('ember_heart', {
  name: '熾火の心臓', rarity: 'rare', icon: 'emberheart',
  text: '敵の灼熱が、ターン開始時に減少しなくなる。',
});
def('dawn_crown', {
  name: '曙光の冠', rarity: 'rare', icon: 'dawn',
  text: 'ターン開始時、輝きが5以上ならエネルギーを1得る。',
  async onTurnStart(c) { if ((c.player.statuses.radiance || 0) >= 5) await c.gainEnergy(1); },
});

export const RELIC_POOL = {
  common: Object.values(RELICS).filter((r) => r.rarity === 'common').map((r) => r.id),
  uncommon: Object.values(RELICS).filter((r) => r.rarity === 'uncommon').map((r) => r.id),
  rare: Object.values(RELICS).filter((r) => r.rarity === 'rare').map((r) => r.id),
};

// ---------------------------------------------------------------- potions
export const POTIONS = {};
const pdef = (id, o) => { POTIONS[id] = { id, target: 'self', ...o }; };
pdef('heal', { name: '癒しの霊薬', color: '#ff6b8a', text: 'HPを20回復する。', async use(c) { await c.healPlayer(20); } });
pdef('fire', { name: '火炎瓶', color: '#ff8a2a', text: '敵全体に10ダメージを与える。', async use(c) { await c.attack('all', 10, 1, { raw: true, element: 'fire' }); } });
pdef('guard', { name: '守りの霊薬', color: '#5fb8ff', text: 'ブロックを12得る。', async use(c) { await c.gainBlock(12, { raw: true }); } });
pdef('might', { name: '力の霊薬', color: '#e04848', text: '筋力を2得る。', async use(c) { await c.apply(c.player, 'strength', 2); } });
pdef('vigor', { name: '活力の霊薬', color: '#ffd84a', text: 'エネルギーを2得る。', async use(c) { await c.gainEnergy(2); } });
pdef('light', { name: '光の霊薬', color: '#fff3b0', text: '輝きを4得る。', async use(c) { await c.radiance(4); } });
pdef('swift', { name: '疾風の霊薬', color: '#7ff0c0', text: 'カードを3枚引く。', async use(c) { await c.draw(3); } });
pdef('frailty', { name: '衰弱の霊薬', color: '#b07aff', target: 'enemy', text: '敵1体に脆弱3を与える。', async use(c, t) { await c.apply(t, 'vulnerable', 3); } });
export const POTION_POOL = Object.keys(POTIONS);
