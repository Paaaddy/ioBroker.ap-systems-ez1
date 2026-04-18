# Architecture Evaluation — ioBroker AP Systems EZ1 Adapter

**Date:** 2026-04-18

---

## 1. Monolith Assessment

**System profile:** Single-process daemon. One file of business logic (`main.ts`), one HTTP client (`ApSystemsEz1Client.ts`). No services to split.

| Signal | Value |
|--------|-------|
| Deployment frequency | Per ioBroker release — manual |
| Team size | 1 maintainer |
| Scaling pain | None — LAN-only, single device |

**Verdict:** Monolith is correct. No action needed.

---

## 2. Caching Strategy

**Current:** No caching. Every poll tick fires 5 fresh HTTP requests to device.

| Gap | Impact |
|-----|--------|
| No response caching | 5 × HTTP round-trips per tick, even for slowly-changing data (DeviceInfo, MaxPower rarely change) |
| No stale-value fallback | If device goes offline mid-poll, states go unwritten — last known value not preserved |
| `createState` called every tick | Redundant ioBroker DB writes because existence check uses wrong path |

**Recommendation:** Cache `DeviceInfo` and `MaxPower` — poll at lower frequency (e.g. once per hour). `OutputData` and `AlarmInfo` stay at poll interval.

---

## 3. Data Partitioning

Not applicable. No database. State storage is ioBroker's object DB — managed by platform, not adapter.

---

## 4. Resilience Audit

| Risk | Severity | Detail |
|------|----------|--------|
| No axios timeout | **HIGH** | Hung TCP connection blocks poll indefinitely |
| Timer not cleared on unload | **HIGH** | Adapter restart leaks poll interval handle |
| 5 concurrent unguarded calls per tick | MEDIUM | All 5 pile up if inverter is slow; next tick fires before any resolve |
| No `connected` state | MEDIUM | Operators have no visibility when device is offline |
| No retry logic | LOW | Single failed poll silently drops data; acceptable for IoT telemetry |
| No circuit breaker | LOW | Overkill for single-device LAN adapter |

**Single point of failure:** The inverter itself — unavoidable hardware dependency.

---

## 5. Observability

| Signal | Status |
|--------|--------|
| Request tracing | None — `log.info` on every URL + response (noisy, not structured) |
| Error rate | Visible only if `ignoreConnectionErrorMessages=false` |
| Latency | Not measured |
| Poll liveness | No heartbeat state |
| SLIs | None defined |

Logging strategy is inverted: payload details at `info` level (noise), no structured error counting.

---

## Scalability Audit

| Metric | Value |
|--------|-------|
| Current QPS to device | 5 req / poll interval (default 60 s ≈ 0.08 QPS) |
| Peak capacity | EZ1 embedded HTTP server — keep QPS < 1 |
| Bottleneck | The inverter's embedded HTTP server, not this adapter |
| Cost per request | Negligible — LAN HTTP |

No scalability concerns. Scaling constraint is hardware.

---

## Recommendations Roadmap

### Short-term (1–2 weeks) — Required

| # | Fix | Effort |
|---|-----|--------|
| 1 | Add `axios` timeout (5 s) | 5 min |
| 2 | Store timer handle, clear in `onUnload` | 10 min |
| 3 | Fix `getStateAsync` path to full state key (e.g. `DeviceInfo.MaxPower`) | 15 min |
| 4 | Add `connected` boolean state — write `true` on successful poll, `false` on error | 30 min |

### Medium-term (1–3 months) — Recommended

| # | Fix | Effort |
|---|-----|--------|
| 5 | Reduce `DeviceInfo` + `MaxPower` poll to 1×/hour | 1 hr |
| 6 | Downgrade payload logging to `log.debug` | 10 min |
| 7 | Add actual unit tests (current test is `5 === 5` stub) | 2–4 hrs |

### Long-term (3–6 months) — Optional

| # | Fix | Effort |
|---|-----|--------|
| 8 | Add `ConsecutiveErrors` number state — enables ioBroker alerting rules | 2 hrs |
| 9 | Remove dead code: adapter-level `handleClientError`, unused client aggregate methods | 30 min |

---

## Critical Thinking Check

- **Business cost of bottlenecks?** Missing timeout = adapter hangs silently; no `connected` state = operator blindness.
- **Biggest bang?** Fixes 1–4 are <1 hr total. Highest ROI in codebase.
- **New bottleneck after fixes?** The embedded EZ1 HTTP server — already the limit, unchanged.
- **Measured before/after?** `connected` state serves as observable proxy for reliability.

---

## Follow-up

Run `/quality-gate` after implementing short-term fixes.  
See also: [`design-review.md`](./design-review.md)
