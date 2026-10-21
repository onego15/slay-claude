// Game flow: title, map, nodes (combat / rest / shop / event / treasure), rewards, endings.
import { createRun, availableNodes, enterNode, pickEncounter, cardChoices, goldReward, relicChoice, potionDrop, addRelic, addPotion, makeShop, removeCard, upgradeCard, restHeal, MAP_ROWS, MAP_COLS } from './core/run.js';
import { CARDS, canUpgrade, cardStats } from './core/cards.js';
import { RELICS, POTIONS } from './core/relics.js';
import { pickEvent } from './core/events.js';
import { randomSeed } from './core/rng.js';
import { Battle } from './battle.js';
import { Actor } from './gfx/actor.js';
import { iconURL } from './gfx/icons.js';
import { tween, wait, ease } from './gfx/clock.js';
import * as FX from './gfx/fx.js';
import { el, bindTip, showTip, hideTip, eventToDesign, formatText, toDesign, ui } from './ui/dom.js';
import { cardElement } from './ui/cardview.js';
import { initAudio, playMusic, sfx, setAmbience, setMuted, isMuted, muffleMusic } from './audio/audio.js';

const NODE_ICON = { combat: 'n_combat', elite: 'n_elite', rest: 'n_rest', shop: 'n_shop', event: 'n_event', treasure: 'n_treasure', boss: 'n_boss' };
const NODE_NAME = { combat: '戦闘', elite: '強敵', rest: '休息', shop: '商人', event: '謎の出来事', treasure: '宝箱', boss: '灯王' };
const SCENE_PROP = { shrine: 'shrine', peddler: 'merchant', spring: 'spring', ash: 'ashpile', forge: 'forge', crossroads: 'signpost', bard: 'bard' };

export class Game {
  constructor(world, uiRoot) {
    this.world = world;
    this.uiRoot = uiRoot;
    this.run = null;
    this.buildChrome();
  }

  // ---------------------------------------------------------------- persistent chrome
  buildChrome() {
    const r = this.uiRoot;
    this.top = el('div', 'hidden', '', { id: 'topbar' });
    r.appendChild(this.top);
    this.lbTop = el('div', 'letterbox top');
    this.lbBot = el('div', 'letterbox bottom');
    r.appendChild(this.lbTop); r.appendChild(this.lbBot);
    this.fade = el('div', 'fadeblack');
    r.appendChild(this.fade);
    this.screenLayer = el('div', '', '', { id: 'screens' });
    r.appendChild(this.screenLayer);
  }

  letterbox(on) {
    const h = on ? 'calc(40vh + 70px)' : '0';
    this.lbTop.style.height = h;
    this.lbBot.style.height = h;
  }

  async fadeTo(on, ms = 400) {
    await tween(ms, (k) => { this.fade.style.opacity = on ? k : 1 - k; }, { real: true });
  }

  refreshTop(hpOverride) {
    const run = this.run;
    if (!run) return;
    const hp = hpOverride !== undefined ? hpOverride : run.hp;
    this.top.innerHTML = `
      <div class="stat" data-tip="hp"><img class="pix" src="${iconURL('hp', { size: 32 })}"><span class="hpv">${Math.max(0, hp)}/${run.maxHp}</span></div>
      <div class="stat" data-tip="gold"><img class="pix" src="${iconURL('gold', { size: 32 })}"><span class="goldv">${run.gold}</span></div>
      <div id="potions"></div>
      <div id="relics"></div>
      <div class="stat floor">${run.floor ? `第${run.floor}層` : ''}</div>
      <div class="tbtn" id="btn-map"><img class="pix" src="${iconURL('map', { size: 32 })}"></div>
      <div class="tbtn" id="btn-deck"><img class="pix" src="${iconURL('deck', { size: 32 })}"><span class="badge">${run.deck.length}</span></div>
      <div class="tbtn" id="btn-sound"><img class="pix" src="${iconURL(isMuted() ? 'mute' : 'sound', { size: 32 })}"></div>`;
    const pots = this.top.querySelector('#potions');
    for (let i = 0; i < run.potionSlots; i++) {
      const id = run.potions[i];
      const p = el('div', 'potion', `<img class="pix" src="${id ? iconURL('potion', { size: 32, tint: POTIONS[id].color }) : iconURL('potion_empty', { size: 32 })}">`);
      if (id) {
        bindTip(p, () => [{ title: POTIONS[id].name, body: POTIONS[id].text + (this.onPotionClick ? '<br><span class="sub">クリックで使用</span>' : '<br><span class="sub">戦闘中に使用できる</span>') }]);
        p.addEventListener('click', () => { if (this.onPotionClick) { hideTip(); this.onPotionClick(i); } });
      }
      pots.appendChild(p);
    }
    const rel = this.top.querySelector('#relics');
    for (const id of run.relics) {
      const R = RELICS[id];
      const d = el('div', 'relic', `<img class="pix" src="${iconURL(R.icon, { size: 32 })}">`, { 'data-relic': id });
      bindTip(d, () => [{ title: R.name, body: R.text }]);
      rel.appendChild(d);
    }
    bindTip(this.top.querySelector('[data-tip=hp]'), () => [{ title: 'HP', body: '0になると冒険は終わる。' }]);
    bindTip(this.top.querySelector('[data-tip=gold]'), () => [{ title: 'ゴールド', body: '商人との取引に使う。' }]);
    this.top.querySelector('#btn-deck').addEventListener('click', () => this.showPile('デッキ', this.run.deck));
    bindTip(this.top.querySelector('#btn-deck'), () => [{ title: 'デッキ', body: 'デッキのカードを確認する。' }]);
    this.top.querySelector('#btn-map').addEventListener('click', () => this.peekMap());
    bindTip(this.top.querySelector('#btn-map'), () => [{ title: '地図', body: '道のりを確認する。' }]);
    this.top.querySelector('#btn-sound').addEventListener('click', () => { setMuted(!isMuted()); this.refreshTop(); });
  }
  pulseRelic(id) {
    const d = this.top.querySelector(`[data-relic=${id}]`);
    if (d) { d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse'); }
  }
  potionRect(i) {
    const p = this.top.querySelectorAll('.potion')[i];
    const r = p.getBoundingClientRect();
    return toDesign(r.left + r.width / 2, r.top + r.height / 2);
  }

  screen(id, cls = 'screen') {
    const s = el('div', cls, '', { id });
    this.screenLayer.appendChild(s);
    return s;
  }
  clearScreens() { this.screenLayer.innerHTML = ''; hideTip(); }

  setStage(kind) { this.world.setStage(kind); setAmbience(kind); }

  // ---------------------------------------------------------------- scenes
  stageForFloor() { return this.run && this.run.floor > 6 ? 'chapel' : 'forest'; }
  vignette(kind, props = []) {
    this.setStage(kind);
    this.world.clearActors();
    const p = this.world.addActor(new Actor('player'), -3.0, 0.3);
    p.idle();
    this.world.lantern.position.set(-3.1, 1.25, 1.7);
    this.world.lantern.intensity = 3.5;
    const actors = props.map(([id, x, z, opts = {}]) => { const a = this.world.addActor(new Actor(id, opts), x, z); a.idle(); return a; });
    return { player: p, actors };
  }

  // ---------------------------------------------------------------- title
  async title() {
    this.clearScreens();
    this.top.classList.add('hidden');
    this.run = null;
    this.vignette('forest', [['campfire', -1.2, 0.6]]);
    this.world.camTarget.pos.set(-0.5, 2.4, 11.5);
    this.world.camTarget.look.set(-1.4, 1.4, 0);
    this.world.cam.pos.set(-0.5, 2.4, 11.5);
    this.world.cam.look.set(-1.4, 1.4, 0);
    this.world.lantern.position.set(-1.2, 0.9, 1.4);
    this.world.lantern.intensity = 6;
    const s = this.screen('title', 'screen center');
    s.innerHTML = `
      <div class="logo">灯守の巡礼</div>
      <div class="logo-en">LANTERNFALL</div>
      <div class="tagline">消えゆく灯を携え、灰の尖塔の頂へ ―― デッキ構築ローグライト</div>
      <div class="menu">
        <button class="btn gold" id="t-start">冒険を始める</button>
        <button class="btn" id="t-how">遊び方</button>
      </div>
      <div class="credit">Lanternfall — an original game · Font: DotGothic16 (SIL OFL)</div>`;
    await this.fadeTo(false, 600);
    await new Promise((resolve) => {
      s.querySelector('#t-start').onclick = () => { initAudio(); sfx('click'); resolve(); };
      s.querySelector('#t-how').onclick = () => { initAudio(); sfx('click'); this.howTo(); };
      s.addEventListener('pointerdown', () => { initAudio(); playMusic('title'); setAmbience('forest'); }, { once: true });
    });
    await this.fadeTo(true, 500);
    this.startRun(this.fixedSeed ?? randomSeed());
  }

  howTo() {
    const s = this.screen('how', 'screen dim center');
    s.innerHTML = `<div class="panel" style="width:820px;padding:20px 30px;font-size:16px;line-height:1.75">
      <div class="ttl" style="font-size:26px;text-align:center;margin-bottom:8px">遊び方</div>
      <div>・分岐する地図を進み、<span class="kw">第13層</span>に待つ「虚ろの灯王」を倒せばクリア。HPが0になると冒険は終わる。</div>
      <div>・戦闘では毎ターン<span class="kw">エネルギー3</span>と<span class="kw">5枚</span>の手札を得る。カードを<span class="kw">ドラッグ</span>して使う（クリック→対象クリックでも可）。</div>
      <div>・敵の頭上には<span class="kw">次の行動</span>が表示される。攻撃が来るならブロック、隙があれば攻勢に。</div>
      <div>・戦闘に勝つとカードを1枚選んでデッキに加えられる。<span class="kw">デッキの方向性</span>を意識しよう。</div>
      <div style="margin-top:6px;color:var(--ink-dim)">主な戦術：</div>
      <div>　<span class="kw burn">灼熱</span> … 毎ターン敵を焼く。重ねて「業火」「爆燃」で一気に燃やし尽くす。</div>
      <div>　<span class="kw radiance">輝き</span> … 灯の力を蓄え、「閃光斬」「天光」で解き放つ。</div>
      <div>　<span class="kw">ブロック</span> … 守りを固め、「盾撃」「鏡盾」「堅守」で反撃に転じる。</div>
      <div>　<span class="kw">筋力</span>と連撃 ／ <span class="kw exhaust">焼却</span>によるデッキ圧縮 なども有効。</div>
      <div style="margin-top:6px;color:var(--ink-dim)">操作：1〜9キーでカード選択、Eキーでターン終了、右クリック／Escで取消。</div>
      <div style="text-align:center;margin-top:14px"><button class="btn" id="how-close">閉じる</button></div></div>`;
    s.querySelector('#how-close').onclick = () => { sfx('click'); s.remove(); };
  }

  // ---------------------------------------------------------------- run loop
  async startRun(seed) {
    this.run = createRun(seed);
    window.__run = this.run;
    this.clearScreens();
    this.top.classList.remove('hidden');
    this.refreshTop();
    await this.intro();
    while (true) {
      const id = await this.mapScreen();
      const node = enterNode(this.run, id);
      this.refreshTop();
      let result = 'ok';
      if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') result = await this.combatNode(node.type === 'combat' ? 'normal' : node.type);
      else if (node.type === 'rest') await this.restNode();
      else if (node.type === 'shop') await this.shopNode();
      else if (node.type === 'event') result = await this.eventNode();
      else if (node.type === 'treasure') await this.treasureNode();
      if (result === 'defeat' || this.run.hp <= 0) { await this.gameOver(false); return; }
      if (node.type === 'boss') { await this.gameOver(true); return; }
      this.run.stats.floorsCleared = this.run.floor;
    }
  }

  async intro() {
    this.vignette('forest', []);
    this.world.cam.pos.set(-6, 4, 12); this.world.cam.look.set(-2, 1.5, 0);
    this.world.camTarget.pos.set(-2.5, 2.8, 12.5); this.world.camTarget.look.set(-2.4, 1.3, 0); this.world.camTarget.lambda = 1;
    playMusic('map');
    const s = this.screen('intro', 'screen center');
    s.innerHTML = `<div class="panel" style="width:640px;padding:20px 28px;font-size:18px;line-height:1.9;text-align:center;margin-top:300px">
      世界を照らす「大灯」は、灰の尖塔の頂で何者かに喰われた。<br>灯守のあなたは、最後の火を宿したランタンを手に、霧の森へ踏み出す。
      <div style="margin-top:12px"><button class="btn gold" id="go">旅立つ</button></div></div>`;
    await this.fadeTo(false, 700);
    await new Promise((r) => { s.querySelector('#go').onclick = () => { sfx('click'); r(); }; });
    s.remove();
  }

  // ---------------------------------------------------------------- map
  mapScreen(peek = false) {
    return new Promise((resolve) => {
      const run = this.run;
      if (!peek) {
        // ambient backdrop
        this.vignette(this.stageForFloor(), []);
        playMusic('map');
        muffleMusic(false);
      }
      const s = this.screen('map', 'screen dim');
      const avail = new Set(peek ? [] : availableNodes(run));
      const rowH = 112;
      const H = (MAP_ROWS - 1) * rowH + 260;
      const W = 800;
      s.innerHTML = `
        <div class="maptitle"><div class="ttl">灰の尖塔</div><div class="sub" style="margin-top:6px">第${Math.max(1, run.floor)}層 / 全13層</div>
          <div class="sub" style="margin-top:14px;line-height:1.7">${peek ? '地図を確認中' : '進む道を選べ'}</div>${peek ? '<button class="btn" id="map-close" style="margin-top:14px">閉じる</button>' : ''}</div>
        <div class="legend panel">${Object.entries(NODE_NAME).map(([k, v]) => `<div><img class="pix" src="${iconURL(NODE_ICON[k], { size: 32 })}">${v}</div>`).join('')}</div>
        <div class="mapwrap panel"><div class="scroll" style="height:${H}px"><canvas class="paths" width="${W}" height="${H}"></canvas></div></div>`;
      const scroll = s.querySelector('.scroll');
      const pos = (n) => ({ x: 50 + (n.c + 0.5 + (n.jx || 0)) * ((W - 100) / MAP_COLS), y: H - 110 - n.r * rowH + (n.jy || 0) * 40 });
      const ctx = s.querySelector('canvas').getContext('2d');
      // paths (dotted ink)
      for (const n of Object.values(run.map)) {
        const a = pos(n);
        for (const nid of n.next) {
          const b = pos(run.map[nid]);
          const visited = run.visited.includes(n.id) && run.visited.includes(nid);
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = Math.floor(len / 11);
          for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
            ctx.fillStyle = visited ? '#ffcf7a' : '#8a7a62';
            ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
          }
        }
      }
      for (const n of Object.values(run.map)) {
        const p = pos(n);
        const done = run.visited.includes(n.id);
        const cur = run.pos === n.id;
        const isAvail = avail.has(n.id);
        const past = !done && run.pos && n.r <= run.map[run.pos].r;
        const d = el('div', `mnode ${n.type === 'boss' ? 'boss' : ''} ${done ? 'done' : ''} ${isAvail ? 'avail' : ''} ${cur ? 'cur' : ''} ${past ? 'past' : ''}`, `<img class="pix" src="${iconURL(NODE_ICON[n.type], { size: n.type === 'boss' ? 96 : 48 })}">`);
        d._nid = n.id;
        d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
        bindTip(d, () => [{ title: NODE_NAME[n.type], body: `第${n.r + 1}層` }]);
        if (isAvail) d.addEventListener('click', () => { sfx('map'); hideTip(); s.remove(); resolve(n.id); });
        scroll.appendChild(d);
      }
      // scroll to current position
      const wrap = s.querySelector('.mapwrap');
      const viewH = 720 - 64 - 24;
      const curRow = run.pos ? run.map[run.pos].r : -1;
      let y = H - 110 - (curRow + 1) * rowH - viewH / 2;
      const clamp = (v) => Math.max(-(H - viewH), Math.min(0, v));
      let sy = clamp(-y);
      let target = sy;
      scroll.style.transform = `translateY(${sy}px)`;
      wrap.addEventListener('wheel', (e) => { target = clamp(target - e.deltaY * 0.8); e.preventDefault(); }, { passive: false });
      let drag = null;
      wrap.addEventListener('pointerdown', (e) => { drag = { y: eventToDesign(e).y, t: target }; });
      window.addEventListener('pointermove', (e) => { if (drag) target = clamp(drag.t + eventToDesign(e).y - drag.y); });
      window.addEventListener('pointerup', () => { drag = null; });
      const anim = () => { if (!s.isConnected) return; sy += (target - sy) * 0.18; scroll.style.transform = `translateY(${sy}px)`; requestAnimationFrame(anim); };
      requestAnimationFrame(anim);
      // reveal animation
      s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      if (peek) s.querySelector('#map-close').onclick = () => { sfx('click'); s.remove(); resolve(null); };
    });
  }
  peekMap() {
    if (!this.run || document.getElementById('map')) return;
    this.mapScreen(true);
  }

  // ---------------------------------------------------------------- combat
  async combatNode(kind, extra = {}) {
    this.clearScreens();
    await this.fadeTo(true, 250);
    const enc = extra.enc || pickEncounter(this.run, kind);
    const battle = new Battle(this, this.run, enc, kind);
    this.battle = battle;
    const p = battle.start();
    await this.fadeTo(false, 400);
    const result = await p;
    this.battle = null;
    if (result !== 'victory') return 'defeat';
    if (kind === 'boss') return 'victory';
    await this.rewardScreen(kind, extra);
    return 'victory';
  }

  async rewardScreen(kind, extra = {}) {
    const run = this.run;
    const items = [];
    const gold = goldReward(run, kind) + (extra.bonusGold || 0);
    if (gold) items.push({ type: 'gold', amount: gold });
    const pot = potionDrop(run, kind);
    if (pot) items.push({ type: 'potion', id: pot });
    if (kind === 'elite' || extra.bonusRelic) { const r = relicChoice(run); if (r) items.push({ type: 'relic', id: r }); }
    items.push({ type: 'cards', cards: cardChoices(run, kind) });
    playMusic('map');
    const s = this.screen('reward', 'screen dim');
    const panel = el('div', 'panel bigpanel', `<div class="ttl" style="text-align:center">戦利品</div><div class="rewards"></div><div style="text-align:center"><button class="btn gold" id="r-next">先へ進む</button></div>`);
    s.appendChild(panel);
    const list = panel.querySelector('.rewards');
    const render = () => {
      list.innerHTML = '';
      for (const it of items) {
        let html = '';
        if (it.type === 'gold') html = `<img class="pix" src="${iconURL('gold', { size: 48 })}"><span>${it.amount} ゴールド</span>`;
        if (it.type === 'potion') html = `<img class="pix" src="${iconURL('potion', { size: 48, tint: POTIONS[it.id].color })}"><span>${POTIONS[it.id].name}</span>`;
        if (it.type === 'relic') html = `<img class="pix" src="${iconURL(RELICS[it.id].icon, { size: 48 })}"><span>${RELICS[it.id].name}</span>`;
        if (it.type === 'cards') html = `<img class="pix" src="${iconURL('deck', { size: 48 })}"><span>カードを1枚デッキに加える</span>`;
        const r = el('div', 'ritem' + (it.taken ? ' taken' : ''), html);
        if (it.type === 'relic') bindTip(r, () => [{ title: RELICS[it.id].name, body: RELICS[it.id].text }]);
        if (it.type === 'potion') bindTip(r, () => [{ title: POTIONS[it.id].name, body: POTIONS[it.id].text }]);
        r.addEventListener('click', async () => {
          hideTip();
          if (it.type === 'gold') { run.gold += it.amount; sfx('coin'); it.taken = true; }
          if (it.type === 'potion') { if (addPotion(run, it.id)) { sfx('potion'); it.taken = true; } else { this.toastMsg('霊薬の所持数が上限だ'); return; } }
          if (it.type === 'relic') { addRelic(run, it.id); sfx('relic'); it.taken = true; }
          if (it.type === 'cards') { const picked = await this.cardChoice(it.cards); if (picked) it.taken = true; }
          this.refreshTop();
          render();
        });
        list.appendChild(r);
      }
    };
    render();
    s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
    await new Promise((r) => { panel.querySelector('#r-next').onclick = () => { sfx('click'); r(); }; });
    // auto-collect gold so it is never lost
    for (const it of items) if (it.type === 'gold' && !it.taken) run.gold += it.amount;
    this.refreshTop();
    s.remove();
  }

  cardChoice(cards, { title = 'カードを選ぶ', skip = true } = {}) {
    return new Promise((resolve) => {
      const s = this.screen('cardchoice', 'screen dim center');
      s.innerHTML = `<div class="ttl">${title}</div><div class="cardrow"></div>${skip ? '<button class="btn" id="cc-skip">見送る</button>' : ''}`;
      const row = s.querySelector('.cardrow');
      cards.forEach((inst, i) => {
        const slot = el('div', 'cardslot');
        const c = cardElement(inst);
        slot.appendChild(c);
        row.appendChild(slot);
        c.animate([{ transform: 'translateY(40px) scale(0.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 + i * 90, easing: 'cubic-bezier(.2,1.4,.4,1)' });
        c.addEventListener('mouseenter', () => sfx('hover'));
        c.addEventListener('click', () => { hideTip(); this.run.deck.push(inst); sfx('upgrade'); s.remove(); this.refreshTop(); resolve(inst); });
      });
      if (skip) s.querySelector('#cc-skip').onclick = () => { sfx('click'); s.remove(); resolve(null); };
    });
  }

  // Pick a card from a list (deck). preview: 'upgrade' shows the upgraded version on hover.
  pickFromDeck(cards, { title, preview = null, cancel = true } = {}) {
    return new Promise((resolve) => {
      const s = this.screen('pick', 'screen dim');
      s.innerHTML = `<div class="screen-head"><div class="ttl">${title}</div></div><div class="deckview"><div class="deckgrid"></div></div>
        <div class="screen-foot">${cancel ? '<button class="btn" id="pk-cancel">やめる</button>' : ''}</div>`;
      s.querySelector('.deckview').style.top = '110px';
      const grid = s.querySelector('.deckgrid');
      for (const inst of cards) {
        const slot = el('div', 'cardslot');
        let c = cardElement(inst);
        slot.appendChild(c);
        if (preview === 'upgrade') {
          const up = cardElement({ ...inst, upgraded: true });
          up.style.display = 'none';
          slot.appendChild(up);
          slot.addEventListener('mouseenter', () => { c.style.display = 'none'; up.style.display = ''; });
          slot.addEventListener('mouseleave', () => { c.style.display = ''; up.style.display = 'none'; });
        }
        slot.addEventListener('click', () => { hideTip(); s.remove(); resolve(inst); });
        grid.appendChild(slot);
      }
      if (cancel) s.querySelector('#pk-cancel').onclick = () => { sfx('click'); s.remove(); resolve(null); };
    });
  }

  showPile(title, cards) {
    if (document.getElementById('pile')) return;
    const s = this.screen('pile', 'screen dim');
    s.innerHTML = `<div class="screen-head"><div class="ttl">${title}（${cards.length}枚）</div></div><div class="deckview"><div class="deckgrid"></div></div><div class="screen-foot"><button class="btn" id="pl-close">閉じる</button></div>`;
    s.querySelector('.deckview').style.top = '110px';
    const grid = s.querySelector('.deckgrid');
    if (!cards.length) grid.innerHTML = '<div class="sub" style="margin-top:120px">カードがない</div>';
    for (const inst of cards) { const slot = el('div', 'cardslot'); slot.appendChild(cardElement(inst)); grid.appendChild(slot); }
    const close = () => { sfx('click'); hideTip(); s.remove(); window.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    s.querySelector('#pl-close').onclick = close;
  }

  toastMsg(t) {
    const d = el('div', 'toast', t);
    this.uiRoot.appendChild(d);
    setTimeout(() => d.remove(), 1500);
  }

  // ---------------------------------------------------------------- rest
  async restNode() {
    this.clearScreens();
    await this.fadeTo(true, 250);
    const v = this.vignette(this.stageForFloor(), [['campfire', -1.0, 0.7]]);
    this.world.focusOn(v.player.centerPoint().add({ x: 1.2, y: 0, z: 0 }), { zoom: 0.72, lambda: 2 });
    this.world.lantern.position.set(-1.0, 0.8, 1.6);
    this.world.lantern.intensity = 7;
    this.world.lantern.color.set('#ff9a4a');
    playMusic('rest');
    setAmbience('fire');
    const run = this.run;
    const healAmt = Math.min(run.maxHp - run.hp, Math.floor(run.maxHp * 0.3) + run.relics.reduce((a, id) => a + (RELICS[id].restBonus || 0), 0));
    const s = this.screen('rest', 'screen center');
    s.innerHTML = `<div class="ttl" style="margin-top:-330px">焚き火</div><div class="sub">揺らめく炎が、張り詰めた心をほどいていく。</div>
      <div class="restopts" style="margin-top:300px">
        <div class="restopt panel" id="rs-heal"><img class="pix" src="${iconURL('hp', { size: 64 })}">休む<small>HPを${healAmt}回復</small></div>
        <div class="restopt panel" id="rs-up"><img class="pix" src="${iconURL('hammer', { size: 64 })}">鍛える<small>カード1枚を<br>アップグレード</small></div>
      </div>`;
    await this.fadeTo(false, 400);
    const up = run.deck.filter(canUpgrade);
    if (!up.length) s.querySelector('#rs-up').style.opacity = 0.4;
    await new Promise((resolve) => {
      s.querySelector('#rs-heal').onclick = () => {
        const h = restHeal(run); sfx('heal');
        FX.riseFx(this.world, v.player, { color: [0.5, 1.3, 0.5], n: 40 });
        this.refreshTop(); this.toastMsg(`HPが${h}回復した`);
        resolve();
      };
      s.querySelector('#rs-up').onclick = async () => {
        if (!up.length) return;
        sfx('click');
        const c = await this.pickFromDeck(up, { title: 'アップグレードするカードを選択', preview: 'upgrade' });
        if (c) { upgradeCard(run, c); sfx('upgrade'); FX.sparks(this.world, v.player.centerPoint(), { n: 30 }); this.toastMsg(`${CARDS[c.id].name} を鍛えた`); resolve(); }
      };
    });
    s.querySelector('.restopts').remove();
    await wait(800);
    this.world.lantern.color.set('#ffb366');
  }

  // ---------------------------------------------------------------- shop
  async shopNode() {
    this.clearScreens();
    await this.fadeTo(true, 250);
    this.vignette(this.stageForFloor(), [['merchant', 3.6, -0.2], ['campfire', 2.0, 0.6]]);
    playMusic('shop');
    const run = this.run;
    const shop = makeShop(run);
    const s = this.screen('shop', 'screen dim');
    await this.fadeTo(false, 300);
    const render = () => {
      s.innerHTML = `<div class="screen-head" style="top:52px"><div class="ttl">迷い込んだ商人</div><div class="merchant-talk">「いらっしゃい。灯守さんの旅路に役立つ品を揃えてるよ」</div></div>
        <div style="position:absolute;left:0;right:0;top:136px;display:flex;flex-direction:column;align-items:center">
          <div class="shopgrid"></div><div class="shopitems"></div></div>
        <div class="screen-foot"><button class="btn gold" id="sh-leave">店を出る</button></div>`;
      const grid = s.querySelector('.shopgrid');
      for (const it of shop.cards) {
        const slot = el('div', 'cardslot' + (it.sold ? ' sold' : ''));
        slot.style.height = '240px';
        if (!it.sold) {
          const c = cardElement(it.card);
          c.style.transform = 'scale(0.92)';
          slot.appendChild(c);
          const pr = el('div', `price${run.gold < it.price ? ' cant' : ''}${it.sale ? ' sale' : ''}`, `<img class="ico s pix" src="${iconURL('gold', { size: 16 })}">${it.price}`);
          pr.style.cssText += ';position:absolute;bottom:0;left:0;right:0';
          slot.appendChild(pr);
          c.addEventListener('click', () => {
            if (run.gold < it.price) { sfx('error'); this.toastMsg('ゴールドが足りない'); return; }
            run.gold -= it.price; it.sold = true; run.deck.push(it.card); sfx('coin'); hideTip(); this.refreshTop(); render();
          });
        }
        grid.appendChild(slot);
      }
      const items = s.querySelector('.shopitems');
      const add = (html, price, sold, tip, buy) => {
        const d = el('div', 'shopitem panel' + (sold ? ' sold' : ''), `${html}<div class="price${run.gold < price ? ' cant' : ''}"><img class="ico s pix" src="${iconURL('gold', { size: 16 })}">${price}</div>`);
        bindTip(d, tip);
        d.addEventListener('click', () => {
          if (run.gold < price) { sfx('error'); this.toastMsg('ゴールドが足りない'); return; }
          if (buy() === false) return;
          run.gold -= price; hideTip(); this.refreshTop(); render();
        });
        items.appendChild(d);
      };
      for (const r of shop.relics) add(`<img class="pix" src="${iconURL(RELICS[r.id].icon, { size: 48 })}"><div class="nm">${RELICS[r.id].name}</div>`, r.price, r.sold, () => [{ title: RELICS[r.id].name, body: RELICS[r.id].text }], () => { addRelic(run, r.id); r.sold = true; sfx('relic'); });
      for (const p of shop.potions) add(`<img class="pix" src="${iconURL('potion', { size: 48, tint: POTIONS[p.id].color })}"><div class="nm">${POTIONS[p.id].name}</div>`, p.price, p.sold, () => [{ title: POTIONS[p.id].name, body: POTIONS[p.id].text }], () => { if (!addPotion(run, p.id)) { this.toastMsg('霊薬の所持数が上限だ'); sfx('error'); return false; } p.sold = true; sfx('potion'); });
      add(`<img class="pix" src="${iconURL('exhaustpile', { size: 48 })}"><div class="nm">カードの除去</div>`, shop.removePrice, shop.removeUsed, () => [{ title: 'カードの除去', body: 'デッキからカードを1枚取り除く。（1回のみ）' }], () => {
        this.pickFromDeck(run.deck, { title: '除去するカードを選択' }).then((c) => {
          if (!c) { run.gold += shop.removePrice; this.refreshTop(); render(); return; }
          removeCard(run, c); run.removals++; shop.removeUsed = true; sfx('exhaust'); this.refreshTop(); render();
        });
        return true;
      });
      s.querySelector('#sh-leave').onclick = () => { sfx('click'); this.shopDone(); };
    };
    render();
    await new Promise((r) => { this.shopDone = r; });
    hideTip();
    s.remove();
  }

  // ---------------------------------------------------------------- event
  async eventNode() {
    this.clearScreens();
    await this.fadeTo(true, 250);
    const ev = pickEvent(this.run);
    const prop = SCENE_PROP[ev.scene];
    const v = this.vignette(this.stageForFloor(), prop ? [[prop, 1.4, -0.2, { scale: 1.2 }]] : []);
    if (prop === 'forge' || prop === 'spring') v.actors[0].group.position.x = 1.0;
    this.world.focusOn(v.player.centerPoint().add({ x: 2.2, y: 0, z: 0 }), { zoom: 0.8, lambda: 2 });
    playMusic('map');
    const run = this.run;
    const s = this.screen('event', 'screen');
    const box = el('div', 'panel choicebox', `<div class="ttl" style="font-size:26px">${ev.title}</div><div class="etext">${ev.text}</div><div class="opts"></div>`);
    s.appendChild(box);
    await this.fadeTo(false, 400);
    let result = 'ok';
    const api = {
      chooseDeckCard: (filter, prompt) => this.pickFromDeck(run.deck.filter(filter), { title: prompt, preview: prompt.includes('アップグレード') ? 'upgrade' : null }),
      cardReward: (cards) => this.cardChoice(cards),
      combat: async (enc, extra) => {
        s.classList.add('hidden');
        const r = await this.combatNode('normal', { enc, ...extra });
        if (r === 'defeat') result = 'defeat';
        return r === 'victory';
      },
      gainRelic: (id) => { if (id) { addRelic(run, id); sfx('relic'); this.toastMsg(`レリック「${RELICS[id].name}」を手に入れた`); } },
      gainPotion: (id) => { if (addPotion(run, id)) sfx('potion'); },
    };
    const opts = box.querySelector('.opts');
    const text = await new Promise((resolve) => {
      for (const o of ev.options) {
        const ok = !o.can || o.can(run);
        const b = el('button', 'btn choice', `${o.label}<small>${o.desc}</small>`);
        b.disabled = !ok;
        b.onclick = async () => { sfx('click'); opts.innerHTML = ''; resolve(await o.resolve(run, api)); };
        opts.appendChild(b);
      }
    });
    if (result === 'defeat') return 'defeat';
    s.classList.remove('hidden');
    this.refreshTop();
    if (run.hp <= 0) return 'defeat';
    if (text) {
      box.querySelector('.etext').textContent = text;
      await new Promise((r) => { const b = el('button', 'btn gold choice', '先へ進む'); b.style.textAlign = 'center'; b.onclick = () => { sfx('click'); r(); }; opts.appendChild(b); });
    }
    s.remove();
    return result;
  }

  // ---------------------------------------------------------------- treasure
  async treasureNode() {
    this.clearScreens();
    await this.fadeTo(true, 250);
    const v = this.vignette(this.stageForFloor(), [['chest', 1.2, 0.2, { scale: 1.3 }]]);
    this.world.focusOn(v.actors[0].centerPoint(), { zoom: 0.8, lambda: 2 });
    const s = this.screen('treasure', 'screen center');
    s.innerHTML = `<div class="panel" style="padding:14px 24px;margin-top:380px;text-align:center"><div class="ttl" style="font-size:24px">古びた宝箱</div><button class="btn gold" id="tr-open" style="margin-top:10px">開ける</button></div>`;
    await this.fadeTo(false, 300);
    await new Promise((r) => { s.querySelector('#tr-open').onclick = r; });
    sfx('relic');
    v.actors[0].play('open', { hold: true });
    FX.flare(this.world, v.actors[0].centerPoint(), { color: FX.COLORS.light, size: 5, dur: 800 });
    FX.sparks(this.world, v.actors[0].centerPoint(), { n: 40, color: [1.4, 1.2, 0.5], up: 4 });
    const run = this.run;
    const relic = relicChoice(run, [['common', 50], ['uncommon', 37], ['rare', 13]]);
    const gold = run.rng.int(25, 45);
    if (relic) addRelic(run, relic);
    run.gold += gold;
    this.refreshTop();
    s.innerHTML = `<div class="panel" style="padding:14px 24px;margin-top:380px;text-align:center;min-width:380px">
      ${relic ? `<div class="row" style="justify-content:center"><img class="pix" style="width:48px;height:48px" src="${iconURL(RELICS[relic].icon, { size: 48 })}"><div style="text-align:left"><div class="kw">${RELICS[relic].name}</div><div class="sub" style="font-size:14px">${RELICS[relic].text}</div></div></div>` : ''}
      <div style="margin:8px 0">${gold} ゴールドを手に入れた</div><button class="btn gold" id="tr-next">先へ進む</button></div>`;
    await new Promise((r) => { s.querySelector('#tr-next').onclick = () => { sfx('click'); r(); }; });
    s.remove();
  }

  // ---------------------------------------------------------------- endings
  async gameOver(won) {
    this.clearScreens();
    const run = this.run;
    const mins = Math.max(1, Math.round((Date.now() - run.stats.startTime) / 60000));
    if (won) {
      await this.fadeTo(true, 600);
      this.vignette('summit', []);
      this.world.setBossPhase2 && null;
      this.world.focusOn(this.world.actors.values().next().value.centerPoint(), { zoom: 0.7, lambda: 1 });
      this.world.lantern.intensity = 14;
      FX.pillar(this.world, { x: -3.0, y: 0, z: 0.3 }, { color: FX.COLORS.light, height: 20, width: 2.5, dur: 4000 });
      playMusic('title');
    } else {
      playMusic('rest');
    }
    const s = this.screen('end', 'screen dim center');
    s.innerHTML = `
      <div class="ttl" style="font-size:${won ? 48 : 44}px">${won ? '大灯、再び' : '灯、尽きる'}</div>
      <div class="sub" style="margin-top:10px;text-align:center;line-height:1.8">${won
        ? '虚ろの灯王は灰へと還り、尖塔の頂に再び大いなる灯がともった。<br>夜明けの光が、霧の森の隅々までを照らしていく。'
        : '灯守の旅は、ここで終わった。<br>しかし灯は、次の灯守へと受け継がれる。'}</div>
      <div class="panel endstats">
        <div><span>到達階層</span><span>第${run.floor}層</span></div>
        <div><span>倒した敵</span><span>${run.stats.kills}</span></div>
        <div><span>使用したカード</span><span>${run.stats.cardsPlayed}枚</span></div>
        <div><span>与えたダメージ</span><span>${run.stats.damageDealt}</span></div>
        <div><span>最終デッキ</span><span>${run.deck.length}枚</span></div>
        <div><span>レリック</span><span>${run.relics.length}個</span></div>
        <div><span>プレイ時間</span><span>約${mins}分</span></div>
      </div>
      <div class="row" style="margin-top:22px"><button class="btn gold" id="e-again">もう一度挑む</button><button class="btn" id="e-title">タイトルへ</button></div>`;
    if (won) sfx('victory'); else sfx('defeat');
    await this.fadeTo(false, 700);
    window.__ended = won ? 'victory' : 'defeat';
    await new Promise((r) => {
      s.querySelector('#e-again').onclick = async () => { sfx('click'); await this.fadeTo(true, 400); r(); this.startRun(randomSeed()); };
      s.querySelector('#e-title').onclick = async () => { sfx('click'); await this.fadeTo(true, 400); r(); this.title(); };
    });
  }
}
