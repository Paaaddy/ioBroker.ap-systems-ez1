# Feature Kickoff — Fix High-ROI Issues & Performance Improvements

**Date:** 2026-04-18  
**Input:** [todos.md](./todos.md) items #1–6 (Highest + High ROI)  
**DoR Status: APPROVED — ready for implementation**

---

## 1. PM Problem Statement

**Problem:** The AP Systems EZ1 adapter has four correctness defects and two performance issues that degrade reliability and operator experience in production ioBroker installations.

**User:** ioBroker instance operators running EZ1 solar microinverters on their local network.

**Impact:**
- Offline inverter causes adapter to hang indefinitely (no timeout) — adapter appears alive but produces no data
- Adapter restart leaks poll timer handle — multiple timers accumulate, multiplying HTTP load on device
- `createState` fires every poll tick due to broken path check — unnecessary write pressure on ioBroker object DB
- Operators cannot distinguish "adapter running, device offline" from "device reporting zero output"

**Success metrics:**
- Adapter recovers cleanly from offline inverter within one poll cycle
- Zero timer handles leaked across adapter restarts
- `createState` called only once per state (on first seen)
- `connected` state reflects real device reachability in ioBroker UI
- Log noise reduced — payload at `debug`, not `info`

---

## 2. PRD

**Scope:** Bug fixes + observability improvement. No new user-facing features beyond `connected` state.

### User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-1 | As operator, when inverter goes offline, adapter recovers cleanly | HTTP request times out in ≤5 s; next poll fires on schedule |
| US-2 | As operator, restarting adapter does not accumulate background timers | `onUnload` clears interval; no duplicate poll firing after restart |
| US-3 | As operator, ioBroker object DB is not spammed with redundant writes | `createState` called once per state lifetime, not every poll tick |
| US-4 | As operator, I can see inverter reachability as an ioBroker state | `connected` boolean state exists under adapter instance; updates every poll |
| US-5 | As operator, log output is readable without payload noise | Payload JSON at `debug`; only errors and state changes at `info` |
| US-6 | As operator, config error message is readable | Error reads "invalid config" not "in valid config" |

**Constraints:**
- No breaking changes to existing state paths
- No changes to adapter config schema
- Must pass `npm run test` and `npm run check`

---

## 3. Architecture Impact

**Affected files:**

```
src/main.ts
├── onReady()               — US-2: store timer handle; US-6: fix typo
├── onUnload()              — US-2: clearInterval(this.timer)
├── setDeviceInfoStates()  ─┐
├── setOutputDataStates()   ├─ US-3: fix getStateAsync path in all 5 methods
├── setAlarmInfoStates()    │  US-4: write connected=true on success
├── setOnOffStatusState()   │  US-4: write connected=false on error
└── setMaxPowerState()     ─┘

src/lib/ApSystemsEz1Client.ts
└── getRequest()            — US-1: add { timeout: 5000 } to axios.get
                              US-5: log.debug for response payload
```

**New state:**
```
<adapter>.0.connected   boolean, role: indicator.connected, read: true, write: false
```

**Complexity:** Low. All changes isolated and surgical. No structural changes.

---

## 4. Security Assessment

| Change | Threat check |
|--------|-------------|
| axios timeout | Reduces DoS risk from hung connections — improves posture |
| `connected` state | Read-only boolean, no user input — no new risk |
| Logging reduction | Reduces info disclosure in logs — improves posture |
| Path fix, timer fix, typo fix | No security impact |

**No new security controls required.**

---

## 5. Work Breakdown

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Add axios timeout | `ApSystemsEz1Client.ts:33` | 5 min |
| 2 | Downgrade payload log to `debug` | `ApSystemsEz1Client.ts:36` | 2 min |
| 3 | Add `private timer` field | `main.ts:15` | 2 min |
| 4 | Store timer in `onReady` | `main.ts:51` | 2 min |
| 5 | Clear timer in `onUnload` | `main.ts:241` | 2 min |
| 6 | Fix `getStateAsync` paths in all 5 methods | `main.ts:96,114,147,200,218` | 15 min |
| 7 | Add `connected` state creation + writes | `main.ts` | 30 min |
| 8 | Fix typo in error message | `main.ts:44` | 1 min |
| 9 | Run `npm run check` + `npm run test` | — | 5 min |

**Total estimated effort: ~65 minutes**

### Suggested Commit Sequence

```
fix: add axios timeout to prevent poll stall on offline inverter
fix: store poll timer handle and clear on adapter unload
fix: correct getStateAsync path to prevent redundant createState calls
feat: add connected boolean state for operator visibility
fix: correct typo in invalid config error message
chore: downgrade payload logging to debug level
```

---

## 6. Definition of Ready Checklist

| Criterion | Status |
|-----------|--------|
| Problem statement written | ✅ |
| Success metrics defined | ✅ |
| User stories with acceptance criteria | ✅ |
| Architecture impact assessed | ✅ |
| Security review complete | ✅ |
| Work breakdown with estimates | ✅ |
| No unresolved dependencies | ✅ |
| Existing tests will still pass | ✅ |
| Breaking changes identified | ✅ none |

---

## Next Steps

1. Start at `src/lib/ApSystemsEz1Client.ts:33` — highest ROI, 5 min
2. Run `/quality-gate` after all fixes implemented
3. See [todos.md](./todos.md) to track completion
