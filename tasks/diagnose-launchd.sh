#!/usr/bin/env bash
# Brevis daily-metrics launchd diagnostic
# Run: bash diagnose-launchd.sh
set -u

LABEL="com.antonio.brevis-daily-metrics"
PLIST_USER="$HOME/Library/LaunchAgents/${LABEL}.plist"
REPORT_DIR="$HOME/Documents/Claude/Scheduled/brevis-daily-metrics"
LOG_DIR="$REPORT_DIR"  # launchd stdout/stderr .log files live alongside the reports

section() { printf "\n==== %s ====\n" "$1"; }

section "1. launchctl list entry"
launchctl list 2>/dev/null | grep -E "PID|brevis" || echo "No brevis entry found in launchctl list"

section "2. launchctl print (status, last exit, next run)"
UID_NUM=$(id -u)
launchctl print "gui/${UID_NUM}/${LABEL}" 2>&1 | \
  grep -E "state|last exit code|runs|path|program|stdout|stderr" || \
  echo "Job not loaded in gui/${UID_NUM}/ domain"

section "3. plist file on disk"
if [ -f "$PLIST_USER" ]; then
  echo "FOUND: $PLIST_USER"
  ls -la "$PLIST_USER"
  echo "--- plutil lint ---"
  plutil -lint "$PLIST_USER"
  echo "--- StartCalendarInterval / ProgramArguments ---"
  /usr/libexec/PlistBuddy -c "Print :StartCalendarInterval" "$PLIST_USER" 2>/dev/null
  /usr/libexec/PlistBuddy -c "Print :ProgramArguments" "$PLIST_USER" 2>/dev/null
else
  echo "MISSING: $PLIST_USER"
  echo "Also checking /Library/LaunchAgents and /Library/LaunchDaemons ..."
  sudo -n ls /Library/LaunchAgents/${LABEL}.plist 2>/dev/null || true
fi

section "4. Recent stderr / stdout logs"
if [ -d "$LOG_DIR" ]; then
  ls -lat "$LOG_DIR" | head -20
  echo "--- tail of launchd.err.log (last 50 lines) ---"
  [ -f "$LOG_DIR/launchd.err.log" ] && tail -50 "$LOG_DIR/launchd.err.log" || echo "(no launchd.err.log yet)"
  echo "--- tail of launchd.out.log (last 50 lines) ---"
  [ -f "$LOG_DIR/launchd.out.log" ] && tail -50 "$LOG_DIR/launchd.out.log" || echo "(no launchd.out.log yet)"
else
  echo "No log directory at $LOG_DIR"
fi

section "5. Latest report file"
if [ -d "$REPORT_DIR" ]; then
  ls -lat "$REPORT_DIR" | head -10
  LATEST=$(ls -t "$REPORT_DIR"/latest-report.md 2>/dev/null | head -1)
  if [ -n "${LATEST:-}" ]; then
    echo "--- mtime ---"
    stat -f "%Sm  %N" "$LATEST"
  fi
else
  echo "Report dir missing: $REPORT_DIR"
fi

section "6. gh CLI + auth"
which gh && gh --version || echo "gh not installed"
gh auth status 2>&1 || true

section "7. System clock / timezone (launchd triggers on local wall clock)"
date
systemsetup -gettimezone 2>/dev/null || true

section "8. Was the Mac asleep at 9am? (pmset log)"
pmset -g log 2>/dev/null | grep -E "Sleep|Wake|DarkWake" | tail -20 || true

section "Diagnostic complete"
echo "If the job is missing from launchctl list, reload with:"
echo "  launchctl bootout gui/$(id -u) $PLIST_USER 2>/dev/null; launchctl bootstrap gui/$(id -u) $PLIST_USER"
echo "Kickstart manually:"
echo "  launchctl kickstart -k gui/$(id -u)/${LABEL}"
