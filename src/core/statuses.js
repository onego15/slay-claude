// Status effects shared by player and enemies.
// kind: buff/debuff; dur: true when it ticks down each turn.
export const STATUSES = {
  strength: { name: '筋力', kind: 'buff', icon: 'str', desc: (n) => `アタックのダメージが${n}増加する。` },
  dexterity: { name: '敏捷', kind: 'buff', icon: 'dex', desc: (n) => `カードで得るブロックが${n}増加する。` },
  weak: { name: '弱体', kind: 'debuff', icon: 'weak', dur: true, desc: (n) => `与えるアタックのダメージが25%減少する。残り${n}ターン。` },
  vulnerable: { name: '脆弱', kind: 'debuff', icon: 'vuln', dur: true, desc: (n) => `受けるアタックのダメージが50%増加する。残り${n}ターン。` },
  burn: { name: '灼熱', kind: 'debuff', icon: 'burn', desc: (n) => `ターン開始時、ブロックを無視して${n}ダメージを受け、灼熱が1減る。` },
  radiance: { name: '輝き', kind: 'buff', icon: 'radiance', desc: (n) => `灯火の力。${n}個蓄えている（最大10）。消費するカードで力を解き放つ。` },
  thorns: { name: '反撃', kind: 'buff', icon: 'thorns', desc: (n) => `アタックを受けるたび、攻撃者に${n}ダメージを与える。` },
  bulwark: { name: '堅守', kind: 'buff', icon: 'bulwark', desc: () => `ターン開始時にブロックが消えない。` },
  beacon: { name: '灯台', kind: 'buff', icon: 'beacon', desc: (n) => `ターン開始時、輝きを${n}得る。` },
  burning_soul: { name: '燃ゆる魂', kind: 'buff', icon: 'burnsoul', desc: (n) => `ターン開始時、全ての敵に灼熱${n}を与える。` },
  ash_pact: { name: '灰の契約', kind: 'buff', icon: 'ashpact', desc: (n) => `カードを焼却するたび、ブロックを${n}得る。` },
  solar_heart: { name: '太陽の心臓', kind: 'buff', icon: 'solar', desc: (n) => `輝きを得るたび、ランダムな敵に${n}ダメージを与える。` },
  // enemy-only
  plated: { name: '甲殻', kind: 'buff', icon: 'plated', desc: (n) => `ターン終了時ブロックを${n}得る。ブロックされないアタックを受けると1減る。` },
  ritual: { name: '戦意', kind: 'buff', icon: 'ritual', desc: (n) => `ターン終了時、筋力を${n}得る。` },
  undying: { name: '不死', kind: 'buff', icon: 'undying', desc: () => `倒されると一度だけ、HP40%で蘇る。` },
  regrowth: { name: '再生', kind: 'buff', icon: 'regrowth', desc: (n) => `ターン終了時、HPを${n}回復する。` },
  stoneskin: { name: '石化', kind: 'buff', icon: 'stone', desc: () => `受けるダメージが半減する（灼熱は除く）。` },
};

export const STATUS_ORDER = Object.keys(STATUSES);
