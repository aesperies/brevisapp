#!/usr/bin/env bash
# Brevis daily-metrics launchd installer/repair — run ONCE on Antonio's Mac
#
#   bash ~/dev/brevis/tasks/install-launchd.sh
#
# Idempotent: safe to re-run. Copies plist + script to their canonical
# locations, reloads the launchd job, kicks off a test run, and tails the log.
set -euo pipefail

LABEL="com.antonio.brevis-daily-metrics"
REPO_DIR="${BREVIS_REPO_DIR:-$HOME/dev/brevis}"
SRC_PLIST="$REPO_DIR/tasks/scheduled/com.antonio.brevis-daily-metrics.plist"
SRC_SCRIPT="$REPO_DIR/tasks/scheduled/brevis-daily-metrics.sh"

DEST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DEST_DIR="$HOME/Documents/Claude/Scheduled/brevis-daily-metrics"
DEST_SCRIPT="$DEST_DIR/brevis-daily-metrics.sh"

say() { printf "\n\033[1;34m→ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

say "1/7  Preflight"
[ -f "$SRC_PLIST" ]  || die "Missing source plist at $SRC_PLIST (set BREVIS_REPO_DIR if repo is elsewhere)"
[ -f "$SRC_SCRIPT" ] || die "Missing source script at $SRC_SCRIPT"
command -v gh >/dev/null 2>&1 || die "gh CLI not installed. Run: brew install gh && gh auth login"
gh auth status >/dev/null 2>&1 || die "gh not authed. Run: gh auth login  (need 'repo' scope)"
plutil -lint "$SRC_PLIST" >/dev/null || die "Source plist fails plutil -lint"

say "2/7  Creating destination dirs"
mkdir -p "$DEST_DIR" "$DEST_DIR/history" "$HOME/Library/LaunchAgents"

say "3/7  Copying plist + script to canonical locations"
cp "$SRC_PLIST"  "$DEST_PLIST"
cp "$SRC_SCRIPT" "$DEST_SCRIPT"
chmod 644 "$DEST_PLIST"
chmod 755 "$DEST_SCRIPT"

say "4/7  Unloading any previous instance (ok if this says 'not loaded')"
launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true

say "5/7  Loading the job"
launchctl bootstrap "gui/$(id -u)" "$DEST_PLIST"
launchctl enable    "gui/$(id -u)/${LABEL}"

say "6/7  Kickstarting a test run (should produce latest-report.md)"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"
sleep 4  # give the script a moment to write the report

say "7/7  Verification"
launchctl print "gui/$(id -u)/${LABEL}" 2>&1 | grep -E "state|last exit code|path" || true
echo
if [ -f "$DEST_DIR/latest-report.md" ]; then
  echo "✓ latest-report.md mtime: $(stat -f '%Sm' "$DEST_DIR/latest-report.md")"
  echo "---- first 25 lines ----"
  head -25 "$DEST_DIR/latest-report.md"
else
  echo "✗ latest-report.md was not produced — check $DEST_DIR/launchd.err.log"
  tail -30 "$DEST_DIR/launchd.err.log" 2>/dev/null || true
  exit 1
fi

printf "\n\033[1;32m✓ Install complete. Next scheduled run: tomorrow 09:00 local time.\033[0m\n"
printf "   Label: %s\n" "$LABEL"
printf "   Plist: %s\n" "$DEST_PLIST"
printf "   Reports: %s\n" "$DEST_DIR"
