# Bottleneck Analysis

Generated: 2026-04-18

---

## Priority Order

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | `async` in `forEach` | Data integrity — states written before creation | Low |
| 2 | Missing `.catch()` on 3 poll methods | Silent failures, wrong connection state | Low |
| 3 | Concurrent HTTP to microcontroller | Dropped requests at short intervals | Medium |
| 4 | `log.info` URL per request | Log spam | Trivial |
| 5 | Dead code (3 client methods + `handleClientError`) | Confusion, maintenance | Trivial |
| 6 | `createState` empty parent | Malformed state paths | Low |
| 7 | Default `pollIntervalInMilliSeconds = 60` | Latent bug | Trivial |
| 8 | Zero tests | All of the above go undetected | High effort |

---

## CRITICAL — `async/await` inside `forEach` (broken concurrency)

**Files:** `src/main.ts:105`, `123`, `161`, `190`

`forEach` ignores returned promises. Every `await` inside is a no-op — `createState` and `setStateAsync` race. On first poll, `setStateAsync` fires before the state exists.

```typescript
// BROKEN — forEach drops all returned promises
strings.forEach(async (element) => {
    if (!(await this.getStateAsync(...))) {
        this.createState(...)       // may not finish before...
    }
    await this.setStateAsync(...)   // ...this fires
});

// CORRECT
await Promise.all(elements.map(async (element) => {
    if (!(await this.getStateAsync(`DeviceInfo.${element.name}`))) {
        await this.createStateAsync("DeviceInfo", "", element.name, { ... });
    }
    await this.setStateAsync(`DeviceInfo.${element.name}`, { val: element.value, ack: true });
}));
```

---

## HIGH — `setOutputDataStates` / `setAlarmInfoStates` swallow errors silently

**Files:** `src/main.ts:174`, `205`

`setDeviceInfoStates` correctly calls `setConnected(false)` on error. The other three methods have no `.catch()` — failures disappear silently, `connected` stays `true`, nothing is logged.

```typescript
// BROKEN — no .catch()
private setOutputDataStates(): void {
    this.apiClient.getOutputData().then(async (outputData) => {
        ...
    });
}

// CORRECT
private setOutputDataStates(): void {
    this.apiClient.getOutputData().then(async (outputData) => {
        ...
    }).catch(async () => {
        await this.setConnected(false);
    });
}
```

Affects: `setOutputDataStates`, `setAlarmInfoStates`, `setOnOffStatusState`.

---

## HIGH — 5 concurrent HTTP requests to a microcontroller per poll

**File:** `src/main.ts:65–71`

```typescript
this.timer = setInterval(() => {
    this.setDeviceInfoStates();   // HTTP req — not awaited
    this.setOutputDataStates();   // HTTP req — not awaited
    this.setAlarmInfoStates();    // HTTP req — not awaited
    this.setOnOffStatusState();   // HTTP req — not awaited
    this.setMaxPowerState();      // HTTP req — not awaited
}, this.pollIntervalInMilliSeconds);
```

The EZ1 is a microcontroller with limited TCP capacity. 5 simultaneous connections per tick causes dropped requests. None are awaited — if a poll exceeds the interval the next tick fires while the previous is in-flight, causing unbounded request pileup.

Fix: sequential `await` inside a single async poll function. Use `setTimeout` recursion so the next tick only starts after the previous finishes.

```typescript
private async pollOnce(): Promise<void> {
    await this.setDeviceInfoStates();
    await this.setOutputDataStates();
    await this.setAlarmInfoStates();
    await this.setOnOffStatusState();
    await this.setMaxPowerState();
}

// In onReady — replace setInterval:
const scheduleNext = (): void => {
    this.timer = setTimeout(async () => {
        await this.pollOnce();
        scheduleNext();
    }, this.pollIntervalInMilliSeconds);
};
scheduleNext();
```

---

## MEDIUM — `getRequest` logs full URL at `info` level on every call

**File:** `src/lib/ApSystemsEz1Client.ts:31`

```typescript
this.log.info(`url: ${url}`)   // 5× per poll, contains inverter IP
```

Change to `this.log.debug(...)`.

---

## MEDIUM — Dead code: 3 client helper methods

**File:** `src/lib/ApSystemsEz1Client.ts:106–143`

`getTotalOutput`, `getTotalEnergyToday`, `getTotalEnergyLifetime` — defined, never called. `main.ts` computes totals inline. If ever called accidentally each fires a redundant `getOutputData()` HTTP request. Delete or use them.

---

## MEDIUM — Dead code: `handleClientError` in `main.ts`

**File:** `src/main.ts:313–319`

Never called — error handling belongs to `ApSystemsEz1Client`. Remove.

---

## MEDIUM — `createState` with empty parent string

**File:** `src/main.ts:107`, `125`, `163`, `190`

```typescript
this.createState("DeviceInfo", "", element.name, ...)
//               ^channel      ^device (empty string)
```

Empty device arg creates paths with double dot (`DeviceInfo..StateName`) in some ioBroker versions. Use `extendObjectAsync` with full dotted path:

```typescript
await this.extendObjectAsync(`DeviceInfo.${element.name}`, {
    type: "state",
    common: { type: "string", role: "text", read: true, write: false },
    native: {},
});
```

---

## LOW — `pollIntervalInMilliSeconds` default is `60` not `60000`

**File:** `src/main.ts:15`

```typescript
private pollIntervalInMilliSeconds: number = 60;   // 60ms, not 60s
```

Harmless — overwritten in `onReady` before use. But if `onReady` short-circuits before line 49, interval fires at 60ms. Fix the default or rename the field.

---

## LOW — Zero test coverage

`src/main.test.ts` asserts `5 === 5`. Every issue above is undetected. The `async/await` in `forEach` bug is trivially caught by a unit test checking write ordering. Target: 80% coverage on `ApSystemsEz1Client` and all `set*States` error paths.
