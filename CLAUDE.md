# Castle-deffence

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (SHARDROOM/Castle-deffence). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code layout

- `index.html`: the whole game (HUD, three.js scene, game loop). Uses the globals `Combat`, `Defense` and `Armory`.
- `combat.js`: decides enemy damage and kill rewards. Runs in the browser via a plain `<script>` and in Node via `require`.
- `defense.js`: decides incoming damage to the player (dodge, parry, guard). Loaded the same way as `combat.js`.
- `armory.js`: weapon, part and item data, weapon stat calculation, and gold, gear and item transactions. Loaded the same way.
- Tests: `node --test` (Node 18+, no dependencies)
