// Combat: 적에게 들어가는 피해와 처치 보상을 결정하는 module.
//
// 호출부는 공격 고유의 기본 수치(base)와 종류(kind), 공격 위치(from)만 넘긴다.
// 배율(dmgMul, 방패, 보스 배수), 피격 깜빡임·끝없는 갈망, 처치 보상, 웨이브 클리어 판정은
// 모두 여기서 정한다. 화면·사운드·전역 상태 적용은 index.html의 applyHit가 결과를 보고 한다.
//
// 브라우저에서는 전역 `Combat`, Node(테스트)에서는 require('./combat.js').
(function (root) {
  'use strict';

  // ---------- 보스 방패 ----------
  const SHIELD_STATES = new Set(['walk', 'deflect', 'chargePrep', 'charge', 'recover', 'bashPrep', 'bash', 'bashEnd']);
  const shieldMul = e => e.enraged ? .3 : .5; // 방패에 막힌 피해 배수 (광폭화 땐 70% 감소)
  function shieldFacing(e, x, z) { // 공격자가 방패 앞쪽에 있는지
    if (!SHIELD_STATES.has(e.state)) return false;
    const dx = x - e.g.position.x, dz = z - e.g.position.z, l = Math.hypot(dx, dz) || 1;
    return (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / l > 0.3;
  }

  // ---------- 처치 골드 ----------
  const GOLD = { airship: 60, ranged: 10, speed: 8, heavy: 18, dodger: 12, banner: 15, boss: 150 };

  // ---------- 공격 종류별 정책 ----------
  // mul:       업그레이드 피해 배수(dmgMul)를 곱하는가
  // shield:    보스 방패 정면일 때 'mul' = shieldMul, 'half' = 0.5, null = 방패 판정 없음
  // boss:      보스에게 곱하는 배수
  // flash:     피격 깜빡임을 주는가. false면 끝없는 갈망 회복도 없다.
  // killSkill: 처치 시 스킬 게이지를 주는가
  const P = (o) => Object.assign({ mul: true, shield: null, boss: 1, flash: true, killSkill: true }, o);
  const KINDS = {
    bullet: P({}),                          // 총알: 펠릿 합계. 크리·거리 감쇠·방패 mesh는 호출부가 base에 반영
    ricochet: P({}),                        // 저격 도탄
    headshot: P({}),                        // 저격 스킬: 자동 헤드샷
    bash: P({}),                            // 저격 스킬: 개머리판
    heli: P({ shield: 'mul' }),             // 헬기 사수
    flame: P({ shield: 'half', flash: false }), // 화염방사기
    burn: P({ mul: false, flash: false }),  // 화상 지속 피해
    slash: P({ shield: 'mul' }),            // 검 휘두르기
    wave: P({ shield: 'mul', killSkill: false }), // 검기: 처치해도 스킬 게이지 없음
    guardSlash: P({ shield: 'mul' }),       // 수호자 가드 해제 연속 베기
    greatSlash: P({ shield: 'mul' }),       // 대검 반격
    exec: P({ boss: 3 }),                   // 일반 처형
    execSplash: P({ shield: 'mul' }),       // 처형 베기의 주변 피해
    bossExec: P({}),                        // 보스 처형
    arrow: P({}),                           // 패링으로 되돌린 화살
    reflect: P({ mul: false }),             // 방패에 반사된 총알 (dmgMul은 반사 순간에 이미 반영)
    instakill: P({ mul: false }),           // 유도 화살이 비행선을 격추
  };

  // ---------- 대상 프로필 ----------
  // 공격마다 "맞힐 수 있는 적"의 조건이 다르다. 지금 동작을 그대로 이름 붙여 보존한다.
  const PROFILES = {
    melee: e => !(e.rollT > 0 || e.airship || e.dropY > 0), // 검 휘두르기, 가드 반격, 대검 반격
    aimed: e => !(e.airship || e.dropY > 0),                // 헬기 사수, 자동 헤드샷 (구르는 적도 맞힘)
    sweep: e => !(e.rollT > 0 || e.airship),                // 화염, 검기, 되돌린 화살 (낙하 중인 적도 맞힘)
    ray: e => !(e.rollT > 0),                               // 총알, 도탄 (비행선·낙하 중인 적도 맞힘)
    blunt: e => !e.airship,                                 // 개머리판, 처형 주변 피해, 반사탄
  };
  function targetable(e, profile) {
    const f = PROFILES[profile];
    if (!f) throw new Error('Unknown target profile: ' + profile);
    return f(e);
  }

  // 도둑을 뺀 마지막 적이 사라졌는가. removed는 아직 배열에 있어도, 이미 빠져 있어도 된다.
  function isWaveCleared(enemies, removed) {
    return removed.type !== 'thief' && !enemies.some(o => o !== removed && o.type !== 'thief');
  }

  function policyOf(kind) {
    const p = KINDS[kind];
    if (!p) throw new Error('Unknown attack kind: ' + kind);
    return p;
  }

  // 최종 피해량과 방패에 막혔는지
  function damageOf(e, attack, ctx) {
    const p = policyOf(attack.kind), from = attack.from;
    let dealt = attack.base * (p.mul ? ctx.dmgMul : 1);
    const shielded = !!(p.shield && e.boss && from && shieldFacing(e, from.x, from.z));
    if (shielded) dealt *= p.shield === 'half' ? .5 : shieldMul(e);
    if (e.boss) dealt *= p.boss;
    return { dealt, shielded };
  }

  function killOf(e, p, ctx) {
    const xp = Math.round(e.def.xp * (ctx.weaponKey === 'sword' ? 1.5 : 1)); // 일본도를 고르면 경험치 1.5배
    const score = e.def.score * ctx.wave;
    if (e.airship) { // 비행선: 보상은 바로, 몸체는 추락 연출 후 사라짐. 이미 추락 중이면 보상 없음
      if (e.dying) return null;
      return { airship: true, score, xp, skill: ctx.special ? 0 : ctx.killSkill, gold: GOLD.airship };
    }
    const ex = e.g.position.x, ez = e.g.position.z;
    const supply = ctx.weaponKey !== 'sword'; // 일본도를 고르면 보급 무기가 떨어지지 않음
    return {
      airship: false, score, xp,
      skill: p.killSkill && !ctx.special ? ctx.killSkill : 0,
      gold: e.type === 'thief' ? (e.stolen || 0) + 60 + ctx.wave * 10 : (GOLD[e.type] || 5), // 도둑: 주운 골드 + 큰 보너스
      rage: !!ctx.bloodRage, // 피의 광분
      drop: supply && ctx.rng() < 0.02 && ctx.pickupCount < 2 && ctx.cellFree(ex, ez),
      boss: !!e.boss,
      bossDrop: !!e.boss && supply,
      waveCleared: isWaveCleared(ctx.enemies, e),
    };
  }

  // 적 하나에게 공격 하나를 적용한다. 적의 hp·flash만 바꾸고, 나머지는 결과로 돌려준다.
  //   attack: {base, kind, from?: {x, z}}
  //   ctx:    {enemies, dmgMul, wave, weaponKey, special, crave, craveMul, playing,
  //            killSkill, bloodRage, pickupCount, cellFree(x, z), rng()}
  //   반환:   {applied, dealt, shielded, heal, killed, kill}
  //           kill은 처치 보상. 추락 중인 비행선처럼 보상이 없으면 null.
  function hit(e, attack, ctx) {
    const res = { applied: false, dealt: 0, shielded: false, heal: 0, killed: false, kill: null };
    if (!ctx.enemies.includes(e)) return res;
    const p = policyOf(attack.kind);
    const { dealt, shielded } = damageOf(e, attack, ctx);
    res.applied = true; res.dealt = dealt; res.shielded = shielded;
    e.hp -= dealt; if (p.flash) e.flash = .09;
    const crave = ctx.crave && p.flash && ctx.playing; // 끝없는 갈망: 맞힐 때·처치할 때 체력 회복
    if (crave) res.heal += .6 * ctx.craveMul;
    if (e.hp <= 0) {
      res.killed = true;
      if (crave) res.heal += 5 * ctx.craveMul;
      res.kill = killOf(e, p, ctx);
    }
    return res;
  }

  const Combat = { hit, damageOf, targetable, isWaveCleared, shieldFacing, shieldMul, GOLD, KINDS, PROFILES };
  if (typeof module !== 'undefined' && module.exports) module.exports = Combat;
  else root.Combat = Combat;
})(typeof globalThis !== 'undefined' ? globalThis : this);
