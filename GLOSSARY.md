# 노을 성채 방어전

성채를 지키며 웨이브마다 몰려오는 적을 총과 검으로 막는 1인칭 브라우저 게임.

## Language

### 전투

**Combat**:
적에게 들어가는 피해와 처치 보상을 결정하는 module (`combat.js`).
_Avoid_: damage system, 데미지 매니저

**Attack kind** (공격 종류):
피해가 어떤 공격에서 왔는지를 나타내는 이름(`slash`, `wave`, `bullet`, `burn` …). 배율과 보상 규칙은 이 이름으로 정해진다.
_Avoid_: damage type, source flag(`byWave` 같은 임시 플래그)

**Base damage** (기본 피해):
업그레이드·방패·보스 배율을 곱하기 전, 공격 고유의 피해 수치.
_Avoid_: raw damage

**Target profile** (대상 프로필):
어떤 공격이 맞힐 수 있는 적의 조건에 붙인 이름(`melee`, `aimed`, `sweep`, `ray`, `blunt`). 구르는 적, 비행선, 낙하 중인 적을 각각 맞힐 수 있는지가 다르다.
_Avoid_: filter, skip 조건

**Kill reward** (처치 보상):
적 하나를 처치해서 얻는 점수, XP, 골드, 스킬 게이지, 보급품 드롭, 피의 광분의 묶음.
_Avoid_: loot

**Wave clear** (웨이브 클리어):
도둑을 뺀 모든 적이 사라진 순간. 체력을 회복하고 다음 웨이브를 예약한다.

### 적

**Thief** (도둑):
골드를 훔쳐 달아나는 적. 웨이브 클리어 판정에서 빠진다.

**Iron Giant** (철의 거인):
방패를 든 보스. 방패 정면 공격은 피해가 줄어든다(광폭화하면 더 많이).
_Avoid_: boss만 쓰는 것 (코드에선 `e.boss`)
