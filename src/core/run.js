// Run state: map, deck, gold, relics, rewards, shop, rest.
import { makeRng } from './rng.js';
import { CARDS, REWARD_POOL, STARTER_DECK, makeCard, canUpgrade } from './cards.js';
import { RELICS, RELIC_POOL, POTION_POOL } from './relics.js';
import { ENCOUNTERS } from './enemies.js';

export const MAP_ROWS = 13; // 12 floors + boss
export const MAP_COLS = 7;

export function createRun(seed) {
  const rng = makeRng(seed);
  const run = {
    seed,
    rng,
    mapRng: makeRng(seed ^ 0x9e3779b9),
    cardRng: makeRng(seed ^ 0x85ebca6b),
    combatRng: makeRng(seed ^ 0xc2b2ae35),
    hp: 80,
    maxHp: 80,
    gold: 99,
    deck: STARTER_DECK.map((id) => makeCard(id)),
    relics: ['lantern'],
    potions: [],
    potionSlots: 2,
    floor: 0,
    map: null,
    pos: null,
    visited: [],
    removals: 0,
    rareBonus: 0,
    easyLeft: 3,
    seenEvents: [],
    seenEncounters: [],
    relicsSeen: ['lantern'],
    wickUsed: false,
    stats: { kills: 0, damageDealt: 0, cardsPlayed: 0, floorsCleared: 0, startTime: Date.now() },
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); },
  };
  run.map = generateMap(run.mapRng);
  return run;
}

// ------------------------------------------------------------------ map
export function generateMap(rng) {
  const rows = MAP_ROWS - 1; // regular rows
  const nodes = {}; // key "r,c"
  const edges = new Set(); // "r,c>r+1,c2"
  const key = (r, c) => `${r},${c}`;
  const starts = [];
  for (let p = 0; p < 6; p++) {
    let c = rng.int(0, MAP_COLS - 1);
    if (p < 2) { while (starts.includes(c)) c = rng.int(0, MAP_COLS - 1); }
    starts.push(c);
    nodes[key(0, c)] = nodes[key(0, c)] || { r: 0, c, next: new Set() };
    for (let r = 0; r < rows - 1; r++) {
      let options = [c - 1, c, c + 1].filter((x) => x >= 0 && x < MAP_COLS);
      // avoid crossing existing edges
      options = options.filter((nc) => {
        for (const e of edges) {
          const [a, b] = e.split('>');
          const [r1, c1] = a.split(',').map(Number);
          const [, c2] = b.split(',').map(Number);
          if (r1 !== r) continue;
          if ((c1 < c && c2 > nc) || (c1 > c && c2 < nc)) return false;
        }
        return true;
      });
      if (!options.length) options = [c];
      const nc = rng.pick(options);
      edges.add(`${key(r, c)}>${key(r + 1, nc)}`);
      nodes[key(r + 1, nc)] = nodes[key(r + 1, nc)] || { r: r + 1, c: nc, next: new Set() };
      nodes[key(r, c)].next.add(key(r + 1, nc));
      c = nc;
    }
  }
  const boss = { r: rows, c: 3, next: new Set(), type: 'boss' };
  nodes[key(rows, 3)] = boss;
  for (const k in nodes) if (nodes[k].r === rows - 1) nodes[k].next.add(key(rows, 3));

  // parents
  for (const k in nodes) nodes[k].parents = [];
  for (const k in nodes) for (const n of nodes[k].next) nodes[n].parents.push(k);

  // assign types
  const order = Object.keys(nodes).sort((a, b) => nodes[a].r - nodes[b].r);
  for (const k of order) {
    const n = nodes[k];
    if (n.type) continue;
    if (n.r === 0) n.type = 'combat';
    else if (n.r === 6) n.type = 'treasure';
    else if (n.r === rows - 1) n.type = 'rest';
    else {
      const parentTypes = n.parents.map((p) => nodes[p].type);
      let t;
      for (let tries = 0; tries < 20; tries++) {
        t = rng.weighted([
          ['combat', 46], ['event', 22], ['elite', n.r >= 4 ? 13 : 0], ['rest', n.r >= 4 && n.r !== rows - 2 ? 10 : 0], ['shop', n.r >= 2 ? 9 : 0],
        ]);
        if (t !== 'combat' && t !== 'event' && parentTypes.includes(t)) continue;
        if (n.r === rows - 2 && t === 'rest') continue;
        break;
      }
      n.type = t;
    }
  }
  // guarantee at least one shop and two elites reachable
  const ensure = (type, count, minRow, maxRow) => {
    const have = order.filter((k) => nodes[k].type === type).length;
    let need = count - have;
    const cands = rng.shuffle(order.filter((k) => nodes[k].type === 'combat' && nodes[k].r >= minRow && nodes[k].r <= maxRow));
    while (need-- > 0 && cands.length) nodes[cands.pop()].type = type;
  };
  ensure('shop', 2, 3, 9);
  ensure('elite', 2, 5, 10);
  ensure('event', 3, 1, 10);

  const out = {};
  for (const k in nodes) out[k] = { id: k, r: nodes[k].r, c: nodes[k].c, type: nodes[k].type, next: [...nodes[k].next], parents: nodes[k].parents };
  // jitter for drawing
  for (const k in out) { out[k].jx = (rng() - 0.5) * 0.5; out[k].jy = (rng() - 0.5) * 0.35; }
  out[key(rows, 3)].jx = 0; out[key(rows, 3)].jy = 0;
  return out;
}

export function availableNodes(run) {
  if (!run.pos) return Object.values(run.map).filter((n) => n.r === 0).map((n) => n.id);
  return run.map[run.pos].next;
}

export function enterNode(run, id) {
  run.pos = id;
  run.visited.push(id);
  run.floor = run.map[id].r + 1;
  return run.map[id];
}

export function pickEncounter(run, kind) {
  const rng = run.rng;
  let pool;
  if (kind === 'elite') pool = ENCOUNTERS.elite;
  else if (kind === 'boss') pool = ENCOUNTERS.boss;
  else if (run.easyLeft > 0) { pool = ENCOUNTERS.easy; run.easyLeft--; } else pool = ENCOUNTERS.hard;
  const fresh = pool.filter((e) => !run.seenEncounters.includes(e.join('+')));
  const enc = rng.pick(fresh.length ? fresh : pool);
  run.seenEncounters.push(enc.join('+'));
  return enc;
}

// ------------------------------------------------------------------ rewards
export function rollRarity(run, kind) {
  const r = run.cardRng();
  const rare = (kind === 'elite' ? 0.1 : 0.04) + run.rareBonus;
  const unc = kind === 'elite' ? 0.4 : 0.33;
  if (r < rare) { run.rareBonus = 0; return 'rare'; }
  run.rareBonus = Math.min(0.25, run.rareBonus + 0.01);
  if (r < rare + unc) return 'uncommon';
  return 'common';
}

export function cardChoices(run, kind = 'normal', n = 3, forceRarity = null) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 100) {
    const rarity = forceRarity || rollRarity(run, kind);
    const pool = REWARD_POOL.filter((c) => c.rarity === rarity && !out.includes(c.id));
    if (!pool.length) continue;
    out.push(run.cardRng.pick(pool).id);
  }
  return out.map((id) => makeCard(id, false));
}

export function goldReward(run, kind) {
  if (kind === 'elite') return run.rng.int(30, 40);
  if (kind === 'boss') return 0;
  return run.rng.int(12, 19);
}

export function relicChoice(run, tierWeights = [['common', 55], ['uncommon', 33], ['rare', 12]]) {
  for (let i = 0; i < 20; i++) {
    const tier = run.rng.weighted(tierWeights);
    const pool = RELIC_POOL[tier].filter((r) => !run.relicsSeen.includes(r));
    if (pool.length) {
      const id = run.rng.pick(pool);
      run.relicsSeen.push(id);
      return id;
    }
  }
  const all = Object.keys(RELICS).filter((r) => !run.relicsSeen.includes(r) && RELICS[r].rarity !== 'starter');
  if (!all.length) return null;
  const id = run.rng.pick(all);
  run.relicsSeen.push(id);
  return id;
}

export function potionDrop(run, kind) {
  const chance = kind === 'elite' ? 0.55 : 0.4;
  if (run.rng() < chance) return run.rng.pick(POTION_POOL);
  return null;
}

export function addRelic(run, id) {
  if (!id || run.relics.includes(id)) return;
  run.relics.push(id);
  const r = RELICS[id];
  if (r.onPickup) r.onPickup(run);
}

export function addPotion(run, id) {
  if (run.potions.length >= run.potionSlots) return false;
  run.potions.push(id);
  return true;
}

// ------------------------------------------------------------------ shop
export function cardPrice(rarity, rng) {
  const base = { common: 50, uncommon: 75, rare: 145 }[rarity] || 50;
  return Math.round(base * (0.9 + rng() * 0.2));
}

export function makeShop(run) {
  const rng = run.rng;
  const pickType = (type, rarityOverride) => {
    const rarity = rarityOverride || rollRarity(run, 'normal');
    let pool = REWARD_POOL.filter((c) => c.type === type && c.rarity === rarity);
    if (!pool.length) pool = REWARD_POOL.filter((c) => c.type === type);
    return rng.pick(pool).id;
  };
  const ids = new Set();
  const cards = [];
  const types = ['attack', 'attack', 'skill', 'skill', 'power'];
  for (const t of types) {
    let id;
    for (let i = 0; i < 10; i++) { id = pickType(t, t === 'power' ? (rng() < 0.3 ? 'rare' : 'uncommon') : null); if (!ids.has(id)) break; }
    ids.add(id);
    cards.push({ card: makeCard(id), price: cardPrice(CARDS[id].rarity, rng), sold: false });
  }
  // one random sale
  const sale = rng.int(0, cards.length - 1);
  cards[sale].price = Math.floor(cards[sale].price / 2);
  cards[sale].sale = true;
  const relics = [];
  for (let i = 0; i < 3; i++) {
    const id = relicChoice(run, [['common', 50], ['uncommon', 35], ['rare', 15]]);
    if (!id) continue;
    const base = { common: 150, uncommon: 220, rare: 290 }[RELICS[id].rarity];
    relics.push({ id, price: Math.round(base * (0.92 + rng() * 0.16)), sold: false });
  }
  const potions = [];
  for (let i = 0; i < 3; i++) potions.push({ id: rng.pick(POTION_POOL), price: rng.int(48, 62), sold: false });
  return { cards, relics, potions, removePrice: 75 + 25 * run.removals, removeUsed: false };
}

export function removeCard(run, inst) {
  const i = run.deck.indexOf(inst);
  if (i >= 0) run.deck.splice(i, 1);
}

export function upgradeCard(run, inst) {
  if (canUpgrade(inst)) inst.upgraded = true;
}

export function restHeal(run) {
  const bonus = run.relics.reduce((a, id) => a + (RELICS[id].restBonus || 0), 0);
  const amt = Math.floor(run.maxHp * 0.3) + bonus;
  const before = run.hp;
  run.heal(amt);
  return run.hp - before;
}

export function deckSummary(run) {
  const counts = {};
  for (const c of run.deck) counts[c.id] = (counts[c.id] || 0) + 1;
  return counts;
}
