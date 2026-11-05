// Waves: 웨이브 진행과 적 등장 일정을 정하는 module (웨이브 디렉터).
//
// 몇 웨이브인지, 그 웨이브에 어떤 적이 몇 명 나오는지, 클리어 후 언제 다음 웨이브가 오는지,
// 도둑이 언제 나타나는지를 정해서 명령 목록으로 돌려준다. 시간은 모두 게임 시간(dt)이다:
// 일시정지·상점·레벨업 중에는 tick이 불리지 않으므로 타이머도 멈춘다.
// 적의 3D 모델·위치·알림 표시 같은 실행은 index.html의 runWaveCommands가 명령을 보고 한다.
//
// 브라우저에서는 전역 `Waves`, Node(테스트)에서는 require('./waves.js').
(function (root) {
  'use strict';

  const CLEAR_DELAY = 1.8;          // 웨이브 클리어 후 다음 웨이브까지 (초, 게임 시간)
  const FIRST_THIEF = 60;           // 판 시작 후 첫 도둑 판정까지
  const isBossWave = w => w % 5 === 0;           // 5웨이브마다 철의 거인
  const isEnraged = w => Math.floor(w / 5) >= 2; // 10웨이브부터 광폭화한 철의 거인

  // 웨이브 시작 알림 (리팩터 전 startWave와 같은 순서)
  const NOTICES = [
    [w => w === 11, '비행선이 나타났어요! 칼로 화살을 패링하면 바로 격추돼요', 0xffd166],
    [w => w === 2, '구르며 피하는 암살자가 나타나요', 0xffd166],
    [w => w === 6, '깃발을 든 기수가 나타나요: 주변 적을 강화해요', 0x8fb8ff],
    [w => w === 3, '느리지만 단단한 중갑기사가 나타나요', 0xc9d0da],
    [isBossWave, w => isEnraged(w) ? '광폭화한 철의 거인이 성문을 부수고 들어와요' : '철의 거인이 성문으로 들어와요', 0xff8a6a],
  ];

  // 일반 적 한 명의 종류. bannerCount = 지금 살아 있는 깃발 기수 수
  function pickType(wave, bannerCount, rng) {
    const pool = ['ranged', 'ranged', 'speed'];
    if (wave >= 2) pool.push('dodger', 'speed');
    if (wave >= 3) pool.push('heavy');
    if (wave >= 5) pool.push('dodger', 'heavy');
    // 6웨이브부터 깃발 기수 (동시에 최대 2명)
    if (wave >= 6 && bannerCount < 2 && rng() < .18) return 'banner';
    return pool[Math.floor(rng() * pool.length)];
  }

  // 일반 적 수: 3 + 2w, 보스 웨이브는 그 40%(올림) + 보스
  const regularCount = w => isBossWave(w) ? Math.ceil((3 + w * 2) * 0.4) : 3 + w * 2;
  // 비행선 수: 11웨이브부터 1대, 16웨이브부터 2대
  const airshipCount = w => w >= 16 ? 2 : w >= 11 ? 1 : 0;
  // 도둑 동시 최대 수: 2웨이브부터 1명, 8웨이브부터 2명
  const thiefCap = w => w >= 8 ? 2 : w >= 2 ? 1 : 0;

  const count = (enemies, type) => enemies.filter(o => o.type === type).length;

  // 웨이브 w를 시작하는 명령들
  //   {type:'waveStart', wave}       전역 wave를 맞춤 (스폰보다 먼저)
  //   {type:'spawn', kind}           적 한 명
  //   {type:'bossRoar', enraged}     보스 등장 연출
  //   {type:'airship'}               비행선 한 대
  //   {type:'notice', text, color}   알림
  //   {type:'waveBanner', wave}      "웨이브 N" 배너와 HUD
  function waveCommands(w, enemies, rng) {
    const cmds = [{ type: 'waveStart', wave: w }];
    let banners = count(enemies, 'banner');
    for (let i = 0; i < regularCount(w); i++) {
      const kind = pickType(w, banners, rng);
      if (kind === 'banner') banners++;
      cmds.push({ type: 'spawn', kind });
    }
    if (isBossWave(w)) cmds.push({ type: 'spawn', kind: 'boss' }, { type: 'bossRoar', enraged: isEnraged(w) });
    for (let i = 0; i < airshipCount(w); i++) cmds.push({ type: 'airship' });
    for (const [when, text, color] of NOTICES) {
      if (when(w)) cmds.push({ type: 'notice', text: typeof text === 'function' ? text(w) : text, color });
    }
    cmds.push({ type: 'waveBanner', wave: w });
    return cmds;
  }

  function create({ rng = Math.random } = {}) {
    const d = {
      wave: 1,
      nextWaveIn: null,   // 다음 웨이브까지 남은 게임 시간. null = 예약 없음
      thiefTimer: FIRST_THIEF,
      // 새 판: 웨이브 startWave(기본 1, 테스트 모드에선 고른 웨이브)부터. 이전 판의 예약은 모두 사라진다.
      start(enemies, startWave = 1) {
        const w = Math.max(1, Math.floor(startWave) || 1);
        d.wave = w; d.nextWaveIn = null; d.thiefTimer = FIRST_THIEF;
        return waveCommands(w, enemies, rng);
      },
      // 도둑을 뺀 적이 모두 사라졌을 때. 다음 웨이브를 예약한다.
      waveCleared() { d.nextWaveIn = CLEAR_DELAY; },
      // 게임 시간 dt만큼 진행. enemies = 지금 살아 있는 적
      tick(dt, enemies) {
        const cmds = [];
        d.thiefTimer -= dt; // 드물게 금화 도둑 등장
        if (d.thiefTimer <= 0) {
          d.thiefTimer = 20 + rng() * 15; // 20~35초마다 60% 확률
          if (count(enemies, 'thief') < thiefCap(d.wave) && rng() < .6) cmds.push({ type: 'spawn', kind: 'thief' }, { type: 'thiefNotice' });
        }
        if (d.nextWaveIn !== null) {
          d.nextWaveIn -= dt;
          if (d.nextWaveIn <= 0) {
            d.nextWaveIn = null; d.wave++;
            cmds.push(...waveCommands(d.wave, enemies, rng));
          }
        }
        return cmds;
      },
    };
    return d;
  }

  const Waves = { create, waveCommands, pickType, regularCount, airshipCount, thiefCap, isBossWave, isEnraged, CLEAR_DELAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = Waves;
  else root.Waves = Waves;
})(typeof globalThis !== 'undefined' ? globalThis : this);
