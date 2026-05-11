#!/bin/bash
# Brevis Daily Metrics Agent — runs locally via launchd
# Pulls GitHub state for aesperies/brevisapp and writes a concise report.
#
# Install: see /Users/antoniobitkraft/Documents/Claude/Scheduled/brevis-daily-metrics/README.md

set -u  # undefined vars are errors; do NOT set -e (we want to catch failures and still write a report)

REPO="aesperies/brevisapp"
OUT_DIR="/Users/antoniobitkraft/Documents/Claude/Scheduled/brevis-daily-metrics"
OUT_FILE="$OUT_DIR/latest-report.md"
HISTORY_DIR="$OUT_DIR/history"
DATE="$(date +%Y-%m-%d)"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S %Z')"

mkdir -p "$OUT_DIR" "$HISTORY_DIR"

# Make sure gh is on PATH when launchd runs this (launchd has a minimal PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v gh >/dev/null 2>&1; then
  cat > "$OUT_FILE" <<EOF
# Brevis Daily Metrics — $DATE

## BLUF
- **[High]** \`gh\` CLI not found on PATH. Install with \`brew install gh\` and re-run.
- Report generated at: $TIMESTAMP
EOF
  cp "$OUT_FILE" "$HISTORY_DIR/report-$DATE.md"
  exit 1
fi

# ---- Collect data ----
REPO_JSON="$(gh api "repos/$REPO" 2>/dev/null || echo '{}')"
OPEN_ISSUES="$(gh issue list --repo "$REPO" --state open --limit 100 --json number,title,labels,createdAt 2>/dev/null || echo '[]')"
OPEN_PRS="$(gh pr list --repo "$REPO" --state open --limit 100 --json number,title,author,createdAt,isDraft 2>/dev/null || echo '[]')"
RECENT_COMMITS="$(gh api "repos/$REPO/commits?per_page=5" 2>/dev/null || echo '[]')"
YESTERDAY_ISO="$(date -u -v-1d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d 'yesterday' '+%Y-%m-%dT%H:%M:%SZ')"
NEW_ISSUES_SINCE_YDAY="$(gh issue list --repo "$REPO" --state open --search "created:>$YESTERDAY_ISO" --json number,title,createdAt 2>/dev/null || echo '[]')"

ISSUE_COUNT="$(echo "$OPEN_ISSUES" | /usr/bin/python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')"
PR_COUNT="$(echo "$OPEN_PRS" | /usr/bin/python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')"
NEW_ISSUE_COUNT="$(echo "$NEW_ISSUES_SINCE_YDAY" | /usr/bin/python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')"

# Critical keywords flag
CRITICAL_HITS="$(echo "$OPEN_ISSUES" | /usr/bin/python3 -c '
import sys, json, re
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
patterns = re.compile(r"(security|vulnerab|CVE|payment|stripe fail|500|outage|prod down|data loss|leak)", re.I)
hits = []
for i in data:
    title = i.get("title","")
    labels = " ".join(l.get("name","") for l in i.get("labels", []))
    if patterns.search(title) or patterns.search(labels):
        num = i.get("number")
        hits.append("  - #" + str(num) + " " + title)
if hits:
    print("\n".join(hits))
')"

LAST_COMMIT_LINE="$(echo "$RECENT_COMMITS" | /usr/bin/python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list) and data:
        c = data[0]
        sha = c.get("sha","")[:7]
        msg = c.get("commit",{}).get("message","").splitlines()[0]
        date = c.get("commit",{}).get("author",{}).get("date","")
        print(f"{sha} — {date} — {msg}")
    else:
        print("(no commits found)")
except Exception as e:
    print(f"(error parsing commits: {e})")
')"

RECENT_COMMITS_LIST="$(echo "$RECENT_COMMITS" | /usr/bin/python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    for c in data[:5]:
        sha = c.get("sha","")[:7]
        msg = c.get("commit",{}).get("message","").splitlines()[0]
        print(f"- `{sha}` — {msg}")
except Exception:
    pass
')"

# ---- Write report ----
{
  echo "# Brevis Daily Metrics — $DATE"
  echo ""
  echo "## BLUF"
  if [ -n "$CRITICAL_HITS" ]; then
    echo "- **[High]** Critical issues detected (see below) — review immediately."
  else
    echo "- **[Low]** No critical flags detected in open issues."
  fi
  echo "- **[Low]** Open issues: ${ISSUE_COUNT} · Open PRs: ${PR_COUNT} · New issues since yesterday: ${NEW_ISSUE_COUNT}"
  echo "- **[Low]** Last commit: ${LAST_COMMIT_LINE}"
  echo ""
  if [ -n "$CRITICAL_HITS" ]; then
    echo "## 🚨 Critical Flags"
    echo "$CRITICAL_HITS"
    echo ""
  fi
  echo "## Metrics Summary"
  echo "- **Open Issues:** ${ISSUE_COUNT}"
  echo "- **Open PRs:** ${PR_COUNT}"
  echo "- **Last Commit:** ${LAST_COMMIT_LINE}"
  echo "- **New issues since yesterday:** ${NEW_ISSUE_COUNT}"
  echo ""
  echo "## Recent Commits (last 5)"
  echo "$RECENT_COMMITS_LIST"
  echo ""
  echo "---"
  echo "_Generated at $TIMESTAMP by brevis-daily-metrics.sh_"
} > "$OUT_FILE"

cp "$OUT_FILE" "$HISTORY_DIR/report-$DATE.md"
exit 0
