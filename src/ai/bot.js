// Heuristic auto-player used for balance simulation and smoke tests.
import { CARDS, cardStats } from '../core/cards.js';
import { POTIONS } from '../core/relics.js';

// Base value of picking a card, plus per-archetype bonuses.
const TIER = {
  twin_fang: 5, flint: 6, shield_bash: 4, sweep: 6, rockbreaker: 6, light_bolt: 5, chain_flame: 5, quick_cut: 5,
  parry: 6, iron_wall: 5, lantern_ward: 6, prayer: 4, oil_flask: 5, insight: 4,
  flash_slash: 7, flame_dance: 7, ashen_strike: 5, finisher: 6, triple_thrust: 6, detonate: 6, smoke: 7, radiant_shield: 6,
  ash_rite: 5, life_flame: 5, fighting_spirit: 7, beacon: 7, thorn_mail: 6, ash_pact: 5,
  inferno: 8, heavens_light: 8, mirror_shield: 6, bulwark: 7, burning_soul: 9, solar_heart: 7, blade_storm: 7,
};
const ARCH = {
  burn: ['flint', 'oil_flask', 'chain_flame', 'flame_dance', 'detonate', 'inferno', 'burning_soul', 'smoke'],
  radiance: ['light_bolt', 'lantern_ward', 'prayer', 'flash_slash', 'radiant_shield', 'beacon', 'heavens_light', 'solar_heart'],
  block: ['parry', 'iron_wall', 'shield_bash', 'mirror_shield', 'bulwark', 'thorn_mail', 'smoke', 'lantern_ward'],
  strength: ['twin_fang', 'triple_thrust', 'fighting_spirit', 'blade_storm', 'quick_cut', 'finisher', 'sweep'],
  exhaust: ['ash_rite', 'ashen_strike', 'ash_pact', 'prayer', 'life_flame', 'inferno'],
};

export class Bot {
  constructor(strategy = 'balanced', rng) {
    this.strategy = strategy;
    this.rng = rng;
  }

  cardValue(id, deck) {
    if (this.strategy === 'random') return this.rng() * 10;
    let v = TIER[id] || 3;
    const arch = ARCH[this.strategy];
    if (arch && arch.includes(id)) v += 4;
    // avoid too many copies
    const copies = deck.filter((c) => c.id === id).length;
    v -= copies * 2;
    if (CARDS[id].type === 'power' && deck.filter((c) => CARDS[c.id].type === 'power').length >= 3) v -= 2;
    return v;
  }

  pickReward(cards, deck) {
    let best = null;
    let bv = deck.length > 22 ? 7 : 4.5;
    for (const c of cards) {
      const v = this.cardValue(c.id, deck);
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------ combat
  incoming(c) {
    let n = 0;
    for (const e of c.livingEnemies()) {
      const i = c.intentInfo(e);
      if (i && i.dmg !== undefined) n += i.dmg * i.hits;
    }
    if (c.player.statuses.burn) n += 0; // burn handled separately (ignores block)
    return n;
  }

  scorePlay(c, inst, target) {
    const d = CARDS[inst.id];
    const s = cardStats(inst);
    const p = c.previewCard(inst, target);
    const incoming = this.incoming(c);
    const needBlock = Math.max(0, incoming - c.player.block);
    let v = 0;
    const living = c.livingEnemies();
    const rad = c.player.statuses.radiance || 0;
    if (d.type === 'power') v += c.turn <= 3 ? 14 : 6;
    if (d.target === 'enemy' || d.target === 'all') {
      const targets = d.target === 'all' ? living : [target];
      const hits = d.id === 'chain_flame' ? ((target.statuses.burn || 0) > 0 ? 2 : 1) : s.hits;
      const x = s.cost === 'X' ? c.energy : 1;
      for (const t of targets) {
        let dmg = 0;
        if (d.type === 'attack' && d.id !== 'heavens_light') dmg = p.dmg * hits * (d.id === 'blade_storm' ? x : 1);
        if (d.id === 'heavens_light') dmg = p.mag;
        if (d.id === 'detonate') dmg = t.statuses.burn || 0;
        const eff = Math.max(0, dmg - (d.id === 'detonate' ? 0 : t.block));
        const kill = eff >= t.hp;
        v += Math.min(eff, t.hp) * 1.0 + (kill ? 8 + (this.attacking(c, t) ? 6 : 0) : 0);
      }
    }
    if (d.id === 'flash_slash' && rad < 3) v -= 6;
    if (d.id === 'heavens_light' && rad < 3) v -= 20;
    if (d.blk !== undefined || d.calcBlk) v += Math.min(p.blk, needBlock) * 1.1 + Math.max(0, p.blk - needBlock) * 0.15;
    if (d.id === 'mirror_shield') v += Math.min(c.player.block, Math.max(0, needBlock - c.player.block)) * 1.1 + c.player.block * 0.1;
    if (d.mag && /輝き/.test(d.text) && !['flash_slash', 'radiant_shield', 'heavens_light'].includes(d.id)) v += s.mag * 2.2;
    if (/灼熱/.test(d.text) && ['flint', 'oil_flask', 'flame_dance'].includes(d.id)) {
      const targets = d.target === 'all' ? living : [target];
      for (const t of targets) v += Math.min(s.mag * 2, t.hp) * 0.9;
    }
    if (d.id === 'inferno') v += Math.min((target.statuses.burn || 0) * 2.5, target.hp) * 0.8;
    if (d.id === 'smoke') v += living.filter((e) => this.attacking(c, e)).length * 3;
    if (/枚引く/.test(d.text)) v += (s.mag || 1) * 2.5;
    if (d.id === 'ash_rite') v += c.hand.some((h) => ['ash', 'mud', 'regret'].includes(h.id)) ? 8 : 2;
    if (d.id === 'life_flame') v += c.player.hp > 20 ? 7 : -10;
    if (d.id === 'rockbreaker') v += 4;
    if (d.id === 'mud') v += 1;
    const cost = s.cost === 'X' ? Math.max(1, c.energy) : s.cost;
    return v / Math.max(0.6, cost);
  }

  attacking(c, e) {
    const i = c.intentInfo(e);
    return i && i.dmg !== undefined;
  }

  chooseTarget(c, inst) {
    const living = c.livingEnemies();
    let best = living[0];
    let bv = -Infinity;
    for (const t of living) {
      const p = c.previewCard(inst, t);
      const kill = p.dmg !== undefined && p.dmg * (cardStats(inst).hits || 1) >= t.hp + t.block;
      let v = (kill ? 100 : 0) - t.hp * 0.3 + (this.attacking(c, t) ? 5 : 0);
      if (CARDS[inst.id].id === 'inferno' || CARDS[inst.id].id === 'detonate') v = (t.statuses.burn || 0) * 10;
      if (t.def.minion && !kill) v -= 3;
      if (v > bv) { bv = v; best = t; }
    }
    return best;
  }

  bestPlay(c) {
    let best = null;
    let bv = 0.5;
    for (const inst of c.hand) {
      if (!c.canPlay(inst)) continue;
      const d = CARDS[inst.id];
      if (cardStats(inst).cost === 'X' && c.energy === 0) continue;
      const t = d.target === 'enemy' ? this.chooseTarget(c, inst) : null;
      const v = this.scorePlay(c, inst, t || c.livingEnemies()[0]);
      if (v > bv) { bv = v; best = [inst, t]; }
    }
    return best;
  }

  async playTurn(c) {
    let guard = 0;
    // potions: use defensively when in danger, aggressively in elite/boss
    await this.maybePotion(c);
    while (!c.over && guard++ < 40) {
      const best = this.bestPlay(c);
      if (!best) break;
      await c.playCard(best[0], best[1]);
    }
  }

  // Which potion slot (if any) the bot wants to use right now.
  potionToUse(c) {
    const run = c.run;
    for (let i = run.potions.length - 1; i >= 0; i--) {
      const id = run.potions[i];
      if (!id) continue;
      const danger = this.incoming(c) > c.player.hp * 0.5 || c.player.hp < c.player.maxHp * 0.3;
      const big = c.kind !== 'normal' && c.turn <= 2;
      if (id === 'heal' ? c.player.hp < c.player.maxHp * 0.35 : danger || big) return i;
    }
    return -1;
  }

  async maybePotion(c) {
    const run = c.run;
    for (let i = run.potions.length - 1; i >= 0; i--) {
      const id = run.potions[i];
      const danger = this.incoming(c) > c.player.hp * 0.5 || c.player.hp < c.player.maxHp * 0.3;
      const big = c.kind !== 'normal' && c.turn <= 2;
      if (id === 'heal' && c.player.hp < c.player.maxHp * 0.35) await c.usePotion(i);
      else if (id !== 'heal' && (danger || big)) await c.usePotion(i, c.livingEnemies()[0]);
      if (c.over) return;
    }
  }

  chooseHand(cards) {
    const junk = cards.find((h) => ['ash', 'mud', 'regret'].includes(h.id));
    if (junk) return junk;
    return cards.find((h) => h.id === 'strike') || cards.find((h) => h.id === 'defend') || cards[0];
  }

  choosePath(run, opts) {
    const bot = this;
    const types = opts.map((id) => run.map[id].type);
    const score = (t) => {
      const hpr = run.hp / run.maxHp;
      switch (t) {
        case 'elite': return hpr > 0.7 ? 6 : hpr > 0.5 ? 2 : -5;
        case 'rest': return hpr < 0.5 ? 7 : 2;
        case 'shop': return run.gold > 150 ? 6 : 1;
        case 'event': return 3;
        case 'treasure': return 9;
        case 'combat': return 3.5;
        default: return 0;
      }
    };
    let best = opts[0];
    let bv = -Infinity;
    for (let i = 0; i < opts.length; i++) {
      const v = bot.strategy === 'random' ? bot.rng() : score(types[i]) + bot.rng();
      if (v > bv) { bv = v; best = opts[i]; }
    }
    return best;
  }
}
