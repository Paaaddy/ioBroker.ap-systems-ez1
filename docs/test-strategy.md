# Test Strategy — ioBroker AP Systems EZ1 Adapter

**Date:** 2026-04-18
**Stack:** TypeScript, Mocha/Chai/Sinon, ioBroker testing framework

---

## 1. Scope

**In scope:**
- `ApSystemsEz1Client` — all HTTP methods (read + write)
- `main.ts` adapter lifecycle (`onReady`, `onUnload`, `onStateChange`, poll tick)
- Config validation logic
- State write paths (channel/state creation, value mapping)

**Out of scope:**
- ioBroker core internals
- APsystems device firmware
- Admin UI rendering

---

## 2. Risk Assessment

| Area | Risk | Reason |
|------|------|--------|
| `setOnOff` / `setMaxPower` write paths | **HIGH** | Mutates real hardware; wrong value = physical consequence |
| Offline inverter handling | **HIGH** | No timeout → poll stalls silently |
| `onUnload` timer cleanup | **HIGH** | `clearInterval` missing — resource leak on restart |
| `getStateAsync` path bug | **MEDIUM** | Redundant `createState` every tick wastes ioBroker DB writes |
| Config validation | **MEDIUM** | Bad IP/port silently crashes poll loop |
| `setOnOffStatus` encoding | **MEDIUM** | `true`→`"0"`, `false`→`"1"` — counter-intuitive, easy to regress |

---

## 3. Test Pyramid

```
        E2E (5%)
       ─────────
      Integration (20%)
     ─────────────────
    Unit (75%)
   ──────────────────────
```

No UI. All observable behavior is HTTP in + ioBroker state out. Unit tests cover the most ground cheapest.

---

## 4. Test Levels

### Level 1 — Unit (`src/**/*.test.ts`, Mocha + Sinon)

Target: **80% branch coverage** on `ApSystemsEz1Client` and `main.ts`.

#### `ApSystemsEz1Client` test cases

| Case | Method | What to assert |
|------|--------|----------------|
| Happy path | `getDeviceInfo` | Returns typed DTO when axios resolves 200 |
| Happy path | `getOutputData` | Maps p1/p2/e1/e2/te1/te2 correctly |
| Happy path | `setOnOffStatus(true)` | Calls `setOnOff?status=0` (not 1!) |
| Happy path | `setOnOffStatus(false)` | Calls `setOnOff?status=1` |
| Happy path | `setMaxPower(800)` | Calls `setMaxPower?p=800` |
| Error — network | any | Calls `log.error` when `ignoreConnectionErrorMessages=false` |
| Error — silent | any | Does NOT call `log.error` when `ignoreConnectionErrorMessages=true` |
| Error — non-200 | any | Calls `handleClientError` with `statusText` |
| Timeout | `getRequest` | axios called with `{ timeout: 5000 }` |

Stub axios with `sinon.stub(axios, 'get')`.

#### `main.ts` test cases

| Case | What to assert |
|------|----------------|
| `onReady` — valid config | Client constructed, poll starts |
| `onReady` — missing IP | Logs error, does not start poll |
| `onStateChange` — `OnOffStatus` ack=false | Calls `client.setOnOffStatus` |
| `onStateChange` — `MaxPower` ack=false | Calls `client.setMaxPower` |
| `onStateChange` — ack=true | Does NOT call client (prevents echo loop) |
| `onUnload` | `clearInterval` called, adapter terminates cleanly |
| Poll tick success | `connected` state written `true` |
| Poll tick failure | `connected` state written `false` |

Use ioBroker's `@iobroker/testing` `createMocks()` to get a mock adapter instance.

### Level 2 — Integration (`test:package`)

Already passing. Validates `package.json` ↔ `io-package.json` consistency on every CI run. Keep as-is.

### Level 3 — E2E (`test/integration.js`)

Manual / on-device only. Not run in CI. Triggered by developer with physical inverter on LAN.
Add as a checklist item in release process — not a CI gate.

---

## 5. Test Data Strategy

- No fixtures needed — all data mocked via Sinon stubs
- Use typed factory functions that return minimal valid DTOs:

```typescript
function makeOutputData(overrides?: Partial<ReturnOutputData>): TypedReturnDto<ReturnOutputData> {
  return {
    data: { p1: 100, p2: 50, e1: 0.5, e2: 0.3, te1: 10, te2: 8, ...overrides },
    message: 'ok',
    deviceId: 'TEST'
  };
}
```

- Never use real device IPs or serial numbers in tests

---

## 6. Entry / Exit Criteria

| Gate | Entry | Exit |
|------|-------|------|
| Unit | Story/fix branch ready | All tests green, ≥80% branch coverage |
| CI push | Any push to `main` or tag | `check-and-lint` + `adapter-tests` green |
| Release tag | `npm run release` invoked | `deploy` job green, npm dist-tag published |

---

## 7. Priority Implementation Order

1. Replace `5 === 5` stub with real `ApSystemsEz1Client` unit tests (covers write API just added)
2. Add `main.ts` `onStateChange` tests — guards `setOnOff` boolean inversion bug
3. Add `onUnload` + timer tests — ties to `clearInterval` fix in todos.md
4. Add config validation tests — guards "invalid config" typo fix

---

## 8. Tooling

| Tool | Role |
|------|------|
| Mocha | Test runner (already configured) |
| Chai | Assertions |
| Sinon | HTTP stubs, clock fakes for `setInterval` |
| `@iobroker/testing` | Mock adapter + ioBroker state/object API |
| `c8` | Coverage reporting |

Add coverage script to `package.json`:

```json
"test:coverage": "c8 --reporter=text --reporter=lcov npm run test:ts"
```

---

## 9. What NOT to Automate

- Physical inverter response timing / edge cases → manual E2E only
- ioBroker admin UI rendering → out of scope
- npm publish verification → smoke-check dist-tag post-release by hand
