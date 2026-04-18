# Open TODOs — ioBroker AP Systems EZ1 Adapter

**Generated:** 2026-04-18  
**Sources:** [design-review.md](./design-review.md), [architecture-evaluation.md](./architecture-evaluation.md)

---

## Prioritized Backlog

| # | Item | Severity | Effort | Impact | ROI |
|---|------|----------|--------|--------|-----|
| 1 | Add `axios` timeout (5 s) to prevent poll stall | HIGH | 5 min | Prevents hung adapter on offline inverter | **Highest** |
| 2 | Store timer handle; call `clearInterval` in `onUnload` | HIGH | 10 min | Prevents resource leak on adapter restart | **Highest** |
| 3 | Fix `getStateAsync` existence check to use full state path (e.g. `DeviceInfo.MaxPower`) | MEDIUM | 15 min | Eliminates redundant `createState` + DB write every poll tick | **High** |
| 4 | Add `connected` boolean state — `true` on successful poll, `false` on error | MEDIUM | 30 min | Gives operators visibility when inverter is offline | **High** |
| 5 | Fix typo in error message: "in valid config" → "invalid config" | LOW | 2 min | Operator UX clarity | **High** |
| 6 | Downgrade payload logging from `log.info` to `log.debug` | LOW | 10 min | Reduces log noise (5 payloads × every poll tick) | **Medium** |
| 7 | Reduce `DeviceInfo` + `MaxPower` poll to 1×/hour | LOW | 1 hr | Reduces device HTTP load; separates static vs live data | **Medium** |
| 8 | Write real unit tests — replace `5 === 5` stub | LOW | 2–4 hrs | Catches regressions; currently zero real coverage | **Medium** |
| 9 | Remove dead `handleClientError` on adapter class | LOW | 5 min | Never called — dead code | **Low** |
| 10 | Remove unused client aggregate methods (`getTotalOutput`, `getTotalEnergyToday`, `getTotalEnergyLifetime`) | LOW | 10 min | Already computed in `setOutputDataStates` — duplication | **Low** |
| 11 | Add `ConsecutiveErrors` number state for ioBroker alerting rules | LOW | 2 hrs | Enables automated alerts on sustained outage | **Low** |

---

## ROI Scoring

ROI = Impact ÷ Effort. Items ranked where small effort yields large operational or correctness benefit.

| Rating | Criteria |
|--------|---------|
| **Highest** | Trivial effort, prevents real failures — fix in next commit |
| **High** | Low effort, meaningful correctness or UX gain — fix this sprint |
| **Medium** | Moderate effort, quality improvement — schedule for next release |
| **Low** | Cleanup — batch with other housekeeping work |

---

## Suggested Commit Order

```
fix: add axios timeout to prevent poll stall on offline inverter        (#1)
fix: store poll timer handle and clear on adapter unload                (#2)
fix: correct getStateAsync path to prevent redundant createState calls  (#3)
feat: add connected boolean state for operator visibility               (#4)
fix: correct typo in invalid config error message                       (#5)
chore: downgrade payload logging to debug level                         (#6)
```
