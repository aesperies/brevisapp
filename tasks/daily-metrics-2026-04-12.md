# Brevis Daily Metrics — 2026-04-12 (Sunday)

## ⚠️ Agent Status: GitHub API Unreachable

The scheduled metrics agent ran from the Cowork sandbox, which **cannot reach the GitHub API** (network sandbox restriction). This is a known limitation — the daily metrics agent is designed to run locally via **launchd** on Antonio's machine, where `gh` CLI is authenticated and network-unrestricted.

### What to check manually (30-second drill):
```bash
gh issue list --repo aesperies/brevisapp --state open
gh pr list --repo aesperies/brevisapp --state open
gh api repos/aesperies/brevisapp/commits?per_page=5 --jq '.[].commit | "\(.author.date) — \(.message)"'
```

### Recommendation
Ensure the local launchd job (`com.brevis.daily-metrics`) is active:
```bash
launchctl list | grep brevis
```

If not loaded, reload it per the setup instructions in the brevis-ops skill.

---
*Report generated: 2026-04-12 (automated run — sandbox environment)*
