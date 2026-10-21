// Combat engine. Pure logic; presentation hooks in through `hooks.fx(type, data)` (awaited),
// so the same engine drives the animated game and the headless balance simulator.
import { CARDS, cardStats, makeCard } from './cards.js';
import { ENEMIES } from './enemies.js';
import { RELICS, POTIONS } from './relics.js';

const HAND_LIMIT = 10;
const RADIANCE_CAP = 10;
let enemyUid = 1;

export class Combat {
  constructor({ run, enemyIds, rng, hooks = {}, kind = 'normal' }) {
    this.run = run;
    this.rng = rng;
    this.kind = kind;
    this.hooks = hooks;
    this.turn = 0;
    this.over = null; // 'victory' | 'defeat'
    this.player = {
      isPlayer: true, name: '灯守', hp: run.hp, maxHp: run.maxHp, block: 0, statuses: {}, alive: true,
    };
    this.energy = 0;
    this.draw_ = [];
    this.hand = [];
    this.discard = [];
    this.exhaust = [];
    this.enemies = [];
    this.attacksThisTurn = 0;
    this.cardsThisTurn = 0;
    this.enemyIds = enemyIds;
    this.stats = { damageByCard: {}, plays: {}, turns: 0, damageTaken: 0 };
    this.currentCard = null;
  }

  // ------------------------------------------------------------ helpers
  async fx(type, data = {}) { if (this.hooks.fx) await this.hooks.fx(type, data, this); }
  hasRelic(id) { return this.run.relics.includes(id); }
  relicObjs() { return this.run.relics.map((id) => RELICS[id]); }
  livingEnemies() { return this.enemies.filter((e) => e.alive); }
  get maxEnergy() { return 3 + this.relicObjs().reduce((a, r) => a + (r.energyBonus || 0), 0); }
  get drawPile() { return this.draw_; }

  makeEnemy(id) {
    const d = ENEMIES[id];
    const hp = this.rng.int(d.hp[0], d.hp[1]);
    const e = {
      uid: enemyUid++, def: d, name: d.name, hp, maxHp: hp, block: 0, statuses: { ...(d.startStatuses || {}) },
      alive: true, history: [], intent: null, phase: 1, phaseTurn: 0, isPlayer: false,
    };
    return e;
  }

  chooseIntent(e) {
    e.intent = e.def.ai(e, this, this.rng);
  }

  intentInfo(e) {
    const m = e.def.moves[e.intent];
    if (!m) return null;
    const info = { id: e.intent, name: m.name, kind: m.intent, hits: m.hits || 1, heavy: !!m.heavy, ultimate: !!m.ultimate };
    if (m.dmg !== undefined) info.dmg = this.calcEnemyAttack(e, m.dmg);
    return info;
  }

  // ------------------------------------------------------------ damage math
  calcPlayerAttack(base, target, opts = {}) {
    if (opts.raw) return base;
    let d = base + (this.player.statuses.strength || 0) + (this.curAttackBonus || 0);
    if (this.player.statuses.weak) d *= 0.75;
    if (target && target.statuses.vulnerable) d *= 1.5;
    if (target && target.statuses.stoneskin) d *= 0.5;
    return Math.max(0, Math.floor(d));
  }

  calcEnemyAttack(e, base) {
    let d = base + (e.statuses.strength || 0);
    if (e.statuses.weak) d *= 0.75;
    if (this.player.statuses.vulnerable) d *= 1.5;
    return Math.max(0, Math.floor(d));
  }

  calcBlock(base) {
    return Math.max(0, base + (this.player.statuses.dexterity || 0));
  }

  // Preview values for card text, with the current state applied.
  previewCard(inst, target) {
    const d = CARDS[inst.id];
    const s = cardStats(inst);
    const out = { ...s };
    const isAttack = d.type === 'attack';
    const prevBonus = this.curAttackBonus;
    if (isAttack && this.attacksThisTurn === 0) this.curAttackBonus = this.firstAttackBonus();
    let base = d.calcDmg ? d.calcDmg(this, s) : s.dmg;
    if (d.dmg !== undefined || d.calcDmg) {
      if (d.id === 'heavens_light') out.mag = this.calcPlayerAttack(s.mag, target);
      out.dmg = this.calcPlayerAttack(base, target);
      out.dmgBase = base;
    }
    this.curAttackBonus = prevBonus;
    if (d.blk !== undefined || d.calcBlk) out.blk = this.calcBlock(d.calcBlk ? d.calcBlk(this, s) : s.blk);
    return out;
  }

  firstAttackBonus() {
    return this.relicObjs().reduce((a, r) => a + (r.firstAttackBonus || 0), 0);
  }

  async applyDamage(target, amount, { source = null, type = 'attack', opts = {} } = {}) {
    if (!target.alive || this.over) return 0;
    let blocked = 0;
    if (type !== 'hploss') {
      blocked = Math.min(target.block, amount);
      target.block -= blocked;
    }
    const unblocked = amount - blocked;
    target.hp -= unblocked;
    if (target.isPlayer) this.stats.damageTaken += unblocked;
    else if (this.currentCard) this.stats.damageByCard[this.currentCard] = (this.stats.damageByCard[this.currentCard] || 0) + Math.min(unblocked, unblocked + target.hp);
    await this.fx('damage', { target, amount, blocked, unblocked, source, type, opts });

    if (type === 'attack' && unblocked > 0 && target.statuses.plated) {
      target.statuses.plated -= 1;
      if (target.statuses.plated <= 0) delete target.statuses.plated;
    }
    if (type === 'attack' && source && source.alive && target.statuses.thorns && target.hp > 0) {
      await this.applyDamage(source, target.statuses.thorns, { source: target, type: 'thorns' });
    }
    if (target.hp <= 0) await this.onDeath(target);
    else if (!target.isPlayer && target.def.phaseAt && target.phase === 1 && target.hp <= target.maxHp * target.def.phaseAt) {
      await this.phaseShift(target);
    }
    this.checkEnd();
    return unblocked;
  }

  async phaseShift(e) {
    e.phase = 2;
    e.phaseTurn = 0;
    delete e.statuses.weak;
    delete e.statuses.vulnerable;
    e.intent = 'awaken';
    await this.fx('phase', { enemy: e });
  }

  async onDeath(t) {
    if (t.isPlayer) {
      if (this.hasRelic('undying_wick') && !this.run.wickUsed) {
        this.run.wickUsed = true;
        t.hp = Math.floor(t.maxHp * 0.5);
        await this.fx('revive', { target: t });
        return;
      }
      t.hp = 0;
      t.alive = false;
      this.over = 'defeat';
      await this.fx('death', { target: t });
      return;
    }
    if (t.statuses.undying) {
      delete t.statuses.undying;
      t.hp = Math.floor(t.maxHp * 0.4);
      t.statuses.strength = (t.statuses.strength || 0) + 2;
      delete t.statuses.burn;
      await this.fx('revive', { target: t });
      return;
    }
    t.hp = 0;
    t.alive = false;
    t.block = 0;
    await this.fx('death', { target: t });
    if (t.def.onDeath) {
      const extra = t.def.onDeath(this, t) || [];
      for (const m of extra) {
        if (m.alive) { m.alive = false; m.hp = 0; await this.fx('death', { target: m }); }
      }
    }
    if (t.def.boss) {
      for (const m of this.livingEnemies()) { m.alive = false; m.hp = 0; await this.fx('death', { target: m }); }
    }
    for (const r of this.relicObjs()) if (r.onKill && !this.over) await r.onKill(this, t);
    this.checkEnd();
  }

  checkEnd() {
    if (this.over) return;
    if (this.player.hp <= 0 && !this.player.alive) this.over = 'defeat';
    else if (this.livingEnemies().length === 0) this.over = 'victory';
  }

  // ------------------------------------------------------------ API used by cards / relics / enemies
  async attack(target, base, hits = 1, opts = {}) {
    for (let i = 0; i < hits; i++) {
      if (this.over) return;
      const targets = target === 'all' ? this.livingEnemies() : target && target.alive ? [target] : [];
      if (!targets.length) return;
      await this.fx('playerAttack', { targets, hit: i, hits, opts, card: this.currentCard });
      for (const t of targets) {
        const dmg = this.calcPlayerAttack(base, t, opts);
        await this.applyDamage(t, dmg, { source: this.player, type: 'attack', opts });
      }
    }
  }

  async enemyAttack(e, base, hits = 1, opts = {}) {
    let total = 0;
    for (let i = 0; i < hits; i++) {
      if (this.over || !e.alive) return total;
      await this.fx('enemyAttack', { enemy: e, hit: i, hits, opts });
      const dmg = this.calcEnemyAttack(e, base);
      total += await this.applyDamage(this.player, dmg, { source: e, type: 'attack', opts });
    }
    return total;
  }

  async gainBlock(n, { raw = false } = {}) {
    const amt = raw ? n : this.calcBlock(n);
    if (amt <= 0) return;
    this.player.block = Math.min(999, this.player.block + amt);
    await this.fx('block', { target: this.player, amount: amt });
  }

  async enemyBlock(e, n) {
    if (!e.alive) return;
    e.block += n;
    await this.fx('block', { target: e, amount: n });
  }

  async apply(target, status, n, opts = {}) {
    if (target === 'all') {
      for (const e of this.livingEnemies()) await this.apply(e, status, n, opts);
      return;
    }
    if (!target || !target.alive || this.over) return;
    if (status === 'burn' && !target.isPlayer && !opts.source && n > 0) {
      n += this.relicObjs().reduce((a, r) => a + (r.burnBonus || 0), 0);
    }
    if (status === 'radiance') {
      const cur = target.statuses.radiance || 0;
      const nv = Math.max(0, Math.min(RADIANCE_CAP, cur + n));
      if (nv === 0) delete target.statuses.radiance; else target.statuses.radiance = nv;
      await this.fx('status', { target, status, n: nv - cur });
      return;
    }
    if (n === 0) return;
    const v = (target.statuses[status] || 0) + n;
    if (v === 0) delete target.statuses[status]; else target.statuses[status] = v;
    await this.fx('status', { target, status, n, opts });
  }

  async radiance(n) {
    const before = this.player.statuses.radiance || 0;
    await this.apply(this.player, 'radiance', n);
    const gained = (this.player.statuses.radiance || 0) - before;
    if (gained > 0 && this.player.statuses.solar_heart) {
      await this.randomEnemyDamage(this.player.statuses.solar_heart, { element: 'light' });
    }
  }

  async spendRadiance() {
    const n = this.player.statuses.radiance || 0;
    if (n > 0) {
      delete this.player.statuses.radiance;
      await this.fx('spendRadiance', { n });
    }
    return n;
  }

  async randomEnemyDamage(n, opts = {}) {
    const living = this.livingEnemies();
    if (!living.length) return;
    const t = this.rng.pick(living);
    await this.fx('zap', { target: t, opts });
    await this.applyDamage(t, n, { source: null, type: 'attack', opts });
  }

  async burnBurst(t) {
    const n = t.statuses.burn || 0;
    if (n <= 0 || !t.alive) return;
    await this.fx('burnBurst', { target: t, n });
    await this.applyDamage(t, n, { type: 'hploss', opts: { element: 'fire' } });
  }

  async draw(n) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (this.draw_.length === 0) {
        if (this.discard.length === 0) break;
        this.draw_ = this.rng.shuffle(this.discard.splice(0));
        await this.fx('shuffle', { count: this.draw_.length });
      }
      const card = this.draw_.pop();
      if (this.hand.length >= HAND_LIMIT) {
        this.discard.push(card);
        await this.fx('discard', { cards: [card], from: 'draw' });
        continue;
      }
      this.hand.push(card);
      drawn.push(card);
    }
    if (drawn.length) await this.fx('draw', { cards: drawn });
    return drawn;
  }

  async gainEnergy(n) {
    this.energy += n;
    await this.fx('energy', { n });
  }

  async loseHp(n) {
    await this.applyDamage(this.player, n, { type: 'hploss' });
  }

  async healPlayer(n) {
    const before = this.player.hp;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + n);
    await this.fx('heal', { target: this.player, amount: this.player.hp - before });
  }

  async healEnemy(e, n) {
    if (!e.alive) return;
    const before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + n);
    await this.fx('heal', { target: e, amount: e.hp - before });
  }

  async chooseHand(prompt) {
    if (!this.hand.length) return null;
    if (this.hooks.chooseHand) return this.hooks.chooseHand(this.hand.slice(), prompt, this);
    return this.hand[0];
  }

  async exhaustCard(card) {
    const i = this.hand.indexOf(card);
    if (i >= 0) this.hand.splice(i, 1);
    this.exhaust.push(card);
    await this.fx('exhaust', { cards: [card] });
    if (this.player.statuses.ash_pact) await this.gainBlock(this.player.statuses.ash_pact, { raw: true });
    for (const r of this.relicObjs()) if (r.onExhaust && !this.over) await r.onExhaust(this, card);
  }

  async addCards(id, pile, n, source) {
    const cards = [];
    for (let i = 0; i < n; i++) cards.push(makeCard(id));
    if (pile === 'draw') {
      for (const c of cards) this.draw_.splice(this.rng.int(0, this.draw_.length), 0, c);
    } else this.discard.push(...cards);
    await this.fx('addCards', { cards, pile, source });
  }

  async summon(id, source) {
    if (this.livingEnemies().length >= 5) return;
    const e = this.makeEnemy(id);
    // insert near the summoner for a pleasing layout
    const idx = this.enemies.indexOf(source);
    const slot = this.enemies.findIndex((x) => !x.alive && x.def.minion);
    if (slot >= 0) this.enemies[slot] = e; else this.enemies.splice(idx >= 0 ? idx : this.enemies.length, 0, e);
    this.chooseIntent(e);
    await this.fx('summon', { enemy: e, source });
  }

  // ------------------------------------------------------------ flow
  async start() {
    this.draw_ = this.rng.shuffle(this.run.deck.map((c) => ({ ...c })));
    for (const id of this.enemyIds) {
      const e = this.makeEnemy(id);
      this.enemies.push(e);
      for (const s of e.def.initialSummons || []) {
        const m = this.makeEnemy(s);
        this.enemies.push(m);
      }
    }
    // minions flank their master: reorder candelabra flames around it
    if (this.enemies.length === 3 && this.enemies[0].def.initialSummons) {
      const [m, a, b] = this.enemies;
      this.enemies = [a, m, b];
    }
    for (const e of this.enemies) this.chooseIntent(e);
    await this.fx('combatStart', {});
    for (const r of this.relicObjs()) if (r.onCombatStart) await r.onCombatStart(this);
    await this.startPlayerTurn();
  }

  async startPlayerTurn() {
    if (this.over) return;
    this.turn++;
    this.stats.turns = this.turn;
    this.attacksThisTurn = 0;
    this.cardsThisTurn = 0;
    if (!this.player.statuses.bulwark) this.player.block = 0;
    await this.fx('playerTurn', { turn: this.turn });
    if (this.player.statuses.burn) {
      await this.fx('burnTick', { target: this.player, n: this.player.statuses.burn });
      await this.applyDamage(this.player, this.player.statuses.burn, { type: 'hploss', opts: { element: 'fire' } });
      if (this.player.statuses.burn) { this.player.statuses.burn -= 1; if (!this.player.statuses.burn) delete this.player.statuses.burn; }
      if (this.over) return;
    }
    this.energy = this.maxEnergy;
    let n = 5;
    if (this.turn === 1) n += this.relicObjs().reduce((a, r) => a + (r.firstTurnDraw || 0), 0);
    await this.draw(n);
    for (const r of this.relicObjs()) if (r.onTurnStart && !this.over) await r.onTurnStart(this);
    if (this.player.statuses.beacon) await this.radiance(this.player.statuses.beacon);
    if (this.player.statuses.burning_soul) await this.apply('all', 'burn', this.player.statuses.burning_soul);
    await this.fx('turnReady', {});
  }

  canPlay(inst) {
    const d = CARDS[inst.id];
    if (this.over || d.unplayable) return false;
    const s = cardStats(inst);
    if (s.cost === 'X') return true;
    return this.energy >= s.cost;
  }

  async playCard(inst, target) {
    if (!this.canPlay(inst)) return false;
    const d = CARDS[inst.id];
    const s = cardStats(inst);
    if (d.target === 'enemy' && (!target || !target.alive)) {
      target = this.livingEnemies()[0];
      if (!target) return false;
    }
    let x = 0;
    if (s.cost === 'X') { x = this.energy; this.energy = 0; } else this.energy -= s.cost;
    const hi = this.hand.indexOf(inst);
    if (hi >= 0) this.hand.splice(hi, 1);
    this.currentCard = inst.id;
    this.stats.plays[inst.id] = (this.stats.plays[inst.id] || 0) + 1;
    if (d.type === 'attack' && this.attacksThisTurn === 0) this.curAttackBonus = this.firstAttackBonus();
    await this.fx('cardPlay', { card: inst, target, x });
    await d.play(this, s, d.target === 'enemy' ? target : null, x);
    this.curAttackBonus = 0;
    if (d.type === 'attack') this.attacksThisTurn++;
    this.cardsThisTurn++;
    this.currentCard = null;
    if (d.type === 'power') await this.fx('powerUsed', { card: inst });
    else if (d.exhaust) {
      this.exhaust.push(inst);
      await this.fx('exhaust', { cards: [inst], played: true });
      if (this.player.statuses.ash_pact) await this.gainBlock(this.player.statuses.ash_pact, { raw: true });
      for (const r of this.relicObjs()) if (r.onExhaust && !this.over) await r.onExhaust(this, inst);
    } else {
      this.discard.push(inst);
      await this.fx('cardResolved', { card: inst });
    }
    this.checkEnd();
    return true;
  }

  async usePotion(idx, target) {
    const id = this.run.potions[idx];
    if (!id || this.over) return false;
    const p = POTIONS[id];
    if (p.target === 'enemy' && (!target || !target.alive)) target = this.livingEnemies()[0];
    this.run.potions.splice(idx, 1);
    await this.fx('potion', { id, target });
    await p.use(this, target);
    this.checkEnd();
    return true;
  }

  async endTurn() {
    if (this.over) return;
    for (const r of this.relicObjs()) if (r.onTurnEnd) await r.onTurnEnd(this);
    // status cards in hand
    for (const card of this.hand.slice()) {
      if (card.id === 'ash') {
        await this.applyDamage(this.player, 2, { type: 'hploss' });
        await this.exhaustCard(card);
        if (this.over) return;
      }
    }
    const rest = this.hand.splice(0);
    this.discard.push(...rest);
    if (rest.length) await this.fx('discard', { cards: rest, from: 'hand' });
    for (const s of ['weak', 'vulnerable']) {
      if (this.player.statuses[s]) { this.player.statuses[s]--; if (!this.player.statuses[s]) delete this.player.statuses[s]; }
    }
    await this.fx('enemyPhase', {});
    await this.enemyTurn();
    if (!this.over) await this.startPlayerTurn();
  }

  async enemyTurn() {
    const acting = this.enemies.filter((e) => e.alive);
    for (const e of acting) {
      if (this.over) return;
      if (!e.alive) continue;
      e.block = 0;
      delete e.statuses.stoneskin;
      if (e.statuses.burn) {
        await this.fx('burnTick', { target: e, n: e.statuses.burn });
        await this.applyDamage(e, e.statuses.burn, { type: 'hploss', opts: { element: 'fire' } });
        if (e.alive && e.statuses.burn && !this.hasRelic('ember_heart')) {
          e.statuses.burn -= 1;
          if (!e.statuses.burn) delete e.statuses.burn;
        }
        if (this.over) return;
        if (!e.alive) continue;
      }
      const moveId = e.intent;
      const move = e.def.moves[moveId];
      await this.fx('enemyAction', { enemy: e, move, moveId });
      await move.act(this, e);
      e.history.push(moveId);
      await this.fx('enemyActionEnd', { enemy: e });
    }
    if (this.over) return;
    for (const e of this.livingEnemies()) {
      if (e.statuses.plated) await this.enemyBlock(e, e.statuses.plated);
      if (e.statuses.ritual) await this.apply(e, 'strength', e.statuses.ritual, { source: e });
      if (e.statuses.regrowth) await this.healEnemy(e, e.statuses.regrowth);
      for (const s of ['weak', 'vulnerable']) {
        if (e.statuses[s]) { e.statuses[s]--; if (!e.statuses[s]) delete e.statuses[s]; }
      }
      if (e.phase === 2) e.phaseTurn++;
    }
    for (const e of this.livingEnemies()) this.chooseIntent(e);
  }
}
