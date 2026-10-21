// Headless balance simulator: plays full runs with heuristic bots and reports stats.
// usage: node sim/simulate.mjs [runsPerStrategy=200]
import { makeRng } from '../src/core/rng.js';
import { CARDS, makeCard, canUpgrade } from '../src/core/cards.js';
import { RELICS } from '../src/core/relics.js';
import { Combat } from '../src/core/combat.js';
import {
  createRun, availableNodes, enterNode, pickEncounter, cardChoices, goldReward, relicChoice, potionDrop,
  addRelic, addPotion, makeShop, removeCard, upgradeCard, restHeal,
} from '../src/core/run.js';
import { pickEvent } from '../src/core/events.js';
import { Bot } from '../src/ai/bot.js';

const N = Number(process.argv[2] || 200);
const STRATS = ['balanced', 'burn', 'radiance', 'block', 'strength', 'exhaust', 'random'];

async function fight(run, bot, enc, kind, log) {
  const c = new Combat({ run, enemyIds: enc, rng: run.combatRng, kind, hooks: { chooseHand: async (cards) => bot.chooseHand(cards) } });
  const hpStart = run.hp;
  await c.start();
  let turns = 0;
  while (!c.over && turns < 60) {
    await bot.playTurn(c);
    if (c.over) break;
    await c.endTurn();
    turns++;
  }
  if (!c.over) { c.over = 'defeat'; log.stalemate = true; } // stalemate counts as loss
  run.hp = Math.max(0, c.player.hp);
  log.fights.push({ enc: enc.join('+'), kind, hpStart, floor: run.floor, turns: c.turn, dmgTaken: c.stats.damageTaken, result: c.over });
  for (const [k, v] of Object.entries(c.stats.damageByCard)) log.cardDamage[k] = (log.cardDamage[k] || 0) + v;
  for (const [k, v] of Object.entries(c.stats.plays)) log.cardPlays[k] = (log.cardPlays[k] || 0) + v;
  if (c.over === 'victory') {
    for (const id of run.relics) if (RELICS[id].onCombatEnd) RELICS[id].onCombatEnd(run);
    return true;
  }
  return false;
}

async function rewards(run, bot, kind) {
  run.gold += goldReward(run, kind);
  const p = potionDrop(run, kind);
  if (p) addPotion(run, p);
  if (kind === 'elite') addRelic(run, relicChoice(run));
  const pick = bot.pickReward(cardChoices(run, kind), run.deck);
  if (pick) run.deck.push(pick);
}

const choosePath = (run, bot, opts) => bot.choosePath(run, opts);

async function playRun(seed, strategy) {
  const run = createRun(seed);
  const bot = new Bot(strategy, makeRng(seed ^ 1234));
  const log = { seed, strategy, fights: [], cardDamage: {}, cardPlays: {}, result: 'defeat', floor: 0, relics: [], deck: [] };
  const api = {
    chooseDeckCard: async (filter) => {
      const cands = run.deck.filter(filter);
      return cands.find((c) => c.id === 'regret') || cands.find((c) => c.id === 'strike') || cands[0];
    },
    cardReward: async (cards) => { const p = bot.pickReward(cards, run.deck) || cards[0]; run.deck.push(p); },
    combat: async (enc, extra) => {
      const won = await fight(run, bot, enc, 'normal', log);
      if (won) { await rewards(run, bot, 'normal'); run.gold += extra.bonusGold || 0; if (extra.bonusRelic) addRelic(run, relicChoice(run)); }
      return won;
    },
    gainRelic: (id) => addRelic(run, id),
    gainPotion: (id) => addPotion(run, id),
  };
  while (true) {
    const opts = availableNodes(run);
    if (!opts.length) break;
    const node = enterNode(run, choosePath(run, bot, opts));
    log.floor = run.floor;
    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      const kind = node.type === 'combat' ? 'normal' : node.type;
      const won = await fight(run, bot, pickEncounter(run, kind), kind, log);
      if (!won) break;
      if (node.type === 'boss') { log.result = 'victory'; break; }
      await rewards(run, bot, kind);
    } else if (node.type === 'rest') {
      const up = run.deck.filter(canUpgrade);
      if (run.hp / run.maxHp < 0.55 || !up.length) restHeal(run);
      else {
        const best = up.sort((a, b) => bot.cardValue(b.id, []) - bot.cardValue(a.id, []))[0];
        upgradeCard(run, best);
      }
    } else if (node.type === 'shop') {
      const shop = makeShop(run);
      const junk = run.deck.find((c) => c.id === 'regret') || run.deck.find((c) => c.id === 'strike');
      if (junk && run.gold >= shop.removePrice) { run.gold -= shop.removePrice; removeCard(run, junk); run.removals++; }
      for (const r of shop.relics) if (run.gold >= r.price && bot.rng() < 0.7) { run.gold -= r.price; addRelic(run, r.id); }
      for (const it of shop.cards.sort((a, b) => bot.cardValue(b.card.id, run.deck) - bot.cardValue(a.card.id, run.deck))) {
        if (run.gold >= it.price && bot.cardValue(it.card.id, run.deck) >= 8) { run.gold -= it.price; run.deck.push(it.card); }
      }
    } else if (node.type === 'treasure') {
      addRelic(run, relicChoice(run, [['common', 50], ['uncommon', 37], ['rare', 13]]));
      run.gold += run.rng.int(25, 45);
    } else if (node.type === 'event') {
      const ev = pickEvent(run);
      const options = ev.options.filter((o) => !o.can || o.can(run));
      const o = strategy === 'random' ? bot.rng.pick(options) : options[Math.floor(bot.rng() * options.length)];
      await o.resolve(run, api);
      if (run.hp <= 0) break;
    }
  }
  log.relics = run.relics.slice();
  log.deck = run.deck.map((c) => c.id + (c.upgraded ? '+' : ''));
  log.hp = run.hp;
  return log;
}

const results = [];
const t0 = Date.now();
const crashes = [];
for (const s of STRATS) {
  for (let i = 0; i < N; i++) {
    try { results.push(await playRun(1000 + i * 7919, s)); } catch (e) { crashes.push(`${s}#${i}: ${e.stack}`); }
  }
}
const ms = Date.now() - t0;

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');
console.log(`Simulated ${results.length} runs in ${ms}ms`);
console.log('\n== Win rate by strategy');
for (const s of STRATS) {
  const rs = results.filter((r) => r.strategy === s);
  const w = rs.filter((r) => r.result === 'victory').length;
  const avgFloor = (rs.reduce((a, r) => a + r.floor, 0) / rs.length).toFixed(1);
  console.log(`${s.padEnd(10)} win ${pct(w, rs.length).padStart(6)}  avgFloor ${avgFloor}`);
}

console.log('\n== Death causes (encounter: deaths / attempts, avg dmg taken, avg turns)');
const enc = {};
for (const r of results) for (const f of r.fights) {
  const e = (enc[f.enc] = enc[f.enc] || { n: 0, d: 0, dmg: 0, turns: 0, hp: 0, kind: f.kind });
  e.hp += f.hpStart; e.n++; e.dmg += f.dmgTaken; e.turns += f.turns; if (f.result !== 'victory') e.d++;
}
for (const [k, e] of Object.entries(enc).sort((a, b) => b[1].d / b[1].n - a[1].d / a[1].n)) {
  console.log(`${k.padEnd(36)} ${e.kind.padEnd(7)} ${String(e.d).padStart(4)}/${String(e.n).padEnd(5)} dmg ${(e.dmg / e.n).toFixed(1).padStart(5)}  turns ${(e.turns / e.n).toFixed(1)}  hpIn ${(e.hp / e.n).toFixed(0)}`);
}

console.log('\n== Card win correlation (runs containing card: win rate)');
const cardRuns = {};
for (const r of results.filter((r) => r.strategy !== 'random')) {
  const ids = new Set(r.deck.map((d) => d.replace('+', '')));
  for (const id of ids) { const x = (cardRuns[id] = cardRuns[id] || { n: 0, w: 0 }); x.n++; if (r.result === 'victory') x.w++; }
}
const rows = Object.entries(cardRuns).filter(([id]) => CARDS[id].rarity !== 'starter').sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n);
for (const [id, x] of rows) console.log(`${CARDS[id].name.padEnd(8, '　')} ${id.padEnd(16)} ${pct(x.w, x.n).padStart(6)} (${x.n})`);

console.log('\n== Relic win correlation');
const relRuns = {};
for (const r of results.filter((r) => r.strategy !== 'random')) for (const id of r.relics) { const x = (relRuns[id] = relRuns[id] || { n: 0, w: 0 }); x.n++; if (r.result === 'victory') x.w++; }
for (const [id, x] of Object.entries(relRuns).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n)) console.log(`${RELICS[id].name.padEnd(8, '　')} ${pct(x.w, x.n).padStart(6)} (${x.n})`);

const wins = results.filter((r) => r.result === 'victory');
console.log('\nAvg final deck size (wins):', wins.length ? (wins.reduce((a, r) => a + r.deck.length, 0) / wins.length).toFixed(1) : '-');
console.log('Avg fights per run:', (results.reduce((a, r) => a + r.fights.length, 0) / results.length).toFixed(1));
console.log('Avg turns per fight:', (results.reduce((a, r) => a + r.fights.reduce((b, f) => b + f.turns, 0), 0) / results.reduce((a, r) => a + r.fights.length, 0)).toFixed(1));

// ---- invariants (used as an automated test: exits non-zero on failure)
console.log('\n== Checks');
const stale = results.filter((r) => r.stalemate).length;
const totalWins = results.filter((r) => r.result === 'victory').length;
const allPlays = {};
for (const r of results) for (const k of Object.keys(r.cardPlays || {})) allPlays[k] = 1;
const neverPlayed = Object.keys(CARDS).filter((id) => !CARDS[id].unplayable && !['ash', 'mud', 'regret'].includes(id) && !allPlays[id]);
const checks = [
  ['no engine exceptions', crashes.length === 0, crashes.slice(0, 3).join('\n')],
  ['no stalemated fights (60-turn cap)', stale === 0, `${stale} runs`],
  ['ending reachable (some runs win)', totalWins > 0, `${totalWins} wins`],
  ['every playable card was played by the bots', neverPlayed.length === 0, neverPlayed.join(',')],
];
let failed = 0;
for (const [name, ok, info] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info || ''}`); if (!ok) failed++; }
process.exitCode = failed ? 1 : 0;
