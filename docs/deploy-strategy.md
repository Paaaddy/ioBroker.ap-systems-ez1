# Deployment Strategy

Generated: 2026-04-18

---

## 1. Strategy Selection

**Pattern: Progressive channel promotion** — canary via npm dist-tags, then rolling via ioBroker stable channel.

Blue-green is not applicable: there is no server fleet to swap. Each user's js-controller loads `build/main.js` from their local npm install. We cannot flip a "green" deployment — we can only control which version their package manager resolves.

Two levers available:

**Lever A — npm dist-tags (canary).** Publishing to npm attaches a tag. `npm install <pkg>` resolves `latest` by default. A pre-release like `0.2.0-beta.1` published with `--tag beta` is only installed by users who explicitly opt in. ioBroker Admin UI exposes this in expert mode; CLI: `iobroker install ap-systems-ez1@beta`. This is the canary ring.

**Lever B — ioBroker repository channels (rolling).** The community ioBroker repo (`sources-dist.json` for "latest"/beta, `sources-dist-stable.json` for stable) pins a version per adapter. Most installations use the `stable` repo. Promotion into `sources-dist-stable.json` is the actual rollout to the majority — controlled via a PR to `ioBroker/ioBroker.repositories`.

| Ring | Mechanism | Audience | Share |
|------|-----------|----------|-------|
| Canary | `npm dist-tag = beta` | Opt-in testers | < 5% |
| Stable-npm | `npm dist-tag = latest` + `sources-dist.json` | ioBroker "latest" repo users | ~25–35% |
| Stable-iob | `sources-dist-stable.json` | Default ioBroker stable repo users | ~65–75% |

---

## 2. Release Channels & Phases

### One-time setup (prerequisite)

1. Create `NPM_TOKEN` (automation type) on npmjs.org → add as GitHub Actions secret.
2. Create Sentry project, provision DSN and `SENTRY_AUTH_TOKEN` → add both as GitHub secrets.
3. Add to `io-package.json` under `common`:
   ```json
   "plugins": {
     "sentry": {
       "dsn": "https://<public-key>@o<org>.ingest.sentry.io/<project-id>"
     }
   }
   ```
4. Uncomment the `deploy` job in `.github/workflows/test-and-release.yml` (see `docs/pipeline-design.md`).

### Phase 1 — Beta (`npm beta` tag)

Version scheme: `0.2.0-beta.0`, `0.2.0-beta.1`, ...

```bash
npm run release -- minor --preid beta
git push --follow-tags
```

`release-script` runs `npm run build` (via `.releaseconfig.json` `before_commit`), updates `package.json`, `io-package.json common.news`, and README changelog. The existing workflow tag pattern `v[0-9]+.[0-9]+.[0-9]+-**` already matches pre-release tags — CI deploy job publishes to npm under `beta` dist-tag automatically via `ioBroker/testing-action-deploy@v1`.

Tester opt-in install:
```bash
iobroker url iobroker.ap-systems-ez1@beta
```

**Soak duration:** minimum 14 days, extend to 21 if fewer than 5 distinct testers confirm.

### Phase 2 — Stable npm (`latest` tag)

```bash
npm run release -- minor
git push --follow-tags
# CI publishes v0.2.0 to npm --tag latest
```

Verify:
```bash
npm view iobroker.ap-systems-ez1 dist-tags
# expected: { latest: '0.2.0', beta: '0.2.0-beta.N' }
```

The ioBroker "latest" repo auto-syncs from npm `latest` within ~24h via the repo-checker bot.

**Soak duration:** minimum 21 days before stable-repo PR.

### Phase 3 — ioBroker `stable` channel

Run repo-checker first:
```bash
npx @iobroker/repochecker https://github.com/Paaaddy/ioBroker.ap-systems-ez1
```

Open PR against `ioBroker/ioBroker.repositories`, edit `sources-dist-stable.json`:
```json
"ap-systems-ez1": {
  "version": "0.2.0",
  ...
}
```

Attach repo-checker output. The `ioBroker-Bot` validates: io-package schema, `common.news` entries present, LICENSE, README changelog, js-controller dependency satisfied.

---

## 3. Success Metrics

### In-adapter instrumentation (add to `main.ts`)

Add a `Diagnostics.*` channel with three states, reset daily:
- `Diagnostics.PollsOk` (number) — increments on full successful poll cycle.
- `Diagnostics.PollsFailed` (number) — increments on any client error.
- `Diagnostics.LastErrorMessage` (string) — last error, IP addresses masked.

Also fix `info.connection` path: ioBroker convention is `<instance>.info.connection` (affects history-adapter and community dashboards).

### Phase 1 (beta) thresholds

| Metric | Source | Green → promote | Red → rollback |
|--------|--------|-----------------|----------------|
| Poll success rate | `PollsOk / (PollsOk + PollsFailed)` | >= 98% on reachable inverters | < 95% |
| Sentry unique errors / install / day | Sentry issues grouped by version | <= 0.1 | > 0.5 |
| GitHub bug issues against beta | `gh issue list --label bug` | <= 2, none critical | any critical OR data-loss |
| Tester confirmations | GitHub Discussions | >= 5 users, 7+ day uptime | < 3 after 14 days → extend |
| Soak | wall clock | >= 14 days | — |

### Phase 2 (`latest`) thresholds

| Metric | Source | Green → promote | Red → rollback |
|--------|--------|-----------------|----------------|
| Poll success rate | Sentry breadcrumbs | >= 99% | < 97% |
| Sentry error rate | events / install / day | <= 0.05 | > 0.2 |
| New bug issues / week | GitHub | <= 1 | >= 3 OR any critical |
| npm downloads trend | downloads API | stable or growing | > 30% drop week-over-week |
| Soak | wall clock | >= 21 days | — |

### Phase 3 (stable) thresholds

Same as Phase 2 measured over a 30-day window before next minor beta.

---

## 4. Rollback Triggers & Criteria

### Trigger conditions (any one is sufficient)

- Any CRITICAL security issue (credentials in logs, crash loop, data corruption).
- js-controller crash loops reported by >= 2 users.
- Sentry error rate exceeds red threshold for 24 consecutive hours.
- GitHub bug-issue velocity exceeds red threshold.
- Data corruption in `OutputData.EnergyLifetime_*` (poisons history-adapter records).

### Monitoring alerts

Configure in Sentry:
- Alert: "new issue >= 10 events in 24h tagged `release:iobroker.ap-systems-ez1@<version>`" → email.

GitHub:
- Watch for issues labeled `critical` or `regression` against current version.

---

### Rollback Runbook A — bad `latest`, NOT yet in ioBroker stable repo

1. Reproduce on clean ioBroker instance (js-controller >= 3.3.22 + inverter or mocked HTTP).
2. Open tracking issue: "Rollback: 0.2.0 → 0.1.0". Link Sentry issue and repro steps.
3. Re-point `latest` dist-tag to last known good:
   ```bash
   npm dist-tag add iobroker.ap-systems-ez1@0.1.0 latest
   npm dist-tag rm  iobroker.ap-systems-ez1 beta   # if beta also affected
   npm view iobroker.ap-systems-ez1 dist-tags      # verify
   ```
4. Deprecate (do NOT unpublish — blocked after 72h, breaks pinned users):
   ```bash
   npm deprecate iobroker.ap-systems-ez1@0.2.0 "Regression: <reason>. Use 0.1.0."
   ```
5. Open PR against `ioBroker/ioBroker.repositories` reverting `sources-dist.json` version to `0.1.0`.
6. Post note on the GitHub Release for the bad tag: "Superseded by rollback."
7. Pin README install instructions to `iobroker.ap-systems-ez1@0.1.0`.
8. Cut `0.2.1-beta.0` with the fix → restart Phase 1.
9. Write `docs/postmortems/0.2.0.md`: what, impact, detection, fix, prevention.

### Rollback Runbook B — bad version reached ioBroker `stable` repo

Steps 1–4 same as Runbook A.

5. Open **urgent** PR against `ioBroker/ioBroker.repositories` editing `sources-dist-stable.json` back to `0.1.0`. Tag stable-repo maintainers with severity summary. (Bot does NOT auto-demote; human merge required.)
6. Post warning in ioBroker community Discord `#community-adapters` referencing the PR.
7. Continue with steps 6–9 of Runbook A.

### Rollback Runbook C — bad beta only (Phase 1)

```bash
npm dist-tag rm iobroker.ap-systems-ez1 beta
# or point to prior good beta:
npm dist-tag add iobroker.ap-systems-ez1@0.2.0-beta.0 beta
npm deprecate iobroker.ap-systems-ez1@0.2.0-beta.1 "Superseded by beta.2"
```

Publish `0.2.0-beta.N+1` with fix. No stable-repo changes needed.

---

## 5. Release Checklist

### Pre-Phase-1 (beta publish)

- [ ] `npm run check` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes — **BLOCKER:** `src/main.test.ts` is currently a `5 === 5` stub; replace with >= 80% coverage on `ApSystemsEz1Client` and `set*States` error paths before any real release
- [ ] `npm run test:integration` passes locally
- [ ] `npm run build` produces clean `build/main.js` with no `console.log`
- [ ] `io-package.json common.news` has entry for new version; `npm run translate` run
- [ ] `info.connection` state path fixed to `<instance>.info.connection`
- [ ] `NPM_TOKEN` and `SENTRY_AUTH_TOKEN` present in GitHub Actions secrets
- [ ] `deploy` job uncommented in `.github/workflows/test-and-release.yml`
- [ ] `npx @iobroker/repochecker <repo-url>` — zero errors
- [ ] Security: no secrets in source; inverter IP never logged at `error` level
- [ ] README includes beta install instructions

### Pre-Phase-2 (beta → latest)

- [ ] All Phase 1 green thresholds met
- [ ] >= 14 days elapsed since first beta publish
- [ ] >= 5 distinct testers report >= 7-day uptime, no open critical/high bugs
- [ ] No unresolved Sentry issue groups >= 5 events tagged to beta
- [ ] No open `fix:` or `security:` PR pending — roll into new beta first
- [ ] Version bumped to final, `common.news` finalized, translations resynced

### Pre-Phase-3 (latest → stable repo)

- [ ] All Phase 2 green thresholds met
- [ ] >= 21 days elapsed since npm `latest` publish
- [ ] `npx @iobroker/repochecker` on exact release commit — zero errors
- [ ] GitHub issues open: <= 2, none `bug-critical` or `regression`
- [ ] Sentry 30-day rolling error rate <= 0.05 events/install/day
- [ ] `package.json`, `io-package.json`, README changelog triple-agree on version

---

## Blocking items before Phase 1

| # | Item | File |
|---|------|------|
| 1 | Replace `5 === 5` stub with real unit tests (>= 80% coverage) | `src/main.test.ts` |
| 2 | Fix `info.connection` state path to ioBroker convention | `src/main.ts` + `io-package.json instanceObjects` |
| 3 | Provision Sentry project + DSN | `io-package.json common.plugins.sentry.dsn` |
| 4 | Uncomment deploy job + add GitHub secrets | `.github/workflows/test-and-release.yml` |
| 5 | Add `Diagnostics.*` poll counter states | `src/main.ts` |
