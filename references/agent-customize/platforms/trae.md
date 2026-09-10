# TraeCode Best Practices

Use this file for TraeCode (TRAE IDE) configured-asset practice. Use
`../routing.md` for host-neutral owner selection and the neighbouring platform
files for other hosts. Do not copy TraeCode-only path advice into shared docs.

## Operating Frame

TraeCode is an AI-native IDE with two agent modes (IDE and SOLO) over the same
asset set: project assets live under `<workspace>/.trae`, user assets live under
the local root `~/.trae-cn`, and both are complemented by the shared
`.agents/skills` standard directory. TRAE also reads Claude Code instruction and
hook configuration, so a repository that already targets Claude Code loads
those files in TraeCode as well.

Better Harness currently claims only the configured-asset slice for `trae`.
Session evidence, Checkup, Asset Practices, report rendering, and plugin
lifecycle are not claimed, because TRAE exposes a conversation `SessionID` and a
packaged log folder rather than a documented workspace-qualified transcript.

## Configured Surfaces

- **Skills**: project `.trae/skills/<name>/SKILL.md` and user
  `~/.trae-cn/skills/<name>/SKILL.md` follow the Agent Skills standard. TRAE
  also loads the shared `.agents/skills` directory (project and
  `~/.agents/skills`) when the import setting is enabled, with `.trae/skills`
  winning a name collision. On a collision the provider reports one physical
  skill and prefers the `.agents/skills` evidence path when that is the shared
  source of truth.
- **Bundled skills**: `~/.trae-cn/builtin_skills/` and
  `~/.trae-cn/builtin/global/skills/`. These are host-provided; review them as
  bundled capability, not as team-authored assets.
- **Rules**: project `.trae/rules/**/*.md` and user `~/.trae-cn/user_rules`.
  TraeCode also loads the project `AGENTS.md`, `CLAUDE.md`, and
  `CLAUDE.local.md` instruction files when they are enabled in context.
- **Commands**: project `.trae/commands/**/*.md` and user
  `~/.trae-cn/commands`.
- **Subagents**: project `.trae/agents/<name>.md` and user
  `~/.trae-cn/agents/<name>.md`. A project subagent overrides a same-named user
  subagent.
- **Hooks**: project `.trae/hooks.json` and user `~/.trae-cn/hooks.json`.
  TraeCode merges Claude Code hooks from `~/.claude/settings.json`,
  `<workspace>/.claude/settings.json`, and
  `<workspace>/.claude/settings.local.json`; those items carry
  `compatSource: claude-code`.
- **MCP**: project `.trae/mcp.json` under the `mcpServers` key, after the
  "enable project-level MCP" setting is turned on. User MCP servers are managed
  through the IDE settings and stored under `~/.trae-cn/mcps/<server-id>/` with
  an undocumented per-server layout, so the provider does not read them.
- **Memory**: user memory at `~/.trae-cn/memory/user_profile.md` is inventoried
  as standing user context. Project memory at
  `~/.trae-cn/memory/projects/<opaque-slug>/project_memory.md` is not
  workspace-qualified, because the slug scheme is undocumented.
- **TraeCode CLI**: `.traecli/skills` in a project and `~/.traecli/skills` for
  the user (`--trae-cli-home`). The CLI also loads the IDE skill roots.

## Skill Enablement

`skill-config.json` records the exception lists rather than an enablement
matrix: `disabledSkills`, `deletedSkills`, and `builtinSkillStatus` in the user
root, and the disabled project skills in `<workspace>/.trae/skill-config.json`.
The provider reports `enabled: false` plus `disabledBy` for a listed skill and
`enabled: true` for the remaining discovered skills of that scope.

TRAE's builtin catalog uses `TRAE-`-prefixed ids, so `TRAE-dynamic-ui: false`
disables the `dynamic-ui` skill. Matching accepts the raw and the prefix-stripped
form, case-insensitively. When the file is missing or its shape is not one of
these fields, no skill is marked and the diagnostics report `missing` or
`unrecognized` instead of guessing.

## Evidence Boundaries

- Presence is not execution. The provider reports what TRAE is configured to
  load, not what a conversation used.
- Never serialize tokens, MCP environment values, credential-shaped arguments,
  or transcript content. The shared MCP sanitizer applies to project MCP
  entries.
- Use `--trae-home <path>` for an isolated root. The default is the TRAE CN
  local root `~/.trae-cn`; another build's root is supplied explicitly rather
  than auto-detected.
- Enterprise-edition managed skills, skill controls, and the TraeCode CLI 2.0
  `$TRAE_HOME` runtime layout remain unobserved.

## Review Questions

- Does each repeated workflow have one owner and a matching Skill, or is it
  duplicated across project rules, commands, and Skills?
- Do user rules and user memory hold durable preferences, while project rules
  hold repository constraints?
- Are project hooks and Claude-compatible hooks complementary, or do they
  enforce the same check twice?
- Is a disabled or deleted skill still referenced by rules, commands, or
  subagents that expect it to be active?
- Does the project-level MCP file declare servers the workspace still needs,
  and are credentials kept out of the repository?
