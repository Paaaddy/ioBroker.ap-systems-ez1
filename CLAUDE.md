# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All scripts run via `npm run <name>`:

- `build` — compile TypeScript via `@iobroker/adapter-dev`'s `build-adapter ts` (uses esbuild under the hood). Output: `build/`. `prebuild` wipes `build/` first.
- `watch` — same compile in watch mode.
- `check` — `tsc --noEmit` type check.
- `lint` — `eslint --ext .ts src/`.
- `test:ts` — Mocha over `src/**/*.test.ts` using `test/mocharc.custom.json` (registers `ts-node` + `source-map-support`, sets up chai/sinon; see `test/mocha.setup.js`).
- `test:package` — validates `package.json` and `io-package.json` via `@iobroker/testing`.
- `test:integration` — starts an actual ioBroker instance and boots this adapter (`test/integration.js`).
- `test` — `test:ts` + `test:package` (does NOT include integration).
- `translate` — runs `translate-adapter` to propagate strings across `admin/i18n/*`.
- `release` — `@alcalzone/release-script`; see `.releaseconfig.json`.

Single test: `npx mocha --config test/mocharc.custom.json src/path/to/file.test.ts` (or add `--grep "<name>"`).

Node >= 16 is required. The main entry shipped to ioBroker is `build/main.js` (see `package.json` `main` and `io-package.json` `common.main`) — **users run the compiled output**, so any change to `src/` needs `npm run build` before it takes effect in a dev-server or installed instance.

## Architecture

This is an ioBroker adapter that polls an APsystems EZ1 microinverter over the local HTTP API and mirrors its readings as ioBroker states. It is a `daemon`-mode, `compact`-compatible adapter with `dataSource: poll` and `connectionType: local` (see `io-package.json`).

### Two-layer structure

1. **`src/lib/ApSystemsEz1Client.ts`** — thin HTTP client wrapping `axios.get` against `http://<ip>:<port>/<endpoint>`. Endpoints used: `getDeviceInfo`, `getAlarm`, `getOnOff`, `getOutputData`, `getMaxPower`. All responses share the envelope `TypedReturnDto<T> = { data: T, message, deviceId }` (`src/lib/TypedReturnDto.ts`); per-endpoint payload shapes live in `src/lib/Return*.ts`. The client takes `ioBroker.Logger` in its constructor and owns its own error logging, gated by the `ignoreConnectionErrorMessages` flag so that an offline inverter does not spam the log.
2. **`src/main.ts`** — the `utils.Adapter` subclass. On `ready`, it validates `this.config`, constructs the client, and starts a `setInterval` that calls five `set*States` methods each tick. Each of those methods calls the client, then lazily `createState`s (grouped by channel: `DeviceInfo`, `OutputData`, `AlarmInfo`, `OnOffStatus`, `MaxPower`) and writes the value with `setStateAsync` under `<Channel>.<Name>`.

### Config typing

Adapter config fields (`ipAddress`, `port`, `pollIntervalInSeconds`, `ignoreConnectionErrorMessages`) are declared twice and both must stay in sync:

- **Runtime schema / admin UI:** `admin/jsonConfig.json` (`adminUI.config: json`), with labels localized in `admin/i18n/<lang>/translations.json`.
- **TypeScript type:** `src/lib/adapter-config.d.ts` augments `ioBroker.AdapterConfig` globally. Adding a config field requires updating both files plus the `native` defaults in `io-package.json`.

### Timer architecture

Two separate intervals drive polling:

- **`this.timer`** — fires every `pollIntervalInSeconds` (configurable). Calls `setOutputDataStates`, `setAlarmInfoStates`, `setOnOffStatusState`.
- **`this.slowTimer`** — fires every 1 hour (`SLOW_POLL_INTERVAL_MS = 3_600_000`). Calls `setDeviceInfoStates`, `setMaxPowerState`. Both also run once immediately on `onReady`.

Both handles are stored on `this` and cleared in `onUnload`.

### Known rough edges to be aware of when editing `main.ts`

- `setDeviceInfoStates` / `setOutputDataStates` / etc. call `this.getStateAsync(element.name)` with the bare name (e.g. `"MaxPower"`) instead of the full path (e.g. `"DeviceInfo.MaxPower"`). This means the existence check effectively always returns falsy and `createState` is invoked on every poll. Preserve or fix this deliberately — do not "clean up" silently.
- The adapter-level `handleClientError` on `ApSystemsEz1` is dead code; errors are handled inside the client.

### State channel structure

States are written under five channels per adapter instance:

```
<adapter>.0.DeviceInfo.*      DeviceId, DevVer, Ssid, IpAddr (string, read-only); MaxPower, MinPower (number, read-only)
<adapter>.0.OutputData.*      CurrentPower_1/2/Total (W), EnergyToday_1/2/Total (kWh), EnergyLifetime_1/2/Total (kWh) — number, read-only
<adapter>.0.AlarmInfo.*       OffGrid, ShortCircuitError_1/2, OutputFault — string "Normal"/"Alarm", read-only
<adapter>.0.OnOffStatus.*     OnOffStatus — boolean, read/write (true=on, false=off); role: switch
<adapter>.0.MaxPower.*        MaxPower — number (W), read/write; role: value.power, unit: W
<adapter>.0.connected         boolean, read-only — true when last poll succeeded
```

**Writable states** — writing `ack=false` triggers a live command to the inverter:

| State | Type | Values | Device command |
|---|---|---|---|
| `OnOffStatus.OnOffStatus` | boolean | `true`=on, `false`=off | `GET /setOnOff?status=0\|1` |
| `MaxPower.MaxPower` | number | watts (within device min/max) | `GET /setMaxPower?p=<n>` |

### Device API

Full OpenAPI 3.0 spec: `api/openapi.yaml`. Original vendor PDF: `api/APsystems_EZ1_lokale_API_Beschreibung_selbstbau-pv_2023_copy.pdf`.

Device endpoints (base `http://<ip>:8050`):

| Method | Path | Description |
|---|---|---|
| GET | `/getDeviceInfo` | Identity, firmware, network, power limits |
| GET | `/getOutputData` | Real-time power (W) and energy (kWh) per channel |
| GET | `/getMaxPower` | Current max power cap |
| GET | `/setMaxPower?p=<n>` | Set max power cap (W) |
| GET | `/getAlarm` | Fault flags (og, isce1, isce2, oe) |
| GET | `/getOnOff` | On/off status |
| GET | `/setOnOff?status=0\|1` | Set on (0) or off (1) |

### Test coverage

`src/main.test.ts` is a placeholder stub — it asserts `5 === 5`. Real unit coverage of `ApSystemsEz1Client` and `main.ts` does not exist yet. `test:package` (package manifest validation) does pass.

### Admin UI

`admin/jsonConfig.json` drives the settings panel; translation catalogs live under `admin/i18n/<lang>/translations.json`. After editing English labels, run `npm run translate` rather than editing other languages by hand.

## Release flow

`npm run release` is wired with `@alcalzone/release-script` plus the `iobroker`, `license`, and `manual-review` plugins (see `.releaseconfig.json`). It updates `package.json`, `io-package.json` `common.news`, and README changelog together — keep those three in sync when bumping versions manually.
