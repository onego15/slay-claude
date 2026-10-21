// Random events ("?" nodes). Each option resolves via an `api` supplied by the UI or the simulator:
//   api.chooseDeckCard(filter, prompt) -> card | null
//   api.cardReward(cards) -> picks (or skips) one
//   api.combat(enemyIds) -> starts a fight; resolves after victory
//   api.gainRelic(id), api.gainPotion(id)
import { makeCard, canUpgrade, REWARD_POOL } from './cards.js';
import { relicChoice, cardChoices, upgradeCard, removeCard, restHeal } from './run.js';
import { POTION_POOL } from './relics.js';
import { ENCOUNTERS } from './enemies.js';

export const EVENTS = {};
const def = (id, o) => { EVENTS[id] = { id, ...o }; };

def('ember_shrine', {
  title: '残り火の祠', scene: 'shrine',
  text: '苔むした小さな祠に、消えかけの灯がひとつ揺れている。\n手をかざすと、懐かしい温もりが指先に伝わってきた。',
  options: [
    { label: '灯を分けてもらう', desc: 'カード1枚をアップグレード', can: (run) => run.deck.some(canUpgrade),
      async resolve(run, api) { const c = await api.chooseDeckCard(canUpgrade, 'アップグレードするカードを選択'); if (c) upgradeCard(run, c); return '灯が刃に宿り、技が研ぎ澄まされた。'; } },
    { label: '灯に祈る', desc: '最大HP+6',
      async resolve(run) { run.maxHp += 6; run.hp += 6; return '静かな祈りが、身体の奥に小さな火を灯した。'; } },
    { label: '灯を持ち去る', desc: 'レリックを得る。呪い「未練」を得る',
      async resolve(run, api) { api.gainRelic(relicChoice(run)); run.deck.push(makeCard('regret')); return '祠の灯は消えた。背後で、誰かのすすり泣きが聞こえた気がした。'; } },
  ],
});

def('lost_peddler', {
  title: '迷い商人', scene: 'peddler',
  text: '霧の中から、荷車を引いた商人が現れた。\n「やれやれ、道に迷ってしまってね……。何か買っていかないかい？」',
  options: [
    { label: '掘り出し物を買う', desc: '60ゴールド払い、レリックを得る', can: (run) => run.gold >= 60,
      async resolve(run, api) { run.gold -= 60; api.gainRelic(relicChoice(run)); return '「毎度あり。そいつはきっと役に立つよ」'; } },
    { label: '霊薬を分けてもらう', desc: '30ゴールド払い、霊薬を2つ得る', can: (run) => run.gold >= 30,
      async resolve(run, api) { run.gold -= 30; api.gainPotion(run.rng.pick(POTION_POOL)); api.gainPotion(run.rng.pick(POTION_POOL)); return '小瓶が鞄の中でかちりと鳴った。'; } },
    { label: '道を教えて立ち去る', desc: '20ゴールドを得る',
      async resolve(run) { run.gold += 20; return '「助かったよ、灯守さん。これはお礼だ」'; } },
  ],
});

def('moon_spring', {
  title: '月の泉', scene: 'spring',
  text: '木々が途切れた先に、澄んだ泉が月光を映している。\n水面には、いくつもの淡い光が漂っていた。',
  options: [
    { label: '水を飲む', desc: 'HPを最大値の30%回復',
      async resolve(run) { const h = restHeal(run); return `冷たい水が喉を潤す。HPが${h}回復した。`; } },
    { label: '身を清める', desc: 'デッキからカード1枚を削除', can: (run) => run.deck.length > 5,
      async resolve(run, api) { const c = await api.chooseDeckCard(() => true, '削除するカードを選択'); if (c) removeCard(run, c); return '迷いが水に溶けて消えていった。'; } },
    { label: '泉の底へ潜る', desc: 'HPを8失い、レアカードを1枚選んで得る', can: (run) => run.hp > 8,
      async resolve(run, api) { run.hp -= 8; await api.cardReward(cardChoices(run, 'elite', 3, 'rare')); return '泉の底で、古い灯守の記憶に触れた。'; } },
  ],
});

def('whispering_ash', {
  title: '囁く灰', scene: 'ash',
  text: '焼け落ちた礼拝堂の跡。積もった灰の山から、かすれた声がする。\n「力が欲しいか……灯守よ……」',
  options: [
    { label: '力を受け入れる', desc: '最大HP-7。レリックを得る', can: (run) => run.maxHp > 20,
      async resolve(run, api) { run.maxHp -= 7; run.hp = Math.min(run.hp, run.maxHp); api.gainRelic(relicChoice(run, [['uncommon', 60], ['rare', 40]])); return '灰が腕に絡みつき、冷たい力が流れ込んだ。'; } },
    { label: '灰の中を探る', desc: '90ゴールドを得る。呪い「未練」を得る',
      async resolve(run) { run.gold += 90; run.deck.push(makeCard('regret')); return '金貨を拾い上げると、声は嘲るように笑った。'; } },
    { label: '耳を塞いで進む', desc: '何も起こらない',
      async resolve() { return '声は霧の中に遠ざかっていった。'; } },
  ],
});

def('ghost_smith', {
  title: '鍛冶師の亡霊', scene: 'forge',
  text: '朽ちた鍛冶場で、半透明の鍛冶師が黙々と槌を振るっている。\n火床にはまだ、青白い炎が燃えていた。',
  options: [
    { label: '鍛えてもらう', desc: 'ランダムなカード2枚をアップグレード', can: (run) => run.deck.some(canUpgrade),
      async resolve(run) {
        const ups = run.rng.shuffle(run.deck.filter(canUpgrade)).slice(0, 2);
        ups.forEach((c) => upgradeCard(run, c));
        return '槌の音が二度響き、刃が鈍く輝いた。';
      } },
    { label: '武器を譲り受ける', desc: 'HPを10失い、「剣の嵐」を得る', can: (run) => run.hp > 10,
      async resolve(run) { run.hp -= 10; run.deck.push(makeCard('blade_storm')); return '亡霊は無言で一振りの剣を差し出した。握ると掌が焼けるように熱い。'; } },
    { label: '静かに立ち去る', desc: '何も起こらない',
      async resolve() { return '槌の音だけが、いつまでも背後に響いていた。'; } },
  ],
});

def('mist_crossroads', {
  title: '霧の分かれ道', scene: 'crossroads',
  text: '道が二手に分かれている。左の霧の奥には宝箱らしき影、\nそしてそれを守るように光る、いくつもの眼。',
  options: [
    { label: '宝を奪いに行く', desc: '強敵と戦う。勝利すると追加で50ゴールドとレリック',
      async resolve(run, api) {
        const enc = run.rng.pick(ENCOUNTERS.hard);
        const won = await api.combat(enc, { bonusGold: 50, bonusRelic: true });
        return won ? '番人を退け、宝箱を開けた。' : '';
      } },
    { label: '回り道をする', desc: 'HPを5失う',
      async resolve(run) { run.hp = Math.max(1, run.hp - 5); return '茨の茂みを抜ける間に、いくつか傷を負った。'; } },
  ],
});

def('wandering_bard', {
  title: '旅の吟遊詩人', scene: 'bard',
  text: '焚き火のそばで、吟遊詩人が古い歌を口ずさんでいる。\n「やあ旅人。灯守の歌を知っているかい？」',
  options: [
    { label: '歌に耳を傾ける', desc: 'HPを15回復',
      async resolve(run) { const b = run.hp; run.heal(15); return `穏やかな旋律が疲れを癒やした。HPが${run.hp - b}回復した。`; } },
    { label: '歌を教わる', desc: 'アンコモンカードを1枚選んで得る',
      async resolve(run, api) { await api.cardReward(cardChoices(run, 'normal', 3, 'uncommon')); return '「その歌が、きっと君を導くよ」'; } },
  ],
});

export const EVENT_IDS = Object.keys(EVENTS);

export function pickEvent(run) {
  const fresh = EVENT_IDS.filter((e) => !run.seenEvents.includes(e));
  const id = run.rng.pick(fresh.length ? fresh : EVENT_IDS);
  run.seenEvents.push(id);
  return EVENTS[id];
}
