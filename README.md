# openlabnote

> Turn your dev records into research notes — Claude Code / Codex sessions and git commits become daily lab-notebook entries (markdown).

[한국어](README.ko.md)

Research notes are mandatory for government-funded R&D (and good practice everywhere), but nobody has time to write them. The records already exist, though — your AI coding session prompts carry the **decisions and the why**, and your git commits carry the **what**. openlabnote assembles them into one clean note per day.

```
collect (sessions · git) ─▶ compose (your LLM subscription) ─▶ lint ─▶ markdown in your folder
```

- **Runs on your subscription**: summarization is done by Claude Code (or headless `claude -p`) — no extra API key or cost
- **Harness-agnostic**: Claude Code plugin included; Codex, Cursor and others work via the [agent protocol](docs/agent-protocol.md)
- **Markdown is canonical**: notes live in a folder you choose — read, edit, back up, git-manage them yourself
- **Raw logs never leave your machine**: only the finished notes do — and anything that leaves passes a secret-scan gate

## Quick start

The CLI speaks both Korean and English — the first question of setup lets you pick (change later via `oln setup ui-language`).

```bash
npx openlabnote        # first run → language choice + auto-scan + setup interview
oln today              # write today's note (collect → compose → lint → save)
oln capture "…"        # jot a noteworthy moment — guaranteed into that day's note
oln catchup            # fill unwritten days (last 14 days by default)
oln status             # calendar heatmap
oln ui                 # local web viewer (read-only)
oln export --pdf       # daily PNGs + period PDF — a secret scan blocks the export
                       # if notes contain API keys etc. (--allow-secrets to override)
```

Inside Claude Code:

```
/plugin marketplace add netropyai/openlabnote
/plugin install labnote@openlabnote
/labnote
```

## Updating

```bash
npm i -g openlabnote@latest   # update
npm i -g openlabnote@0.1.0    # pin a version / downgrade
```

There is no auto-update. Once a week `oln` asks npm for the latest version number (only the
package name is sent) and shows a one-line notice on the home screen when a new version is out —
disable with `oln setup update-check` or `OLN_NO_UPDATE_CHECK=1`. After an update, the home screen
shows what changed once. Old configs keep working across updates (migrated automatically, with a
backup next to `config.json`). See [CHANGELOG.md](packages/cli/CHANGELOG.md) and
[docs/versioning.md](docs/versioning.md).

## What a note looks like

```markdown
## @August 21, 2026

### Physics server flags
- Changed physics server startup to --headless by default
- Decision: eval banner goes to stderr — avoids breaking log-parsing pipeline

### Mixed-rig eval
- Integrated SNU-EADv1.0 driver; eval time 9.4 → 1.7s
```

Format rules (bullets ≤ 110 chars, ≤ 4 topics/day, no meta-narration, …) are defined in [note format v1](docs/note-format.md) and enforced by `oln lint`.

## Roadmap

- [x] **Phase 1**: collect (Claude Code · Codex · git) → compose → lint → local markdown
- [x] **Phase 1.5**: **remote sources** — collect commits & harness sessions from remote dev servers over SSH (`oln setup remotes`, `host:~/path` entries)
- [ ] **Phase 2**: export — daily PNG / period PDF render (submit to whatever ELN service you already use), Cursor collector
- [ ] **Phase 3**: OpenLabnote Cloud — hosted evidence layer (e-signature, trusted timestamps, tamper-evidence)
- [ ] **Phase 4**: OSS ↔ Cloud link (`oln login`, offline verification via `oln verify`)

## Contributing

Collectors and harness adapters are the main contribution surface — see [CONTRIBUTING.md](CONTRIBUTING.md) and [architecture](docs/architecture.md).

## License

[Apache-2.0](LICENSE)
