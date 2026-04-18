# CI/CD Pipeline Design

Generated: 2026-04-18

---

## 1. CI/CD Pipeline Stages

Full replacement for `.github/workflows/test-and-release.yml`.

Splits the existing combined `adapter-tests` job into fast unit + slow integration stages, adds npm caching, and uncomments the deploy stage.

```yaml
name: Test and Release

on:
  push:
    branches:
      - "main"
    tags:
      - "v[0-9]+.[0-9]+.[0-9]+"
      - "v[0-9]+.[0-9]+.[0-9]+-**"
  pull_request: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  # Stage 1: fast gate — type check + lint on single Node version
  check-and-lint:
    name: Check & Lint (Node 18)
    if: contains(github.event.head_commit.message, '[skip ci]') == false
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: ioBroker/testing-action-check@v1
        with:
          node-version: '18.x'
          type-checking: true
          lint: true

  # Stage 2: unit + manifest tests — Ubuntu only, 3 Node versions
  unit-tests:
    name: Unit Tests (Node ${{ matrix.node-version }})
    needs: [check-and-lint]
    if: contains(github.event.head_commit.message, '[skip ci]') == false
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      fail-fast: false
      matrix:
        node-version: ['18.x', '20.x', '22.x']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci --no-audit --no-fund
      - run: npm run build
      - run: npm run check
      - run: npm run test:ts
      - run: npm run test:package

  # Stage 3: integration tests — full OS x Node matrix
  integration-tests:
    name: Integration Tests (${{ matrix.os }} / Node ${{ matrix.node-version }})
    needs: [unit-tests]
    if: contains(github.event.head_commit.message, '[skip ci]') == false
    runs-on: ${{ matrix.os }}
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        node-version: ['18.x', '20.x', '22.x']
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: ioBroker/testing-action-adapter@v1
        with:
          node-version: ${{ matrix.node-version }}
          os: ${{ matrix.os }}
          build: true

  # Stage 4: deploy — tag-triggered, all stages must pass
  # Required GitHub secrets: NPM_TOKEN, SENTRY_AUTH_TOKEN
  deploy:
    name: Deploy to npm + Sentry release
    needs: [check-and-lint, unit-tests, integration-tests]
    if: |
      contains(github.event.head_commit.message, '[skip ci]') == false &&
      github.event_name == 'push' &&
      startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
    steps:
      - uses: ioBroker/testing-action-deploy@v1
        with:
          node-version: '18.x'
          build: true
          npm-token: ${{ secrets.NPM_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          sentry: true
          sentry-token: ${{ secrets.SENTRY_AUTH_TOKEN }}
          sentry-project: "iobroker-ap-systems-ez1"
          sentry-version-prefix: "iobroker.ap-systems-ez1"
          sentry-sourcemap-paths: "build/"
```

**Required GitHub repo secrets:**

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | npmjs.org publish token (Automation type) |
| `SENTRY_AUTH_TOKEN` | Sentry user API token with `project:releases` scope |
| `GITHUB_TOKEN` | Automatic — no setup needed |

---

## 2. Feature Flag Design

Feature flags for an ioBroker adapter = boolean fields in `native` adapter config. Three files must stay in sync for every flag.

### `io-package.json` — extend `native` defaults

```json
"native": {
    "port": "8050",
    "ipAddress": "127.0.0.1",
    "pollIntervalInSeconds": "60",
    "ignoreConnectionErrorMessages": false,

    "enableDetailedLogging": false,
    "enableAlarmPolling": true,
    "experimentalMaxPowerWrite": false,
    "sentryDsn": ""
}
```

`enableAlarmPolling` defaults `true` — existing installs always poll alarms, so this flag must not silently disable that on upgrade.

### `admin/jsonConfig.json` — add UI controls

```json
"_featureFlagsHeader": {
    "type": "header",
    "text": "featureFlags",
    "size": 4,
    "newLine": true
},
"enableDetailedLogging":     { "type": "checkbox", "label": "enableDetailedLogging",     "newLine": true },
"enableAlarmPolling":        { "type": "checkbox", "label": "enableAlarmPolling",        "newLine": true },
"experimentalMaxPowerWrite": { "type": "checkbox", "label": "experimentalMaxPowerWrite", "newLine": true },
"sentryDsn": { "type": "text", "label": "sentryDsn", "newLine": true }
```

Run `npm run translate` after adding English labels — do not edit other locales by hand.

### `src/lib/adapter-config.d.ts` — augment the type

```typescript
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            ipAddress: string;
            port: number;
            pollIntervalInSeconds: number;
            ignoreConnectionErrorMessages: boolean;

            enableDetailedLogging: boolean;
            enableAlarmPolling: boolean;
            experimentalMaxPowerWrite: boolean;
            sentryDsn: string;
        }
    }
}
export {};
```

### `src/lib/AdapterSettings.ts` — typed, validated config snapshot

```typescript
export interface AdapterSettings {
    readonly ipAddress: string;
    readonly port: number;
    readonly pollIntervalMs: number;
    readonly ignoreConnectionErrorMessages: boolean;
    readonly featureFlags: Readonly<{
        detailedLogging: boolean;
        alarmPolling: boolean;
        experimentalMaxPowerWrite: boolean;
    }>;
    readonly sentryDsn: string;
}

const MIN_POLL_SECONDS = 5;
const MAX_POLL_SECONDS = 3600;

export class InvalidAdapterConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidAdapterConfigError";
    }
}

export function loadSettings(raw: ioBroker.AdapterConfig): AdapterSettings {
    if (!raw?.ipAddress) {
        throw new InvalidAdapterConfigError("ipAddress is required");
    }
    const port = Number(raw.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new InvalidAdapterConfigError(`port is invalid: ${raw.port}`);
    }
    const pollSeconds = Number(raw.pollIntervalInSeconds);
    if (!Number.isFinite(pollSeconds) || pollSeconds < MIN_POLL_SECONDS || pollSeconds > MAX_POLL_SECONDS) {
        throw new InvalidAdapterConfigError(
            `pollIntervalInSeconds must be between ${MIN_POLL_SECONDS} and ${MAX_POLL_SECONDS}`
        );
    }
    return Object.freeze({
        ipAddress: raw.ipAddress,
        port,
        pollIntervalMs: pollSeconds * 1000,
        ignoreConnectionErrorMessages: Boolean(raw.ignoreConnectionErrorMessages),
        featureFlags: Object.freeze({
            detailedLogging: Boolean(raw.enableDetailedLogging),
            alarmPolling: Boolean(raw.enableAlarmPolling),
            experimentalMaxPowerWrite: Boolean(raw.experimentalMaxPowerWrite),
        }),
        sentryDsn: (raw.sentryDsn ?? "").trim(),
    });
}
```

Flag usage in `main.ts`:

```typescript
if (this.settings.featureFlags.alarmPolling) {
    await this.setAlarmInfoStates();
}
if (this.settings.featureFlags.experimentalMaxPowerWrite) {
    this.subscribeStates("MaxPower.MaxPower");
}
```

---

## 3. Monitoring & Deployment Validation

### Sentry initialization — `src/lib/Telemetry.ts`

```typescript
import * as Sentry from "@sentry/node";

const PACKAGE_VERSION = require("../../package.json").version as string;

export interface TelemetryOptions {
    readonly dsn: string;
    readonly environment: string;
    readonly logger: ioBroker.Logger;
}

export class Telemetry {
    private static initialized = false;

    public static init(options: TelemetryOptions): void {
        // Env var wins so operators can disable per-host without UI access
        const dsn = (process.env.SENTRY_DSN || options.dsn || "").trim();
        if (!dsn) {
            options.logger.info("Sentry disabled: no DSN configured");
            return;
        }
        if (Telemetry.initialized) return;

        Sentry.init({
            dsn,
            release: `iobroker.ap-systems-ez1@${PACKAGE_VERSION}`,
            environment: options.environment,
            tracesSampleRate: 0,
            beforeSend(event) {
                if (event.user) delete event.user.ip_address;
                return event;
            },
        });

        Telemetry.initialized = true;
        options.logger.info(`Sentry initialized (release ${PACKAGE_VERSION})`);
    }

    public static capture(error: unknown, context?: Record<string, unknown>): void {
        if (!Telemetry.initialized) return;
        if (error instanceof Error) {
            Sentry.captureException(error, { extra: context });
        } else {
            Sentry.captureMessage(String(error), { level: "error", extras: context });
        }
    }
}
```

DSN source priority: `SENTRY_DSN` env var → `sentryDsn` adapter config → disabled. No DSN ever in source.

### Connection health — `io-package.json instanceObjects`

Declare upfront so states exist at install time (no `createState`-on-every-poll race):

```json
"instanceObjects": [
    {
        "_id": "info",
        "type": "channel",
        "common": { "name": "Information" },
        "native": {}
    },
    {
        "_id": "info.connection",
        "type": "state",
        "common": {
            "role": "indicator.connected",
            "name": "Device or service connected",
            "type": "boolean",
            "read": true,
            "write": false,
            "def": false
        },
        "native": {}
    },
    {
        "_id": "info.lastSuccessfulPoll",
        "type": "state",
        "common": {
            "role": "value.time",
            "name": "Timestamp of last successful poll",
            "type": "number",
            "read": true,
            "write": false,
            "def": 0
        },
        "native": {}
    }
]
```

### Health tracker — `src/lib/HealthTracker.ts`

Edge-triggered: only writes `info.connection` when status actually changes.

```typescript
export class HealthTracker {
    private lastConnected: boolean | null = null;

    constructor(
        private readonly setBoolState: (id: string, val: boolean) => Promise<void>,
        private readonly setNumberState: (id: string, val: number) => Promise<void>,
    ) {}

    public async recordSuccess(): Promise<void> {
        await this.setNumberState("info.lastSuccessfulPoll", Date.now());
        if (this.lastConnected !== true) {
            await this.setBoolState("info.connection", true);
            this.lastConnected = true;
        }
    }

    public async recordFailure(): Promise<void> {
        if (this.lastConnected !== false) {
            await this.setBoolState("info.connection", false);
            this.lastConnected = false;
        }
    }
}
```

### Log-level-aware error reporting in `main.ts`

```typescript
private reportError(scope: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);

    if (this.settings.ignoreConnectionErrorMessages) {
        this.log.debug(`[${scope}] ${message}`);
        return;
    }

    const isVerbose = this.log.level === "debug" || this.log.level === "silly";
    if (isVerbose && error instanceof Error) {
        this.log.error(`[${scope}] ${error.message}\n${error.stack ?? ""}`);
    } else {
        this.log.error(`[${scope}] ${message}`);
    }

    Telemetry.capture(error, { scope, ipAddress: this.settings.ipAddress });
}
```

### Fix `onUnload` interval leak (noted in CLAUDE.md)

```typescript
private onUnload(callback: () => void): void {
    try {
        if (this.pollHandle !== null) {
            clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
        void this.setStateAsync("info.connection", { val: false, ack: true });
        callback();
    } catch {
        callback();
    }
}
```

---

## Implementation Checklist

| # | File | Change |
|---|------|--------|
| 1 | `.github/workflows/test-and-release.yml` | Replace with staged YAML above |
| 2 | `io-package.json` | Add feature flag defaults to `native`; add `instanceObjects` |
| 3 | `admin/jsonConfig.json` | Add feature flag UI items |
| 4 | `admin/i18n/en/translations.json` | Add label keys → run `npm run translate` |
| 5 | `src/lib/adapter-config.d.ts` | Add new config fields |
| 6 | `src/lib/AdapterSettings.ts` | New file — `loadSettings` + `InvalidAdapterConfigError` |
| 7 | `src/lib/Telemetry.ts` | New file — `npm install @sentry/node` |
| 8 | `src/lib/HealthTracker.ts` | New file — edge-triggered connection state |
| 9 | `src/main.ts` | Wire settings, Telemetry, HealthTracker; fix onUnload; store pollHandle |
| 10 | `src/lib/*.test.ts` | Unit tests for AdapterSettings + HealthTracker (closes gap noted in CLAUDE.md) |
