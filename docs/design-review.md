# Design Review Report — ioBroker AP Systems EZ1 Adapter

**Date:** 2026-04-18  
**Verdict:** CONDITIONAL APPROVAL

---

## 1. System Decomposition

```
┌─────────────────────────────────────────┐
│  ioBroker Runtime                       │
│  ┌──────────────────────────────────┐   │
│  │  ApSystemsEz1 (Adapter)          │   │
│  │  setInterval → 5× set*States()  │   │
│  │  ↓                               │   │
│  │  ApSystemsEz1Client              │   │
│  │  axios.get → http://<ip>:<port>  │   │
│  └──────────────────────────────────┘   │
│  ioBroker State DB                      │
│  DeviceInfo.* / OutputData.* / ...      │
└─────────────────────────────────────────┘
         ↕ local HTTP (no auth)
┌───────────────────────┐
│  EZ1 Microinverter    │
│  HTTP API (plain)     │
└───────────────────────┘
```

**Components:** Adapter class, HTTP client, 5 state channels, admin config UI  
**Dependencies:** `axios`, `@iobroker/adapter-core`, ioBroker state DB  
**Scaling:** Single-instance, single-device, LAN-only

---

## 2. Security: STRIDE Analysis

| Threat | Vector | Severity | Mitigation |
|--------|--------|----------|------------|
| Spoofing | No auth on EZ1 HTTP API — attacker on LAN can impersonate device | LOW | LAN-scoped; acceptable for local IoT |
| Tampering | HTTP plaintext — MITM on LAN can inject crafted responses | LOW | LAN-scoped; no sensitive data flows back |
| Info Disclosure | `log.info` logs full URL + full response every poll | MEDIUM | Use `log.debug` for payload |
| Info Disclosure | Config logs `ipAddress` + `port` on `onReady` | LOW | Internal ioBroker logs — acceptable |
| DoS | No timeout on `axios.get` — hung inverter blocks poll slot indefinitely | **HIGH** | Add `timeout` to axios config |
| DoS | No concurrency guard — parallel requests fan out if poll overruns interval | MEDIUM | Track in-flight state, skip tick if previous unfinished |
| Elevation | N/A — read-only adapter, no write commands | — | — |

No hardcoded secrets. No user input handled. No external exposure.

---

## 3. UX / Operator Review

| Item | Status |
|------|--------|
| Config fields labeled and localized | ✅ |
| Validation feedback on missing config | ✅ |
| Error message clarity | ⚠️ Typo: "Can not start with in valid config" |
| Offline behavior visible to operator | ⚠️ Silent when `ignoreConnectionErrorMessages=true` — no state signals "inverter unreachable" |
| OnOffStatus logic | Verify: `"0"→"on"`, `"1"→"off"` against actual device |

---

## 4. Trade-Off Analysis

| Decision | Current | Alternative | Trade-off |
|----------|---------|-------------|-----------|
| Timer handle not stored | Lost after `onReady` | Store as `this.timer`, clear in `onUnload` | **Current = resource leak on restart** |
| `getStateAsync(bare name)` for existence check | Always falsy → `createState` every poll | Use full path e.g. `DeviceInfo.MaxPower` | **Current = redundant DB writes every tick** |
| No axios timeout | Simple | `axios.get(url, { timeout: 5000 })` | **Current = potential poll stall** |
| `handleClientError` on adapter class | Dead code | Remove | Minor dead code |
| `getTotalOutput/TotalEnergyToday/TotalEnergyLifetime` on client | Dead methods | Remove or use in states | Duplication risk |

---

## 5. Required Changes

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | **HIGH** | No axios timeout — poll can stall indefinitely | `axios.get(url, { timeout: 5000 })` |
| 2 | **HIGH** | Poll timer not stored — `onUnload` cannot clear it | Store: `this.timer = setInterval(...)`, clear in `onUnload` |
| 3 | **MEDIUM** | `getStateAsync(bare name)` always falsy — `createState` fires every poll tick | Fix existence check to use full state path |

---

## 6. Remaining Risks (Accepted)

| Risk | Severity | Notes |
|------|----------|-------|
| Verbose info logging (URL + full payload each poll) | LOW | Consider `log.debug` for payload |
| No concurrency guard between ticks | LOW | 60 s+ interval makes this unlikely in practice |
| Dead code: `handleClientError` on adapter, aggregate methods on client | LOW | Remove in next cleanup pass |
| Typo in error message "in valid config" | LOW | Fix string |
| No "inverter offline" state exposed | LOW | Nice-to-have: write a `connected` boolean state |

---

## Next Steps

1. Implement required changes #1–3
2. Run `/quality-gate` after fixes
