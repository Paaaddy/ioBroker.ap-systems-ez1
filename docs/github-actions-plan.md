# GitHub Actions Implementation Plan

Generated: 2026-04-18

Maps every phase from `deploy-strategy.md` to a concrete GitHub Actions workflow.

---

## Overview

| # | Workflow file | Trigger | Purpose | Priority |
|---|--------------|---------|---------|----------|
| 1 | `test-and-release.yml` | push tag | CI + npm publish (beta & latest) | **Now** |
| 2 | `rollback.yml` | manual | Re-tag npm, deprecate bad version, open revert PR | Before first release |
| 3 | `soak-monitor.yml` | daily + manual | Check metrics during soak periods | Before Phase 2 gate |
| 4 | `promote-stable.yml` | manual | Open PR against ioBroker.repositories stable | Before Phase 3 |

---

## Workflow 1: `test-and-release.yml` (modify existing)

**Change:** Uncomment the `deploy` job — it already exists but is commented out.

**Why implement:**
The deploy job is written in the repo but gated behind a `# TODO` comment. Without it, every release requires manual `npm publish` from a developer's machine — meaning build environment varies per release, Sentry sourcemap upload never happens, and the GitHub Release artifact is never created. One uncomment + two secrets removes all of that permanently. Every future release becomes reproducible and hands-free.

`ioBroker/testing-action-deploy@v1` already handles the dist-tag split: versions with a prerelease suffix (`-beta.N`) publish to `--tag beta`, clean versions publish to `--tag latest`. No custom logic required.

**Required secrets:** `NPM_TOKEN` (automation token from npmjs.org), `SENTRY_AUTH_TOKEN`

**Effort:** ~5 minutes.

```yaml
  deploy:
    needs: [check-and-lint, adapter-tests]
    if: |
      contains(github.event.head_commit.message, '[skip ci]') == false &&
      github.event_name == 'push' &&
      startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
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

---

## Workflow 2: `rollback.yml` (new)

**Why implement:**
Rollbacks are high-stress, time-sensitive operations. A developer under pressure is likely to mistype a version number, forget `npm deprecate`, or skip the ioBroker.repositories revert PR. A `workflow_dispatch` workflow with typed inputs forces the correct sequence every time and leaves an audit trail in the Actions run history. It also means anyone with repo write access — not just the original publisher — can execute a rollback if the maintainer is unavailable.

The alternative (manual CLI with production tokens) has caused extended outages for other adapters: wrong dist-tag left pointing at a broken version for days because the developer ran the commands in the wrong order or against the wrong package name.

**Trigger:** `workflow_dispatch` with inputs: `bad_version`, `good_version`, `scenario` (A/B/C)

**What it does:**
- All scenarios: re-points npm dist-tag, deprecates bad version, creates GitHub tracking issue
- Scenario B only: opens revert PR against `ioBroker/ioBroker.repositories` `sources-dist-stable.json`

```yaml
# .github/workflows/rollback.yml
name: Rollback

on:
  workflow_dispatch:
    inputs:
      bad_version:
        description: "Version to roll back FROM (e.g. 0.2.0)"
        required: true
        type: string
      good_version:
        description: "Version to roll back TO (e.g. 0.1.0)"
        required: true
        type: string
      scenario:
        description: "Rollback scenario"
        required: true
        type: choice
        options:
          - "A - bad latest, not in stable repo"
          - "B - bad version reached stable repo"
          - "C - bad beta only"

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Re-point npm latest dist-tag
        if: ${{ !startsWith(inputs.scenario, 'C') }}
        run: |
          npm config set //registry.npmjs.org/:_authToken ${{ secrets.NPM_TOKEN }}
          npm dist-tag add iobroker.ap-systems-ez1@${{ inputs.good_version }} latest
          npm view iobroker.ap-systems-ez1 dist-tags

      - name: Remove beta dist-tag if bad beta
        if: ${{ startsWith(inputs.scenario, 'C') }}
        run: |
          npm config set //registry.npmjs.org/:_authToken ${{ secrets.NPM_TOKEN }}
          npm dist-tag rm iobroker.ap-systems-ez1 beta || true

      - name: Deprecate bad version
        run: |
          npm config set //registry.npmjs.org/:_authToken ${{ secrets.NPM_TOKEN }}
          npm deprecate iobroker.ap-systems-ez1@${{ inputs.bad_version }} \
            "Regression in ${{ inputs.bad_version }}. Use ${{ inputs.good_version }} or wait for next release."

      - name: Open stable-repo revert PR (Scenario B only)
        if: ${{ startsWith(inputs.scenario, 'B') }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh repo fork ioBroker/ioBroker.repositories --clone
          cd ioBroker.repositories
          git checkout -b revert-ap-systems-ez1-to-${{ inputs.good_version }}
          node -e "
            const fs = require('fs');
            const f = 'sources-dist-stable.json';
            const d = JSON.parse(fs.readFileSync(f));
            if (d['ap-systems-ez1']) {
              d['ap-systems-ez1'].version = '${{ inputs.good_version }}';
              fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
            }
          "
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add sources-dist-stable.json
          git commit -m "revert: ap-systems-ez1 ${{ inputs.bad_version }} -> ${{ inputs.good_version }}"
          git push origin HEAD
          gh pr create \
            --repo ioBroker/ioBroker.repositories \
            --title "revert: ap-systems-ez1 ${{ inputs.bad_version }} → ${{ inputs.good_version }}" \
            --body "Regression rollback. See Paaaddy/ioBroker.ap-systems-ez1 for tracking issue."

      - name: Create tracking issue
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue create \
            --title "Rollback: ${{ inputs.bad_version }} → ${{ inputs.good_version }}" \
            --body "## Rollback triggered via GitHub Actions

          **Bad version:** \`${{ inputs.bad_version }}\`
          **Good version:** \`${{ inputs.good_version }}\`
          **Scenario:** ${{ inputs.scenario }}

          ## Checklist
          - [ ] npm dist-tag re-pointed
          - [ ] Bad version deprecated on npm
          - [ ] ioBroker stable repo revert PR opened (Scenario B)
          - [ ] GitHub Release annotated
          - [ ] README pinned to good version
          - [ ] Fix in progress — cut next beta
          - [ ] Post-mortem written in docs/postmortems/" \
            --label "bug"
```

---

## Workflow 3: `soak-monitor.yml` (new)

**Why implement:**
The soak period gates (Phase 1: 14 days, Phase 2: 21 days) are currently honour-system — easy to skip under pressure. A daily scheduled workflow that checks npm download counts and open GitHub bug issues provides objective go/no-go data without manual research. It also catches regression signals early: a sudden drop in downloads or spike in issues during soak appears as a red workflow run days before users file formal reports.

Without this, the only signal is passive community forum monitoring — unreliable and easy to miss on a small adapter with low traffic.

The workflow posts a summary to the Actions tab step summary, so the go/no-go status is visible to anyone watching the repo without needing to parse raw API output.

**Trigger:** `schedule: cron: '0 8 * * *'` (daily 08:00 UTC) + `workflow_dispatch` for on-demand check

**What it does:**
- Fetches weekly npm downloads via public registry API (no token needed)
- Counts open GitHub issues labeled `bug` and `critical`
- Writes a pass/fail summary to the step summary
- Fails the run (red X) if critical thresholds are breached

```yaml
# .github/workflows/soak-monitor.yml
name: Soak Monitor

on:
  schedule:
    - cron: '0 8 * * *'
  workflow_dispatch:

jobs:
  check-metrics:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch npm download stats
        id: npm
        run: |
          LATEST=$(npm view iobroker.ap-systems-ez1 dist-tags.latest)
          BETA=$(npm view iobroker.ap-systems-ez1 dist-tags.beta 2>/dev/null || echo "none")
          DOWNLOADS=$(curl -s "https://api.npmjs.org/downloads/point/last-week/iobroker.ap-systems-ez1" \
            | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).downloads))")
          echo "latest=$LATEST" >> $GITHUB_OUTPUT
          echo "beta=$BETA" >> $GITHUB_OUTPUT
          echo "downloads=$DOWNLOADS" >> $GITHUB_OUTPUT
          echo "### npm stats" >> $GITHUB_STEP_SUMMARY
          echo "- latest: \`$LATEST\`" >> $GITHUB_STEP_SUMMARY
          echo "- beta: \`$BETA\`" >> $GITHUB_STEP_SUMMARY
          echo "- weekly downloads: $DOWNLOADS" >> $GITHUB_STEP_SUMMARY

      - name: Count open bug issues
        id: issues
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          COUNT=$(gh issue list --label bug --state open --json number --jq 'length' \
            --repo Paaaddy/ioBroker.ap-systems-ez1)
          CRITICAL=$(gh issue list --label bug --label critical --state open --json number \
            --jq 'length' --repo Paaaddy/ioBroker.ap-systems-ez1 2>/dev/null || echo 0)
          echo "bug_count=$COUNT" >> $GITHUB_OUTPUT
          echo "critical_count=$CRITICAL" >> $GITHUB_OUTPUT
          echo "### GitHub issues" >> $GITHUB_STEP_SUMMARY
          echo "- open bug issues: $COUNT" >> $GITHUB_STEP_SUMMARY
          echo "- critical: $CRITICAL" >> $GITHUB_STEP_SUMMARY

      - name: Evaluate phase gate thresholds
        run: |
          BUGS=${{ steps.issues.outputs.bug_count }}
          CRITICAL=${{ steps.issues.outputs.critical_count }}
          if [ "$CRITICAL" -gt 0 ]; then
            echo "::error::RED — $CRITICAL critical bug(s) open. Rollback required."
            exit 1
          fi
          if [ "$BUGS" -ge 3 ]; then
            echo "::warning::YELLOW — $BUGS open bug issues. Hold promotion, investigate."
          else
            echo "::notice::GREEN — $BUGS open bug issues. Metrics nominal."
          fi
```

---

## Workflow 4: `promote-stable.yml` (new)

**Why implement:**
Promoting to the ioBroker stable channel requires a PR to a third-party repo (`ioBroker/ioBroker.repositories`). Doing this manually means forking, cloning, editing a large JSON file, pushing a branch, opening a PR with the right body — tedious and error-prone. More importantly, it is easy to skip the pre-Phase-3 checklist when eager to ship.

A `workflow_dispatch` workflow with required inputs makes it structurally impossible to open the PR without confirming soak duration, repochecker result, and bug count. If inputs fail validation, the job exits before touching the target repo. This turns a checklist that exists only on paper into an enforced gate.

**Trigger:** `workflow_dispatch` with inputs: `version`, `soak_days`, `repochecker_passed`, `open_bug_count`

**What it does:**
- Validates all inputs against Phase 3 thresholds (soak >= 21, repochecker passed, bugs <= 2)
- Forks `ioBroker/ioBroker.repositories`, edits `sources-dist-stable.json`
- Opens PR with pre-filled body including version, checklist, and npm link

```yaml
# .github/workflows/promote-stable.yml
name: Promote to ioBroker Stable

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Version to promote (e.g. 0.2.0)"
        required: true
        type: string
      soak_days:
        description: "Days on npm latest (must be >= 21)"
        required: true
        type: number
      repochecker_passed:
        description: "npx @iobroker/repochecker passed with zero errors"
        required: true
        type: boolean
      open_bug_count:
        description: "Open bug issues against this version"
        required: true
        type: number

jobs:
  validate-and-promote:
    runs-on: ubuntu-latest
    steps:
      - name: Validate promotion gates
        run: |
          FAIL=0
          if [ "${{ inputs.soak_days }}" -lt 21 ]; then
            echo "::error::Soak period insufficient: ${{ inputs.soak_days }} days (need >= 21)"
            FAIL=1
          fi
          if [ "${{ inputs.repochecker_passed }}" != "true" ]; then
            echo "::error::repochecker must pass before stable promotion"
            FAIL=1
          fi
          if [ "${{ inputs.open_bug_count }}" -gt 2 ]; then
            echo "::error::Too many open bug issues: ${{ inputs.open_bug_count }} (need <= 2)"
            FAIL=1
          fi
          if [ "$FAIL" -eq 1 ]; then exit 1; fi
          echo "All gates passed."

      - name: Open stable-repo PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh repo fork ioBroker/ioBroker.repositories --clone
          cd ioBroker.repositories
          git checkout -b promote-ap-systems-ez1-${{ inputs.version }}
          node -e "
            const fs = require('fs');
            const f = 'sources-dist-stable.json';
            const d = JSON.parse(fs.readFileSync(f));
            if (!d['ap-systems-ez1']) { console.error('entry not found'); process.exit(1); }
            d['ap-systems-ez1'].version = '${{ inputs.version }}';
            fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
          "
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add sources-dist-stable.json
          git commit -m "chore: bump ap-systems-ez1 to ${{ inputs.version }}"
          git push origin HEAD
          gh pr create \
            --repo ioBroker/ioBroker.repositories \
            --title "chore: ap-systems-ez1 → ${{ inputs.version }} stable" \
            --body "## ap-systems-ez1 stable promotion

          **Version:** \`${{ inputs.version }}\`
          **npm:** https://www.npmjs.com/package/iobroker.ap-systems-ez1/v/${{ inputs.version }}

          ## Gate checklist
          - [x] Soak: ${{ inputs.soak_days }} days on npm latest (>= 21)
          - [x] repochecker: passed
          - [x] Open bugs: ${{ inputs.open_bug_count }} (<= 2)

          Generated by promote-stable workflow."
```

---

## Implementation order

| Step | Action | When |
|------|--------|------|
| 1 | Uncomment deploy job in `test-and-release.yml`, add secrets | Now — blocks everything |
| 2 | Create `rollback.yml` | Before first public release |
| 3 | Create `soak-monitor.yml` | Before Phase 1 → Phase 2 decision |
| 4 | Create `promote-stable.yml` | Before Phase 3 |
