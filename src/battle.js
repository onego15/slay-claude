// Battle controller: wires the combat engine to the HD-2D stage, the hand UI and the
// animation director (camera moves, hit-stop, particles, damage numbers).
import * as THREE from 'three';
import { Combat } from './core/combat.js';
import { CARDS } from './core/cards.js';
import { STATUSES } from './core/statuses.js';
import { POTIONS, RELICS } from './core/relics.js';
import { Actor } from './gfx/actor.js';
import { clock, wait, tween, ease, hitstop, slowmo, addTicker } from './gfx/clock.js';
import * as FX from './gfx/fx.js';
import { iconURL } from './gfx/icons.js';
import { el, toDesign, bindTip, statusTipItems, showTip, hideTip, eventToDesign } from './ui/dom.js';
import { Hand } from './ui/hand.js';
import { cardElement } from './ui/cardview.js';
import { sfx, playMusic } from './audio/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Enemy formation (x, z) by count
function formation(n, boss) {
  if (boss) return [[3.0, -0.9], [0.9, 0.5], [5.2, 0.5], [1.5, -1.6], [4.6, -1.6]];
  return [
    [],
    [[2.9, 0.0]],
    [[1.7, 0.1], [4.3, -0.2]],
    [[1.2, 0.2], [3.2, -0.3], [5.2, 0.3]],
    [[0.9, 0.3], [2.6, -0.4], [4.2, 0.2], [5.7, -0.4]],
    [[0.7, 0.3], [2.1, -0.5], [3.5, 0.3], [4.9, -0.5], [6.1, 0.3]],
  ][Math.min(5, n)];
}

const INTENT_ICON = {
  attack: 'i_attack', defend: 'i_defend', buff: 'i_buff', debuff: 'i_debuff', attack_debuff: 'i_attack', attack_defend: 'i_attack',
  defend_buff: 'i_defend', summon: 'i_summon', charge: 'i_charge', sleep: 'i_sleep',
};
const INTENT_DESC = {
  attack: (i) => `${i.dmg}${i.hits > 1 ? `×${i.hits}` : ''}ダメージの攻撃を行う。`,
  attack_debuff: (i) => `${i.dmg}${i.hits > 1 ? `×${i.hits}` : ''}ダメージの攻撃と、弱体化効果を与える。`,
  defend: () => 'ブロックを得る。',
  defend_buff: () => 'ブロックを得て、能力を高める。',
  buff: () => '能力を高める。',
  debuff: () => '弱体化効果を与える。',
  summon: () => '仲間を呼び出す。',
  charge: () => '何か強大な力を溜めている……！ 次のターンに備えよ。',
  sleep: () => '眠っている。',
};

export class Battle {
  constructor(game, run, enemyIds, kind) {
    this.game = game;
    this.world = game.world;
    this.run = run;
    this.kind = kind;
    this.enemyIds = enemyIds;
    this.actors = new Map(); // entity -> actor
    this.huds = new Map();
    this.hoverEnemy = null;
    this.potionTargeting = null;
    this.busy = false;
    this.ended = false;
  }

  // ---------------------------------------------------------------- setup
  async start() {
    const g = this.game;
    const stage = this.kind === 'boss' ? 'summit' : this.kind === 'elite' || this.run.floor > 6 ? 'chapel' : 'forest';
    g.setStage(stage);
    this.stage = stage;
    playMusic(this.kind === 'boss' ? 'boss' : this.kind === 'elite' ? 'elite' : 'battle');
    this.combat = new Combat({
      run: this.run, enemyIds: this.enemyIds, rng: this.run.combatRng, kind: this.kind === 'boss' ? 'boss' : this.kind,
      hooks: { fx: (t, d) => this.fx(t, d), chooseHand: (cards, prompt) => this.chooseHand(cards, prompt) },
    });
    this.buildUI();
    // player actor
    this.world.clearActors();
    this.player = this.world.addActor(new Actor('player'), -3.4, 0.25);
    this.player.idle();
    this.actors.set(this.combat.player, this.player);
    this.orbs = new FX.RadianceOrbs(this.world);
    this.lanternTick = addTicker(() => {
      const p = this.player.group.position;
      this.world.lantern.position.set(p.x - 0.1 + this.player.offset.x, 1.25 + this.player.offset.y, p.z + 1.4);
      this.orbs.anchor.set(p.x + this.player.offset.x - 0.35, 0.9 + this.player.offset.y, p.z + 0.1);
    });
    this.world.lantern.intensity = 3.5;
    this.hudTick = addTicker(() => this.updateHUDPositions());
    this.done = new Promise((res) => { this.resolveDone = res; });
    await this.combat.start();
    return this.done;
  }

  buildUI() {
    const root = this.game.uiRoot;
    this.ui = el('div', '', '', { id: 'battle-ui' });
    root.appendChild(this.ui);
    this.hudLayer = el('div', 'np', '', { id: 'entity-hud' });
    this.hudLayer.classList.remove('np');
    this.ui.appendChild(this.hudLayer);
    this.energyEl = el('div', '', `<div class="orb"></div><span>3/3</span>`, { id: 'energy' });
    this.energyEl.querySelector('.orb').style.backgroundImage = `url(${iconURL('energy', { size: 96 })})`;
    bindTip(this.energyEl, () => [{ title: 'エネルギー', body: 'カードを使うために消費する。ターン開始時に回復する。', icon: 'energy' }]);
    this.ui.appendChild(this.energyEl);
    const pile = (id, icon, title, getCards) => {
      const p = el('div', 'pile', `<img class="pix" src="${iconURL(icon, { size: 48 })}"><b>0</b>`, { id });
      p.addEventListener('click', () => { if (!this.choosing) this.game.showPile(title, getCards()); });
      bindTip(p, () => [{ title, body: 'クリックで中身を確認' }]);
      this.ui.appendChild(p);
      return p;
    };
    this.drawEl = pile('drawpile', 'drawpile', '山札', () => [...this.combat.drawPile].sort((a, b) => CARDS[a.id].name.localeCompare(CARDS[b.id].name)));
    this.discardEl = pile('discardpile', 'discardpile', '捨て札', () => [...this.combat.discard]);
    this.exhaustEl = pile('exhaustpile', 'exhaustpile', '焼却済み', () => [...this.combat.exhaust]);
    this.endBtn = el('button', 'btn', 'ターン終了', { id: 'endturn' });
    this.endBtn.addEventListener('click', () => this.endTurn());
    this.ui.appendChild(this.endBtn);
    this.banner = el('div', 'np', '', { id: 'banner' });
    this.ui.appendChild(this.banner);
    this.moveName = el('div', 'np', '', { id: 'movename' });
    this.ui.appendChild(this.moveName);
    this.promptEl = el('div', 'np', '', { id: 'prompt' });
    this.ui.appendChild(this.promptEl);
    this.fxLayer = el('div', 'np', '', { id: 'fx' });
    this.ui.appendChild(this.fxLayer);
    this.hand = new Hand(this.ui, this);
    this.hoverHandler = (e) => this.updateHoverEnemy(eventToDesign(e));
    this.ui.addEventListener('pointermove', this.hoverHandler);
    this.game.onPotionClick = (i) => this.usePotion(i);
  }

  destroy() {
    this.hand.destroy();
    this.hudTick();
    this.lanternTick();
    this.orbs.dispose();
    this.ui.remove();
    this.game.onPotionClick = null;
  }

  toast(text) {
    const t = el('div', 'toast', text);
    this.ui.appendChild(t);
    tween(1100, (k) => { t.style.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2; }, { real: true }).then(() => t.remove());
  }

  // ---------------------------------------------------------------- entity HUD
  makeHUD(ent) {
    const h = el('div', 'ehud');
    const isP = ent.isPlayer;
    h.innerHTML = `
      ${isP ? '' : `<div class="intent"></div>`}
      <div class="hpwrap">
        <div class="blockbadge hidden" style="background-image:url(${iconURL('block', { size: 48 })})"><span></span></div>
        <div class="hpbar"><div class="lag"></div><div class="burnf"></div><div class="fill"></div><div class="txt"></div></div>
        <div class="statuses"></div>
      </div>
      <div class="ename">${isP ? '' : ent.name}</div>`;
    this.hudLayer.appendChild(h);
    const hud = { el: h, ent, lag: ent.hp, statusKeys: '' };
    if (!isP) {
      const it = h.querySelector('.intent');
      bindTip(it, () => {
        const i = this.combat.intentInfo(ent);
        if (!i) return [];
        return [{ title: `${ent.name}の行動予告：${i.name}`, body: (INTENT_DESC[i.kind] || (() => ''))(i), icon: i.heavy ? 'i_heavy' : INTENT_ICON[i.kind] }];
      });
    }
    bindTip(h.querySelector('.hpwrap'), () => statusTipItems(ent.statuses).length ? statusTipItems(ent.statuses) : [{ title: isP ? '灯守' : ent.name, body: `HP ${ent.hp}/${ent.maxHp}` }]);
    this.huds.set(ent, hud);
    this.refreshHUD(ent);
    return hud;
  }

  refreshHUD(ent) {
    const hud = this.huds.get(ent);
    if (!hud) return;
    const h = hud.el;
    const pct = Math.max(0, ent.hp / ent.maxHp) * 100;
    h.querySelector('.fill').style.width = pct + '%';
    const burn = ent.statuses.burn || 0;
    const bp = Math.min(pct, (burn / ent.maxHp) * 100);
    const bf = h.querySelector('.burnf');
    bf.style.left = (pct - bp) + '%'; bf.style.width = bp + '%';
    h.querySelector('.txt').textContent = `${Math.max(0, ent.hp)}/${ent.maxHp}`;
    const bb = h.querySelector('.blockbadge');
    bb.classList.toggle('hidden', ent.block <= 0);
    bb.querySelector('span').textContent = ent.block;
    h.querySelector('.hpbar').classList.toggle('blocked', ent.block > 0);
    // statuses
    const keys = Object.entries(ent.statuses).filter(([k]) => STATUSES[k]).map(([k, v]) => k + v).join(',');
    if (keys !== hud.statusKeys) {
      const prev = new Set(hud.statusKeys.split(','));
      hud.statusKeys = keys;
      const box = h.querySelector('.statuses');
      box.innerHTML = '';
      for (const [k, v] of Object.entries(ent.statuses)) {
        const S = STATUSES[k];
        if (!S) continue;
        const showN = !['bulwark', 'undying', 'stoneskin'].includes(k);
        const s = el('div', 'st' + (prev.has(k + v) ? '' : ' pop'), `<img class="pix" src="${iconURL(S.icon, { size: 32 })}">${showN ? `<b>${v}</b>` : ''}`);
        box.appendChild(s);
      }
    }
    if (ent.isPlayer) this.orbs.set(ent.statuses.radiance || 0);
    else this.refreshIntent(ent);
  }

  refreshIntent(e) {
    const hud = this.huds.get(e);
    if (!hud) return;
    const it = hud.el.querySelector('.intent');
    if (!e.alive || this.combat.over) { it.innerHTML = ''; return; }
    const i = this.combat.intentInfo(e);
    if (!i) { it.innerHTML = ''; return; }
    const icon = i.heavy ? 'i_heavy' : INTENT_ICON[i.kind] || 'i_buff';
    it.className = 'intent' + (i.dmg !== undefined ? ' attack' : '') + (i.heavy ? ' heavy' : '') + (i.ultimate || i.kind === 'charge' ? ' ultimate' : '');
    let extra = '';
    if (i.kind === 'attack_debuff') extra = `<img class="pix" style="width:22px;height:22px;margin-left:-6px" src="${iconURL('i_debuff', { size: 32 })}">`;
    if (i.kind === 'defend_buff') extra = `<img class="pix" style="width:22px;height:22px;margin-left:-6px" src="${iconURL('i_buff', { size: 32 })}">`;
    it.innerHTML = `<img class="pix" src="${iconURL(icon, { size: 48 })}">${i.dmg !== undefined ? `<span>${i.dmg}${i.hits > 1 ? `×${i.hits}` : ''}</span>` : ''}${extra}`;
  }

  updateHUDPositions() {
    if (!this.combat) return;
    const t = clock.t;
    for (const [ent, hud] of this.huds) {
      const a = this.actors.get(ent);
      if (!a) continue;
      const foot = a.footPoint();
      const fs = this.world.toScreen(foot);
      const fd = toDesign(fs.x, fs.y);
      const top = a.topPoint();
      top.y += a.pivot.position.y;
      const ts = toDesign(this.world.toScreen(top).x, this.world.toScreen(top).y);
      hud.el.style.left = fd.x + 'px';
      hud.el.style.top = fd.y + 12 + 'px';
      const it = hud.el.querySelector('.intent');
      if (it) it.style.top = (ts.y - fd.y - 62 + Math.sin(t * 3 + ent.uid) * 3) + 'px';
      const nm = hud.el.querySelector('.ename');
      nm.style.top = '50px';
      // hit box for targeting
      const left = this.world.toScreen(foot.clone().add(V(-a.size.w * 0.38, 0, 0)));
      const right = this.world.toScreen(foot.clone().add(V(a.size.w * 0.38, 0, 0)));
      const l = toDesign(left.x, left.y), r = toDesign(right.x, right.y);
      hud.box = { x0: Math.min(l.x, r.x), x1: Math.max(l.x, r.x), y0: ts.y - 10, y1: fd.y + 40 };
      hud.el.classList.toggle('targeted', ent === this.hoverEnemy);
      hud.el.style.opacity = ent.alive || ent.isPlayer ? 1 : Math.max(0, hud.el.style.opacity - 0.05);
    }
  }

  updateHoverEnemy(p) {
    let best = null;
    const needs = (this.hand.drag && CARDS[this.hand.drag.card.inst.id].target === 'enemy') || (this.hand.selected && CARDS[this.hand.selected.inst.id].target === 'enemy') || this.potionTargeting;
    if (needs) {
      for (const [ent, hud] of this.huds) {
        if (ent.isPlayer || !ent.alive || !hud.box) continue;
        const b = hud.box;
        if (p.x >= b.x0 - 10 && p.x <= b.x1 + 10 && p.y >= b.y0 && p.y <= b.y1) best = ent;
      }
    }
    if (best !== this.hoverEnemy) {
      this.hoverEnemy = best;
      for (const [ent] of this.huds) {
        const a = this.actors.get(ent);
        if (a && !ent.isPlayer) a.uniforms.uTint.value.setScalar(ent === best ? 1.35 : 1);
      }
      this.hand.refresh();
    }
  }

  setEnergy() {
    const c = this.combat;
    this.energyEl.querySelector('span').textContent = `${c.energy}/${c.maxEnergy}`;
    this.energyEl.querySelector('.orb').classList.toggle('empty', c.energy === 0);
  }
  setPiles() {
    this.drawEl.querySelector('b').textContent = this.combat.drawPile.length;
    this.discardEl.querySelector('b').textContent = this.combat.discard.length;
    this.exhaustEl.querySelector('b').textContent = this.combat.exhaust.length;
    this.exhaustEl.classList.toggle('hidden', this.combat.exhaust.length === 0);
  }
  setInput(on) {
    this.hand.enabled = on;
    this.endBtn.disabled = !on;
    this.endBtn.classList.toggle('enemy', !on);
    this.endBtn.textContent = on ? 'ターン終了' : '敵のターン';
    if (on) this.checkNudge();
  }
  checkNudge() {
    const c = this.combat;
    const any = c.hand.some((h) => c.canPlay(h) && !CARDS[h.id].unplayable);
    this.endBtn.classList.toggle('nudge', !any && this.hand.enabled);
  }

  // ---------------------------------------------------------------- input → engine
  async playCard(inst, target) {
    if (this.busy || this.combat.over) return;
    this.busy = true;
    this.setInput(false);
    this.endBtn.textContent = 'ターン終了';
    await this.combat.playCard(inst, target);
    this.afterAction();
  }

  async usePotion(i) {
    if (this.busy || this.combat.over || !this.hand.enabled) return;
    const id = this.run.potions[i];
    if (!id) return;
    const p = POTIONS[id];
    if (p.target === 'enemy') {
      const r = this.game.potionRect(i);
      this.potionTargeting = { i, x: r.x, y: r.y };
      return;
    }
    this.busy = true;
    this.setInput(false);
    await this.combat.usePotion(i, null);
    this.game.refreshTop();
    this.afterAction();
  }
  async finishPotionTarget() {
    const pt = this.potionTargeting;
    this.potionTargeting = null;
    if (!pt || !this.hoverEnemy) return;
    this.busy = true;
    this.setInput(false);
    await this.combat.usePotion(pt.i, this.hoverEnemy);
    this.game.refreshTop();
    this.afterAction();
  }

  afterAction() {
    this.busy = false;
    if (this.combat.over) return this.finish();
    this.setInput(true);
    this.hand.refresh();
    this.setEnergy();
  }

  async endTurn() {
    if (this.busy || this.combat.over || !this.hand.enabled) return;
    this.busy = true;
    this.hand.cancel();
    this.setInput(false);
    sfx('click');
    await this.combat.endTurn();
    this.busy = false;
    if (this.combat.over) return this.finish();
    this.setInput(true);
    this.hand.refresh();
  }

  async chooseHand(cards, prompt) {
    this.promptEl.textContent = prompt;
    this.choosing = true;
    const res = await new Promise((resolve) => { this.hand.chooseMode = (inst) => resolve(inst); });
    this.hand.chooseMode = null;
    this.choosing = false;
    this.promptEl.textContent = '';
    return res;
  }

  async finish() {
    if (this.ended) return;
    this.ended = true;
    this.setInput(false);
    const c = this.combat;
    this.run.hp = Math.max(0, c.player.hp);
    if (c.over === 'victory') {
      for (const id of this.run.relics) if (RELICS[id].onCombatEnd) RELICS[id].onCombatEnd(this.run);
      this.run.stats.kills += c.enemies.length;
    }
    for (const [k, v] of Object.entries(c.stats.plays)) this.run.stats.cardsPlayed += v;
    this.run.stats.damageDealt += Object.values(c.stats.damageByCard).reduce((a, b) => a + b, 0);
    await wait(c.over === 'victory' ? 500 : 900);
    // fly remaining hand away
    for (const hc of this.hand.cards) tween(300, (k) => { hc.alpha = 1 - k; hc.ty += 4; });
    if (c.over === 'victory') {
      this.player.play('cast', { hold: true });
      FX.auraBurst(this.world, this.player, { color: FX.COLORS.light, size: 3 });
      this.world.focusOn(this.player.centerPoint(), { zoom: 0.75, lambda: 3 });
      sfx('victory');
      await this.showBanner(this.kind === 'boss' ? '灯王を討ち果たした' : '勝利', this.kind === 'boss' ? '' : '', 1400);
    }
    this.game.refreshTop();
    this.destroy();
    this.resolveDone(c.over);
  }

  // ---------------------------------------------------------------- presentation helpers
  async showBanner(text, sub = '', ms = 900, enemy = false) {
    const b = this.banner;
    b.className = 'np' + (enemy ? ' enemy' : '');
    b.innerHTML = `<div>${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
    await tween(180, (k) => { b.style.opacity = k; b.style.transform = `scaleY(${0.3 + k * 0.7})`; }, { real: true });
    await wait(ms);
    await tween(220, (k) => { b.style.opacity = 1 - k; }, { real: true });
  }

  number(ent, text, cls = '', { dx = 0, dy = 0, big = false } = {}) {
    const a = this.actors.get(ent);
    if (!a) return;
    const p = a.centerPoint();
    p.y += a.size.h * 0.25;
    const s = this.world.toScreen(p);
    const d = toDesign(s.x, s.y);
    const n = el('div', `dmg ${cls}${big ? ' big' : ''}`, text);
    const x0 = d.x + dx + (Math.random() - 0.5) * 30, y0 = d.y + dy;
    n.style.left = x0 + 'px'; n.style.top = y0 + 'px';
    this.fxLayer.appendChild(n);
    const vx = (Math.random() - 0.5) * 60;
    tween(900, (k, raw) => {
      const pop = raw < 0.15 ? 1 + (1 - raw / 0.15) * 0.8 : 1;
      n.style.transform = `translate(-50%, -50%) scale(${pop})`;
      n.style.left = x0 + vx * raw + 'px';
      n.style.top = y0 - 60 * k + raw * raw * 40 + 'px';
      n.style.opacity = raw > 0.7 ? 1 - (raw - 0.7) / 0.3 : 1;
    }, { easing: ease.outCubic, real: true }).then(() => n.remove());
  }

  showMove(e, name) {
    const a = this.actors.get(e);
    const p = a.topPoint();
    const s = this.world.toScreen(p);
    const d = toDesign(s.x, s.y);
    const m = this.moveName;
    m.textContent = name;
    m.style.left = d.x + 'px';
    m.style.top = Math.max(60, d.y - 110) + 'px';
    tween(1000, (k, raw) => { m.style.opacity = raw < 0.15 ? raw / 0.15 : raw > 0.8 ? (1 - raw) / 0.2 : 1; }, { real: true });
  }

  async flyCard(inst, from, to, { dur = 350, scale0 = 1, scale1 = 0.3, rot = 0, burn = false, startEl = null } = {}) {
    const e = startEl || cardElement(inst, {});
    e.style.pointerEvents = 'none';
    if (!startEl) this.fxLayer.appendChild(e);
    if (burn) e.classList.add('burning');
    await tween(dur, (k) => {
      const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 60;
      const s = scale0 + (scale1 - scale0) * k;
      e.style.transform = `translate(${x - 75}px, ${y - 105}px) rotate(${rot * k}deg) scale(${s})`;
      e.style.opacity = burn ? 1 - k : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
    }, { easing: ease.inOutCubic, real: true });
    e.remove();
  }

  // ---------------------------------------------------------------- the director
  async fx(type, d) {
    const W = this.world;
    const c = this.combat;
    switch (type) {
      case 'combatStart': {
        for (const e of c.enemies) this.spawnEnemyActor(e, false);
        this.makeHUD(c.player);
        this.setPiles();
        this.setEnergy();
        // intro: camera glides in
        const isBoss = this.kind === 'boss';
        W.cam.pos.copy(W.camBase.pos).add(V(isBoss ? 4 : -3, isBoss ? 3 : 1.2, isBoss ? 6 : 4));
        W.cam.look.copy(W.camBase.look).add(V(isBoss ? 2 : 1, isBoss ? 2.5 : 0.5, 0));
        W.camTarget.lambda = isBoss ? 0.9 : 2.2;
        for (const e of c.enemies) { const a = this.actors.get(e); a.uniforms.uDissolve.value = 0.9; tween(700, (k) => { a.uniforms.uDissolve.value = 0.9 * (1 - k); }); }
        if (isBoss) {
          this.game.letterbox(true);
          W.focusOn(this.actors.get(c.enemies.find((e) => e.def.boss)).centerPoint(), { zoom: 0.55, lambda: 1.2, dy: 0.6 });
          await wait(900);
          sfx('roar');
          W.addShake(0.8);
          const boss = c.enemies.find((e) => e.def.boss);
          FX.flare(W, this.actors.get(boss).centerPoint(), { color: FX.COLORS.dark, size: 9, dur: 900 });
          await this.showBanner('虚ろの灯王', '― 灯を喰らう者 ―', 1300, true);
          this.game.letterbox(false);
          W.resetCamera();
        } else {
          await wait(this.kind === 'elite' ? 500 : 250);
          if (this.kind === 'elite') { sfx('roar'); W.addShake(0.4); await this.showBanner(c.enemies[0].name, '強敵', 700, true); }
          W.resetCamera();
        }
        for (const e of c.enemies) this.makeHUD(e);
        break;
      }
      case 'playerTurn': {
        this.setEnergy();
        this.refreshHUD(c.player);
        if (d.turn > 1 || true) { sfx('yourturn'); await this.showBanner(`あなたのターン`, `ターン ${d.turn}`, 350); }
        break;
      }
      case 'turnReady': {
        this.setEnergy();
        this.setPiles();
        for (const e of c.enemies) this.refreshIntent(e);
        if (!this.busy) this.setInput(true);
        break;
      }
      case 'draw': {
        for (const inst of d.cards) {
          this.hand.add(inst, { x: 60, y: 690 });
          sfx('draw');
          this.setPiles();
          await wait(70);
        }
        this.hand.refresh();
        break;
      }
      case 'shuffle': {
        sfx('shuffle');
        for (let i = 0; i < Math.min(6, d.count); i++) {
          this.flyCard({ id: 'strike', uid: -1, upgraded: false }, { x: 1220, y: 680 }, { x: 60, y: 680 }, { dur: 380, scale0: 0.3, scale1: 0.3 });
          await wait(40);
        }
        this.setPiles();
        await wait(250);
        break;
      }
      case 'cardPlay': {
        const hc = this.hand.remove(d.card);
        this.hoverEnemy = null;
        for (const a of this.actors.values()) a.uniforms.uTint.value.setScalar(1);
        this.setEnergy();
        sfx('card');
        const def = CARDS[d.card.id];
        if (hc) {
          // card rises to the play spot, flashes, then is consumed
          const e = hc.el;
          const from = { x: hc.x, y: hc.y };
          await tween(140, (k) => { e.style.transform = `translate(${from.x + (640 - from.x) * k - 75}px, ${from.y + (420 - from.y) * k - 105}px) scale(${hc.s + (1.1 - hc.s) * k})`; }, { easing: ease.outCubic, real: true });
          this.playedEl = e;
          const big = def.rarity === 'rare' || (d.x && d.x >= 3) || def.id === 'flash_slash' && (c.player.statuses.radiance || 0) >= 5;
          if (big) await this.bigCardCinematic(def);
        }
        if (def.type === 'attack') { this.player.play('windup'); }
        else if (def.type === 'power') { this.player.play('cast'); }
        else { this.player.play(def.blk !== undefined ? 'guard' : 'cast'); }
        break;
      }
      case 'cardResolved':
      case 'exhaust':
      case 'powerUsed': {
        const cards = d.cards || [d.card];
        const e = this.playedEl;
        this.playedEl = null;
        if (type === 'cardResolved') {
          if (e) this.flyCard(d.card, { x: 640, y: 420 }, { x: 1220, y: 680 }, { dur: 260, scale0: 1.1, scale1: 0.25, rot: 30, startEl: e });
        } else if (type === 'powerUsed') {
          if (e) { this.flyCard(d.card, { x: 640, y: 420 }, toDesign(...Object.values(W.toScreen(this.player.centerPoint())).slice(0, 2)), { dur: 320, scale0: 1.1, scale1: 0.1, startEl: e }); }
          sfx('buff');
          FX.auraBurst(W, this.player, { color: FX.COLORS.light, size: 3 });
        } else {
          sfx('exhaust');
          for (const inst of cards) {
            const hc = this.hand.remove(inst);
            const src = d.played && e ? e : hc ? hc.el : null;
            const from = d.played ? { x: 640, y: 420 } : hc ? { x: hc.x, y: hc.y } : { x: 640, y: 420 };
            if (src) this.flyCard(inst, from, { x: from.x, y: from.y - 80 }, { dur: 420, scale0: 1.1, scale1: 1.0, burn: true, startEl: src });
            FX.embers(W, this.player.centerPoint().add(V(1.5, 0.6, 0.5)), { n: 6 });
          }
          if (this.player.statuses) { /* noop */ }
        }
        if (type !== 'exhaust' || d.played) { this.returnPlayer(); this.world.resetCamera(); }
        this.setPiles();
        this.refreshHUD(c.player);
        await wait(type === 'exhaust' ? 120 : 60);
        break;
      }
      case 'playerAttack': {
        const targets = d.targets;
        const t0 = this.actors.get(targets[0]);
        const elem = d.opts.element || 'normal';
        const all = targets.length > 1;
        const heavy = d.opts.heavy || d.opts.big;
        if (d.hit === 0) {
          // dash in
          const tx = all ? 0.6 : t0.group.position.x - (t0.size.w * 0.45 + 1.0);
          const dist = tx - this.player.home.x;
          if (heavy) { W.focusOn(t0.centerPoint(), { zoom: 0.72, lambda: 7 }); }
          sfx('whoosh', { pan: -0.3 });
          this.player.play('windup');
          await tween(heavy ? 170 : 110, (k) => { this.player.offset.x = dist * k * 0.85; this.player.offset.y = Math.sin(k * Math.PI) * 0.25; }, { easing: ease.inCubic });
        }
        this.player.play('slash');
        sfx('slash', { pan: 0.3 });
        const col = FX.COLORS[elem] || FX.COLORS.normal;
        for (const t of targets) {
          const a = this.actors.get(t);
          if (!a) continue;
          FX.slash(W, a.centerPoint().add(V(0, 0.1, 0)), { color: col, size: Math.max(2, a.size.h * 1.1) * (heavy ? 1.4 : 1), angle: -0.6 + (d.hit % 2) * 1.2, flip: d.hit % 2 === 1 });
        }
        await wait(40);
        break;
      }
      case 'damage': {
        const t = d.target;
        const a = this.actors.get(t);
        const elem = (d.opts && d.opts.element) || (d.type === 'hploss' ? 'none' : 'normal');
        if (d.unblocked > 0 || d.amount > 0) {
          const big = d.amount >= 20 || (d.opts && (d.opts.heavy || d.opts.big || d.opts.ultimate));
          if (d.type === 'attack' || d.type === 'thorns') {
            const cp = a.centerPoint();
            if (d.blocked > 0 && d.unblocked === 0) {
              sfx('blocked');
              FX.shieldFx(W, a);
              this.number(t, `${d.blocked}`, 'block');
            } else {
              sfx(big ? 'heavy' : 'hit', { pan: t.isPlayer ? -0.4 : 0.4 });
              hitstop(big ? 130 : 60);
              W.addShake(big ? 0.75 : t.isPlayer ? 0.42 : 0.3);
              const sc = elem === 'fire' ? [1.4, 0.6, 0.2] : elem === 'light' ? [1.4, 1.2, 0.6] : elem === 'dark' ? [0.9, 0.4, 1.4] : [1.2, 1.1, 0.9];
              FX.sparks(W, cp, { n: big ? 34 : 18, color: sc, dirX: t.isPlayer ? -1 : 1, speed: big ? 7 : 5 });
              if (elem === 'fire') { FX.embers(W, a.footPoint(), { n: 16 }); sfx('fire'); }
              if (elem === 'light') { FX.rays(W, cp, { n: big ? 12 : 6, len: big ? 6 : 3 }); }
              if (big) { FX.flare(W, cp, { color: FX.COLORS[elem] || FX.COLORS.normal, size: 4 }); W.post.grade.material.uniforms.chroma.value = 0.012; }
              W.fxLight.position.copy(cp).add(V(0, 0, 1.2)); W.fxLight.color.set(elem === 'fire' ? '#ff8a3a' : elem === 'light' ? '#ffe08a' : elem === 'dark' ? '#a06aff' : '#cfe0ff'); W.fxLight.intensity = big ? 40 : 18;
              this.hitAnim(t, big);
              if (d.blocked > 0) this.number(t, `${d.blocked}`, 'block', { dx: -40 });
              this.number(t, `${d.unblocked}`, t.isPlayer ? 'player' : elem === 'light' ? 'light' : elem === 'fire' ? 'burn' : '', { big });
              if (t.isPlayer) { W.post.grade.material.uniforms.flash.value = 0.18; W.post.grade.material.uniforms.flashColor.value.set(0.9, 0.05, 0.02); }
            }
          } else {
            // hp loss (burn etc.)
            if (d.unblocked > 0) {
              this.number(t, `${d.unblocked}`, elem === 'fire' ? 'burn' : 'player');
              a.flash = 0.6; a.uniforms.uFlashColor.value.set(1, 0.4, 0.1);
              tween(200, (k) => { a.flash = 0.6 * (1 - k); });
            }
          }
        }
        this.refreshHUD(t);
        if (t.isPlayer) this.game.refreshTop(t.hp);
        break;
      }
      case 'block': {
        const a = this.actors.get(d.target);
        sfx('block');
        FX.shieldFx(W, a);
        this.number(d.target, `+${d.amount}`, 'block');
        this.refreshHUD(d.target);
        await wait(120);
        break;
      }
      case 'status': {
        const t = d.target;
        const S = STATUSES[d.status];
        this.refreshHUD(t);
        if (!S || !d.n) break;
        const a = this.actors.get(t);
        if (d.status === 'radiance') {
          if (d.n > 0) { sfx('radiance', { n: Math.min(8, t.statuses.radiance || 0) }); FX.flare(W, this.player.centerPoint().add(V(-0.3, -0.2, 0.4)), { color: FX.COLORS.light, size: 1.6, dur: 280 }); }
          this.number(t, `輝き${d.n > 0 ? '+' : ''}${d.n}`, 'status light', { dy: -30 });
          await wait(90);
          break;
        }
        const debuff = S.kind === 'debuff';
        if (d.status === 'burn') { sfx('burn'); FX.embers(W, a.footPoint(), { n: 20 }); }
        else if (debuff) { sfx('debuff'); FX.riseFx(W, a, { color: [0.8, 0.4, 1.2], n: 14, shape: 1 }); }
        else { sfx('buff'); FX.riseFx(W, a, { color: [1.2, 1.0, 0.4], n: 18 }); }
        this.number(t, `${S.name}${d.n > 0 ? '+' : ''}${d.n}`, 'status' + (d.status === 'burn' ? ' burn' : ''), { dy: -30 });
        await wait(debuff ? 140 : 160);
        break;
      }
      case 'spendRadiance': {
        sfx('light');
        const pc = this.player.centerPoint();
        FX.flare(W, pc, { color: FX.COLORS.light, size: 2 + d.n * 0.4, dur: 400 });
        this.orbs.set(0);
        this.refreshHUD(c.player);
        await wait(80);
        break;
      }
      case 'burnBurst': {
        const a = this.actors.get(d.target);
        sfx('fire');
        FX.flare(W, a.centerPoint(), { color: FX.COLORS.fire, size: 4, dur: 400 });
        FX.embers(W, a.footPoint(), { n: 40, spread: 1.4, height: 2.2 });
        FX.shockwave(W, a.footPoint(), { color: FX.COLORS.fire, size: 4 });
        W.addShake(0.45);
        hitstop(90);
        await wait(150);
        break;
      }
      case 'burnTick': {
        const a = this.actors.get(d.target);
        FX.embers(W, a.footPoint(), { n: 14 });
        sfx('burn');
        await wait(220);
        break;
      }
      case 'zap': {
        const a = this.actors.get(d.target);
        sfx('zap');
        FX.beam(W, this.player.centerPoint().add(V(0.3, 0.4, 0.3)), a.centerPoint(), { color: d.opts && d.opts.element === 'light' ? FX.COLORS.light : FX.COLORS.fire });
        await wait(90);
        break;
      }
      case 'heal': {
        if (!d.amount) break;
        sfx('heal');
        FX.riseFx(W, this.actors.get(d.target), { color: [0.5, 1.3, 0.5], n: 20 });
        this.number(d.target, `+${d.amount}`, 'heal');
        this.refreshHUD(d.target);
        if (d.target.isPlayer) this.game.refreshTop(d.target.hp);
        await wait(200);
        break;
      }
      case 'energy': {
        this.setEnergy();
        sfx('energy');
        this.energyEl.classList.remove('pulse'); void this.energyEl.offsetWidth; this.energyEl.classList.add('pulse');
        break;
      }
      case 'discard': {
        if (d.from === 'hand') {
          const hcs = d.cards.map((inst) => this.hand.remove(inst)).filter(Boolean);
          hcs.forEach((hc, i) => this.flyCard(hc.inst, { x: hc.x, y: hc.y }, { x: 1220, y: 680 }, { dur: 300 + i * 30, scale0: hc.s, scale1: 0.25, rot: 40, startEl: hc.el }));
          if (hcs.length) await wait(300);
        }
        this.setPiles();
        break;
      }
      case 'addCards': {
        sfx('debuff');
        const n = d.cards.length;
        for (let i = 0; i < n; i++) {
          const to = d.pile === 'draw' ? { x: 60, y: 680 } : { x: 1220, y: 680 };
          this.flyCard(d.cards[i], { x: 520 + i * 160, y: 330 }, to, { dur: 650, scale0: 0.9, scale1: 0.25 });
        }
        await wait(500);
        this.setPiles();
        break;
      }
      case 'enemyPhase': {
        this.hand.cancel();
        sfx('enemyturn');
        await this.showBanner('敵のターン', '', 280, true);
        break;
      }
      case 'enemyAction': {
        const e = d.enemy;
        const a = this.actors.get(e);
        this.showMove(e, d.move.name);
        const kind = d.move.intent;
        if (kind === 'charge') { sfx('charge'); FX.flare(W, a.centerPoint(), { color: FX.COLORS.red, size: 5, dur: 900 }); W.addShake(0.3); await wait(500); }
        else if (!d.move.dmg) {
          a.play('attack');
          await tween(160, (k) => { a.offset.y = Math.sin(k * Math.PI) * 0.25; });
          a.idle(e.phase === 2 ? 'idle2' : 'idle');
        }
        if (kind === 'summon') sfx('summon');
        await wait(120);
        break;
      }
      case 'enemyActionEnd': {
        const a = this.actors.get(d.enemy);
        if (a && a.offset.x !== 0) {
          const ox = a.offset.x;
          await tween(200, (k) => { a.offset.x = ox * (1 - k); a.offset.y = 0; }, { easing: ease.outCubic });
        }
        if (a) a.idle(d.enemy.phase === 2 ? 'idle2' : 'idle');
        this.refreshHUD(d.enemy);
        W.resetCamera();
        break;
      }
      case 'enemyAttack': {
        const e = d.enemy;
        const a = this.actors.get(e);
        const heavy = d.opts.heavy;
        if (d.hit === 0) {
          if (d.opts.ultimate) await this.ultimateCinematic(e);
          const dist = (this.player.group.position.x + 1.3) - a.group.position.x;
          if (heavy) W.focusOn(this.player.centerPoint(), { zoom: 0.78, lambda: 6 });
          a.play(e.phase === 2 && a.atlas.order.attack2 ? 'attack2' : 'attack');
          sfx('whoosh', { pan: 0.4 });
          await tween(heavy ? 220 : 150, (k) => { a.offset.x = dist * k * (e.def.boss ? 0.35 : 0.8); a.offset.y = Math.sin(k * Math.PI) * 0.3; }, { easing: ease.inCubic });
        } else {
          await tween(90, (k) => { a.offset.x *= 0.9; });
        }
        FX.slash(W, this.player.centerPoint(), { color: d.opts.element === 'dark' ? FX.COLORS.dark : d.opts.element === 'fire' ? FX.COLORS.fire : FX.COLORS.red, size: 2.2, flip: true, angle: 0.5 - (d.hit % 2) });
        break;
      }
      case 'death': {
        const t = d.target;
        if (t.isPlayer) {
          sfx('death');
          this.player.play('hit');
          W.focusOn(this.player.centerPoint(), { zoom: 0.6, lambda: 2 });
          slowmo(1200, 0.3);
          W.post.grade.material.uniforms.desat.value = 0.8;
          await tween(1100, (k) => { this.player.uniforms.uDissolve.value = k; });
          break;
        }
        const a = this.actors.get(t);
        if (!a) break;
        sfx('death');
        const isBoss = t.def.boss;
        if (isBoss) {
          slowmo(1600, 0.25);
          W.focusOn(a.centerPoint(), { zoom: 0.6, lambda: 3 });
          W.post.grade.material.uniforms.flash.value = 0.85;
          W.post.grade.material.uniforms.flashColor.value.set(1, 0.95, 0.85);
          W.addShake(1.0);
          FX.pillar(W, a.footPoint(), { color: FX.COLORS.light, height: 14, width: 3.5, dur: 1600 });
        }
        FX.embers(W, a.footPoint(), { n: isBoss ? 120 : 40, spread: a.size.w * 0.8, height: a.size.h, color: t.def.id === 'wisp' || isBoss ? [0.7, 0.5, 1.3] : [1, 0.55, 0.15] });
        tween(isBoss ? 1800 : 700, (k) => { a.uniforms.uDissolve.value = k; }).then(() => { a.group.visible = false; });
        const hud = this.huds.get(t);
        if (hud) tween(300, (k) => { hud.el.style.opacity = 1 - k; }).then(() => hud.el.classList.add('hidden'));
        if (isBoss) await wait(1400);
        else await wait(160);
        break;
      }
      case 'revive': {
        const t = d.target;
        if (t.isPlayer) {
          sfx('heal');
          FX.pillar(W, this.player.footPoint(), { color: FX.COLORS.light });
          this.number(t, '不滅の芯！', 'heal', { dy: -40 });
          this.refreshHUD(t);
          this.game.refreshTop(t.hp);
          this.game.pulseRelic('undying_wick');
          await wait(600);
          break;
        }
        const a = this.actors.get(t);
        sfx('roar');
        this.showMove(t, '不死の誓い');
        await tween(400, (k) => { a.uniforms.uDissolve.value = 0.6 * k; });
        FX.pillar(W, a.footPoint(), { color: new THREE.Color(0.6, 1.2, 2.6) });
        await tween(600, (k) => { a.uniforms.uDissolve.value = 0.6 * (1 - k); });
        W.addShake(0.4);
        this.refreshHUD(t);
        break;
      }
      case 'phase': {
        await this.phaseCinematic(d.enemy);
        break;
      }
      case 'summon': {
        const e = d.enemy;
        const a = this.spawnEnemyActor(e, true);
        this.makeHUD(e);
        a.uniforms.uDissolve.value = 1;
        FX.flare(W, a.centerPoint(), { color: FX.COLORS.dark, size: 2.5, dur: 500 });
        await tween(400, (k) => { a.uniforms.uDissolve.value = 1 - k; });
        break;
      }
      case 'potion': {
        sfx('potion');
        FX.riseFx(W, this.player, { color: [1, 0.9, 0.6], n: 16 });
        await wait(150);
        break;
      }
      default: break;
    }
  }

  hitAnim(t, big) {
    const a = this.actors.get(t);
    if (!a) return;
    a.play(t.phase === 2 && a.atlas.order.hit2 ? 'hit2' : 'hit');
    a.flash = 1;
    a.uniforms.uFlashColor.value.set(1, 1, 1);
    const dir = t.isPlayer ? -1 : 1;
    const base = a.offset.x;
    tween(big ? 380 : 260, (k) => {
      a.flash = Math.max(0, 1 - k * 3);
      a.offset.x = base + dir * Math.sin(k * Math.PI) * (big ? 0.45 : 0.22) * (1 - k * 0.3);
      a.squash = Math.sin(k * Math.PI) * 0.06;
    }).then(() => {
      a.squash = 0;
      if (t.alive !== false) {
        if (t.isPlayer) {
          // player returns home
          const ox = a.offset.x;
          tween(220, (k) => { a.offset.x = ox * (1 - k); }).then(() => a.idle());
        } else a.idle(t.phase === 2 ? 'idle2' : 'idle');
      }
    });
  }

  async returnPlayer() {
    const p = this.player;
    if (Math.abs(p.offset.x) < 0.01 && Math.abs(p.offset.y) < 0.01) return;
    const ox = p.offset.x, oy = p.offset.y;
    await tween(230, (k) => { p.offset.x = ox * (1 - k); p.offset.y = oy * (1 - k); }, { easing: ease.outCubic });
    p.idle();
  }

  spawnEnemyActor(e, summoned) {
    const isBoss = this.combat.enemies.some((x) => x.def.boss);
    const living = this.combat.enemies;
    const idx = living.indexOf(e);
    const pos = formation(living.length, isBoss)[Math.min(idx, 4)] || [3, 0];
    let [x, z] = pos;
    if (isBoss && !e.def.boss) {
      const minions = living.filter((m) => !m.def.boss);
      const k = minions.indexOf(e);
      [x, z] = [[0.9, 0.5], [5.2, 0.5], [1.4, -1.8], [4.8, -1.8]][k % 4];
    }
    const a = new Actor(e.def.sprite, { scale: e.def.size >= 1.3 && !e.def.boss ? 1.1 : 1 });
    if (e.def.flying) a.hover = 0.3;
    if (e.def.boss) a.hover = 0.15;
    this.world.addActor(a, x, z);
    a.idle();
    this.actors.set(e, a);
    return a;
  }

  async bigCardCinematic(def) {
    const W = this.world;
    this.game.letterbox(true);
    sfx('bigflash');
    W.focusOn(this.player.centerPoint(), { zoom: 0.55, lambda: 9, dx: 0.6 });
    this.player.play('cast');
    FX.flare(W, this.player.centerPoint(), { color: def.type === 'attack' ? FX.COLORS.light : FX.COLORS.fire, size: 5, dur: 600 });
    FX.shockwave(W, this.player.footPoint(), { color: FX.COLORS.light, size: 6 });
    W.post.bloom.strength = 1.6;
    W.post.grade.material.uniforms.radial.value = 0.8;
    const r = W.toScreen(this.player.centerPoint());
    W.post.grade.material.uniforms.radialCenter.value.set(r.x / W.width, 1 - r.y / W.height);
    slowmo(500, 0.4);
    await wait(260);
    this.game.letterbox(false);
  }

  async ultimateCinematic(e) {
    const W = this.world;
    const a = this.actors.get(e);
    this.game.letterbox(true);
    W.focusOn(a.centerPoint(), { zoom: 0.55, lambda: 6, dy: 0.4 });
    sfx('roar');
    FX.flare(W, a.centerPoint(), { color: e.phase === 2 ? FX.COLORS.red : FX.COLORS.dark, size: 10, dur: 1000 });
    W.addShake(0.9);
    W.post.grade.material.uniforms.chroma.value = 0.02;
    await wait(700);
    W.focusOn(this.player.centerPoint(), { zoom: 0.7, lambda: 8 });
    this.game.letterbox(false);
  }

  async phaseCinematic(e) {
    const W = this.world;
    const a = this.actors.get(e);
    this.game.letterbox(true);
    playMusic('boss2');
    W.focusOn(a.centerPoint(), { zoom: 0.5, lambda: 2.5, dy: 0.8 });
    await wait(500);
    sfx('roar');
    W.addShake(1.1);
    W.post.grade.material.uniforms.flash.value = 0.9;
    W.post.grade.material.uniforms.flashColor.value.set(1, 0.2, 0.1);
    W.setBossPhase2();
    a.idle('idle2');
    FX.pillar(W, a.footPoint(), { color: FX.COLORS.red, height: 16, width: 5, dur: 1400 });
    FX.embers(W, a.footPoint(), { n: 140, spread: 5, height: 5, color: [1.4, 0.3, 0.2] });
    FX.shockwave(W, a.footPoint(), { color: FX.COLORS.red, size: 10, dur: 900 });
    await this.showBanner('虚ろの灯王 ― 覚醒', '永夜の炎が燃え上がる', 1300, true);
    this.game.letterbox(false);
    W.resetCamera();
    this.refreshHUD(e);
  }
}
