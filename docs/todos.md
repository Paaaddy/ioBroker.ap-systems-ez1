# Open TODOs — ioBroker AP Systems EZ1 Adapter

**Generated:** 2026-04-18  
**Sources:** [design-review.md](./design-review.md), [architecture-evaluation.md](./architecture-evaluation.md), [bottleneck-analysis.md](./bottleneck-analysis.md)

---

## Prioritized Backlog

| # | Item | Severity | Effort | Impact | ROI |
|---|------|----------|--------|--------|-----|
| ~~1~~ | ~~Add `axios` timeout (5 s) to prevent poll stall~~ | ~~HIGH~~ | ~~5 min~~ | ~~Prevents hung adapter on offline inverter~~ | ✅ Done |
| ~~2~~ | ~~Store timer handle; call `clearInterval` in `onUnload`~~ | ~~HIGH~~ | ~~10 min~~ | ~~Prevents resource leak on adapter restart~~ | ✅ Done |
| ~~3~~ | ~~Fix `getStateAsync` existence check to use full state path~~ | ~~MEDIUM~~ | ~~15 min~~ | ~~Eliminates redundant `createState` + DB write every poll tick~~ | ✅ Done |
| ~~4~~ | ~~Add `connected` boolean state — `true` on successful poll, `false` on error~~ | ~~MEDIUM~~ | ~~30 min~~ | ~~Gives operators visibility when inverter is offline~~ | ✅ Done |
| ~~5~~ | ~~Fix typo in error message: "in valid config" → "invalid config"~~ | ~~LOW~~ | ~~2 min~~ | ~~Operator UX clarity~~ | ✅ Done |
| ~~6~~ | ~~Downgrade payload logging from `log.info` to `log.debug`~~ | ~~LOW~~ | ~~10 min~~ | ~~Reduces log noise (5 payloads × every poll tick)~~ | ✅ Done |
| ~~7~~ | ~~Reduce `DeviceInfo` + `MaxPower` poll to 1×/hour~~ | ~~LOW~~ | ~~1 hr~~ | ~~Reduces device HTTP load; separates static vs live data~~ | ✅ Done |
| ~~8~~ | ~~Write real unit tests — replace `5 === 5` stub~~ | ~~LOW~~ | ~~2–4 hrs~~ | ~~Catches regressions; currently zero real coverage~~ | ✅ Done |
| ~~9~~ | ~~Remove dead `handleClientError` on adapter class~~ | ~~LOW~~ | ~~5 min~~ | ~~Never called — dead code~~ | ✅ Done |
| ~~10~~ | ~~Remove unused client aggregate methods (`getTotalOutput`, `getTotalEnergyToday`, `getTotalEnergyLifetime`)~~ | ~~LOW~~ | ~~10 min~~ | ~~Already computed in `setOutputDataStates` — duplication~~ | ✅ Done |
| 11 | Add `ConsecutiveErrors` number state for ioBroker alerting rules | LOW | 2 hrs | Enables automated alerts on sustained outage | **Low** |
| 12 | Fix `async/await` inside `forEach` in all `set*States` methods (`main.ts:105,123,161,190`) | CRITICAL | 30 min | States written before creation on first poll — data integrity | **Highest** |
| 13 | Add `.catch()` + `setConnected(false)` to `setOutputDataStates`, `setAlarmInfoStates`, `setOnOffStatusState` | HIGH | 15 min | Silent failures leave `connected=true` when inverter unreachable | **Highest** |
| 14 | Replace `setInterval` with `setTimeout` recursion — await all 5 HTTP calls sequentially | HIGH | 1 hr | Prevents 5 concurrent TCP connections to microcontroller + request pileup | **High** |
| 15 | Downgrade `log.info(\`url: \${url}\`)` → `log.debug` in `ApSystemsEz1Client.getRequest` (`ApSystemsEz1Client.ts:31`) | MEDIUM | 2 min | 5 info-level URL logs per poll interval | **Highest** |
| 16 | Replace `createState("DeviceInfo", "", name)` with `extendObjectAsync` using full dotted path | MEDIUM | 30 min | Empty parent arg creates `DeviceInfo..StateName` double-dot paths | **High** |
| 17 | Fix `pollIntervalInMilliSeconds` default from `60` to `60000` (`main.ts:15`) | LOW | 2 min | Latent bug — 60ms poll if `onReady` ever short-circuits before line 49 | **High** |

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

fix: replace async forEach with Promise.all in all set*States methods   (#12)
fix: add catch handlers and setConnected(false) to output/alarm/onoff   (#13)
chore: downgrade url logging from info to debug in getRequest           (#15)
fix: correct pollIntervalInMilliSeconds default to 60000                (#17)
fix: replace createState empty parent with extendObjectAsync            (#16)
refactor: replace setInterval with sequential setTimeout poll loop      (#14)
feat: add ConsecutiveErrors state for alerting                          (#11)
```
