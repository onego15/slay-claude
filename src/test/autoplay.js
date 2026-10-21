// In-browser autopilot: plays the real UI end to end with the heuristic bot.
// Enabled with ?auto (optionally &god for an invulnerable smoke run, &strat=burn etc).
// Used for the browser smoke test and for recording the demo footage.
import { Bot } from '../ai/bot.js';
import { CARDS } from '../core/cards.js';
import { makeRng } from '../core/rng.js';
import { addTicker, clock } from '../gfx/clock.js';
import { canUpgrade } from '../core/cards.js';

export function startAutoplay(game, { strat = 'balanced', god = false, speed = 1, seed = 1 } = {}) {
  const bot = new Bot(strat, makeRng(seed));
  const log = (window.__autolog = []);
  const note = (m) => { log.push(`[${clock.t.toFixed(1)}] ${m}`); };
  let next = 0;
  let pending = null; // card being "aimed" before it is played
  const shopSeen = new WeakSet();
  const q = (s) => document.querySelector(s);
  const click = (e, why) => { if (e) { note(why || e.id || e.className); e.click(); return true; } return false; };
  const delay = (s) => { next = clock.rt + s / speed; };

  function battleStep(b) {
    const c = b.combat;
    if (god && c.player.hp < c.player.maxHp) c.player.hp = c.player.maxHp;
    if (b.hand.chooseMode) {
      const pick = bot.chooseHand(c.hand);
      note('choose ' + pick.id);
      b.hand.chooseMode(pick);
      return delay(0.5);
    }
    if (!b.hand.enabled || b.busy || c.over) return;
    if (pending) {
      const { inst, target } = pending;
      pending = null;
      b.hand.selected = null;
      if (c.hand.includes(inst) && c.canPlay(inst)) { note('play ' + inst.id); b.playCard(inst, target && target.alive ? target : null); }
      return delay(0.35);
    }
    const pi = bot.potionToUse(c);
    if (pi >= 0) {
      const id = c.run.potions[pi];
      note('potion ' + id);
      b.busy = true;
      b.setInput(false);
      c.usePotion(pi, c.livingEnemies()[0]).then(() => { b.game.refreshTop(); b.afterAction(); });
      return delay(0.5);
    }
    const best = bot.bestPlay(c);
    if (!best) { note('end turn'); b.endTurn(); return delay(0.6); }
    const [inst, target] = best;
    const hc = b.hand.find(inst);
    if (hc) b.hand.selected = hc;
    if (target) {
      const hud = b.huds.get(target);
      if (hud && hud.box) {
        const p = { x: (hud.box.x0 + hud.box.x1) / 2, y: (hud.box.y0 + hud.box.y1) / 2 };
        b.hand.pointer = p;
        b.updateHoverEnemy(p);
      }
    }
    pending = { inst, target };
    delay(CARDS[inst.id].target === 'enemy' ? 0.45 : 0.3);
  }

  function screenStep() {
    const run = game.run;
    if (q('#end')) { window.__autoDone = window.__ended; return; }
    if (q('#title')) return click(q('#t-start'), 'start');
    if (q('#intro')) return click(q('#go'), 'go');
    if (q('#cardchoice')) {
      const els = [...document.querySelectorAll('#cardchoice .card')];
      const pick = bot.pickReward(els.map((e) => e._inst), run.deck);
      const e = els.find((x) => x._inst === pick);
      return e ? click(e, 'take ' + pick.id) : click(q('#cc-skip'), 'skip card');
    }
    if (q('#pick')) {
      const slots = [...document.querySelectorAll('#pick .cardslot')];
      const title = q('#pick .ttl').textContent;
      let best = slots[0], bv = -Infinity;
      for (const s of slots) {
        const inst = s.querySelector('.card')._inst;
        let v = bot.cardValue(inst.id, []);
        if (title.includes('除去') || title.includes('失う') || title.includes('捧げ')) v = -v + (['regret', 'ash', 'mud'].includes(inst.id) ? 100 : 0) + (inst.id === 'strike' ? 20 : 0);
        if (v > bv) { bv = v; best = s; }
      }
      return click(best, 'pick');
    }
    if (q('#reward')) {
      const items = [...document.querySelectorAll('#reward .ritem:not(.taken)')];
      const it = items.find((e) => !e.dataset.tried);
      if (it) { it.dataset.tried = 1; return click(it, 'reward ' + it.textContent.trim()); }
      return click(q('#r-next'), 'reward done');
    }
    if (q('#rest .restopts')) {
      const hurt = run.hp / run.maxHp < 0.6 || !run.deck.some(canUpgrade);
      return click(q(hurt ? '#rs-heal' : '#rs-up'), hurt ? 'rest' : 'smith');
    }
    if (q('#shop')) {
      const s = q('#shop');
      if (!shopSeen.has(s)) {
        shopSeen.add(s);
        // buy the best affordable card the bot likes
        const cards = [...s.querySelectorAll('.cardslot .card')].map((e) => ({ e, v: bot.cardValue(e._inst.id, run.deck) }));
        cards.sort((a, b) => b.v - a.v);
        const price = (e) => Number(e.parentElement.querySelector('.price').textContent.replace(/\D/g, ''));
        const buy = cards.find((x) => x.v >= 6 && price(x.e) <= run.gold);
        if (buy) return click(buy.e, 'buy ' + buy.e._inst.id);
      }
      return click(q('#sh-leave'), 'leave shop');
    }
    if (q('#event')) {
      const opts = [...document.querySelectorAll('#event .btn.choice:not([disabled])')];
      if (opts.length) return click(opts[Math.floor(bot.rng() * opts.length)], 'event option');
      return;
    }
    if (q('#treasure')) return click(q('#tr-open') || q('#tr-next'), 'treasure');
    const map = q('#map');
    if (map && !q('#map-close')) {
      const avail = [...map.querySelectorAll('.mnode.avail')];
      if (!avail.length) return;
      const ids = avail.map((e) => e._nid);
      const pick = bot.choosePath(run, ids);
      return click(avail[ids.indexOf(pick)], 'map ' + run.map[pick].type);
    }
  }

  const stop = addTicker(() => {
    if (clock.rt < next || window.__autoDone) return;
    delay(0.25);
    try {
      if (game.battle && !game.battle.ended) battleStep(game.battle);
      else screenStep();
    } catch (err) {
      note('ERROR ' + err.message);
      console.error(err);
    }
  });
  return stop;
}
