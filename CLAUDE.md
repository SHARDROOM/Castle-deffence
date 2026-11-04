# Castle-deffence

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (SHARDROOM/Castle-deffence). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code layout

- `index.html`: the whole game (HUD, three.js scene, game loop). Uses the globals `Combat`, `Defense`, `Armory`, `Waves` and `Enemies`.
- `combat.js`: decides enemy damage and kill rewards. Runs in the browser via a plain `<script>` and in Node via `require`.
- `defense.js`: decides incoming damage to the player (dodge, parry, guard). Loaded the same way as `combat.js`.
- `armory.js`: weapon, part and item data, weapon stat calculation, and gold, gear and item transactions. Loaded the same way.
- `waves.js`: the wave director. Decides wave composition, the clear delay and thief spawns on game time, and returns commands that `index.html` executes.
- `enemies.js`: soldier behaviour (movement, kiting, dodge rolls, melee and shooting) for regular enemies. Navigation and effects are injected; rendering stays in `index.html`. The boss, thief and airship are still in `index.html`.
- Tests: `node --test` (Node 18+, no dependencies)
