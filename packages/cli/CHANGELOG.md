# Changelog

All notable changes to openlabnote (`oln`) are documented here.
One section per release: `## <version> (<date>)` with terse bullets
(Added / Improved / Fixed / Changed / Removed). Versioning policy: [docs/versioning.md](../../docs/versioning.md).

## 0.1.0 (unreleased)

- Initial release: collect your AI-assisted dev records (Claude Code · Codex sessions, git commits — local and SSH remotes) and turn them into daily research notes in Markdown, written by your own claude/codex subscription
- Interactive home (`oln`) with activity heatmap, `today` / `catchup` / `status` / `note` / `open`
- Two-step onboarding interview (`oln init`) and settings editor (`oln setup`)
- Web viewer (`oln ui`) and submission export (`oln export`, per-day PNG + period PDF)
- Secret scanning gate on export (`redact`), with `--allow-secrets` override
- Home(~) sessions routed to that day's active projects as "attribution pending" for the writing engine to sort
- `oln capture` — jot down a noteworthy moment from anywhere (terminal or via the /labnote-capture skill); guaranteed to be included in that day's note
- Config migration framework with backups, weekly update check (opt-out), what's-new after updates
