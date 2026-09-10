# Add Trae (TraeCode) as a configured-asset host

## Traceability

- Spec ID: `trae-host-adapter`
- Story: none in this repository; requested directly by a maintainer
- Status: Implemented
- Contribution workflow: [Contributing a New Coding Agent Host](../adapters/contributing-new-coding-agent.md)
- Primary native authority: [TraeCode 技能（Skill）](https://docs.trae.cn/ide_skills),
  [规则（Rule）](https://docs.trae.cn/ide_rules),
  [钩子（Hook）配置详解](https://docs.trae.cn/ide_hook-configuration-reference),
  [记忆](https://docs.trae.cn/ide_memories),
  [命令](https://docs.trae.cn/ide_slash-commands),
  [子智能体（Subagent）](https://docs.trae.cn/ide_subagents),
  [添加 MCP Server](https://docs.trae.cn/ide_add-mcp-servers),
  [TraeCode CLI 技能](https://docs.trae.cn/cli_skills)

## Intent

TraeCode (TRAE IDE, `docs.trae.cn`) is an AI-native IDE with a documented
Agent Skills contract: a project skill directory at `<workspace>/.trae/skills`
and a user skill directory at `~/.trae-cn/skills`, plus project/user rules,
commands, subagents, hooks, MCP servers, and user memory. Better Harness cannot
inventory any of that today because every provider enum rejects `trae`, so a
TraeCode user cannot see which Better Harness-relevant assets their host is
configured to load.

This contribution adds one bounded configured-assets provider and the host
identity it needs. It reaches the **Partial adapter** capability level: the
native paths are documented and re-observed against a local TraeCode install,
but no native install/discovery smoke, no session evidence, and no report loop
is claimed.

## Support Claim

| Slice | Decision | Owner |
| --- | --- | --- |
| Native contract | Claimed for the TRAE CN desktop build (`~/.trae-cn`) and the documented TraeCode CLI skill roots | This spec |
| Shell and discovery | None. TRAE has no documented Better Harness plugin manifest or plugin install command, so skills install by directory | Docs only |
| Configured assets | Claimed | `scripts/agent-customize/providers/trae.mjs` |
| Session evidence | Unavailable — TRAE exposes a conversation `SessionID` and a packaged log folder, not a documented workspace-qualified on-disk transcript | Not implemented |
| Shared registration | Configured-assets inventory only | `scripts/host-support/index.mjs` |
| Plugin lifecycle | Unavailable — no validated native lifecycle contract | Not implemented |
| Output | Not claimed. No Canvas, HTML, or Markdown render route is shipped for `trae` | Not implemented |
| Packaging | Not claimed. No npm metadata root or runtime bundle entry | Not implemented |
| Documentation | Claimed | `docs/adapters/README.md`, `docs/docs/hosts/adapter-matrix.md`, `docs/docs/installation.mdx`, `references/agent-customize/platforms/trae.md` |

Trae therefore advertises exactly `agentCustomize`. It is absent from
`sessionAnalysis`, `assetPractices`, `harnessReport`, `reportRendering`,
`evidenceBundle`, and `checkup`, and lifecycle targets keep rejecting it with
`UNKNOWN_HOST` instead of borrowing another host's install route.

## Native Contract

Verified against the TRAE documentation above and re-observed read-only on a
local TraeCode install (`~/.trae-cn`).

| Item | Value |
| --- | --- |
| User root | `--trae-home`, else `~/.trae-cn` (Windows `%userprofile%/.trae-cn`) |
| User skills | `<traeHome>/skills/**/SKILL.md` |
| Bundled skills | `<traeHome>/builtin_skills/**/SKILL.md`, `<traeHome>/builtin/global/skills/**/SKILL.md` |
| User rules | `<traeHome>/user_rules/**/*.md` |
| User memory | `<traeHome>/memory/user_profile.md`; project memory at `<traeHome>/memory/projects/<opaque-slug>/project_memory.md` |
| User commands | `<traeHome>/commands/**/*.md` |
| User subagents | `<traeHome>/agents/*.md` |
| User hooks | `<traeHome>/hooks.json` |
| Skill enablement | `<traeHome>/skill-config.json` with `disabledSkills`, `deletedSkills`, and `builtinSkillStatus` |
| CLI user skills | `--trae-cli-home`, else `~/.traecli`, then `<traeCliHome>/skills/**/SKILL.md` |
| Project root | `<workspace>/.trae` |
| Project assets | `.trae/skills`, `.trae/rules`, `.trae/commands`, `.trae/agents`, `.trae/hooks.json`, `.trae/mcp.json`, `.trae/skill-config.json` |
| CLI project skills | `<workspace>/.traecli/skills/**/SKILL.md` |
| Agent Skills standard | `<workspace>/.agents/skills` and `<traeUserHome>/.agents/skills`, opt-in in TraeCode settings; `.trae/skills` wins a name collision |
| Project instruction files | `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md` |
| Claude Code compatibility | TraeCode merges Claude Code hooks from `~/.claude/settings.json`, `<workspace>/.claude/settings.json`, and `<workspace>/.claude/settings.local.json` |
| Sessions | No documented local transcript layout. Out of scope. |

The TraeCode CLI inherits the IDE skill roots: its own documentation states that
the CLI can load `.trae/skills` and `~/.trae-cn/skills` in addition to
`.traecli/skills` and `~/.traecli/skills`.

## Acceptance Scenarios

### AC-1: Provider and capability ownership

`trae` is registered in the `agent-customize` provider map and advertises exactly
`AGENT_CUSTOMIZE`. It stays absent from every other capability projection, and
the provider map and capability projection stay equal in both directions.

### AC-2: Standard inventory envelope

The provider returns the existing inventory envelope with `provider: "trae"`,
`traeHome`, `traeCliHome`, `traeUserHome`, `workspace`, the standard tabs, and
`manage` collections built by the shared factories. No new shared item schema
is introduced.

### AC-3: Documented user scope

User scope inventories `<traeHome>/skills`, `<traeHome>/builtin_skills`,
`<traeHome>/builtin/global/skills`, `<traeHome>/user_rules`,
`<traeHome>/memory/user_profile.md`, `<traeHome>/commands`, `<traeHome>/agents`,
`<traeHome>/hooks.json`, `<traeCliHome>/skills`, `<traeUserHome>/.agents/skills`,
and the Claude-compatibility hook files. `--trae-home` replaces the default
root with no fallback to the real user home.

### AC-4: Documented project scope

Project scope inventories `<workspace>/.trae/{skills,rules,commands,agents}`,
`<workspace>/.trae/hooks.json`, `<workspace>/.trae/mcp.json`,
`<workspace>/.traecli/skills`, `<workspace>/.agents/skills`, the
`AGENTS.md`/`CLAUDE.md`/`CLAUDE.local.md` instruction files, and the project
Claude-compatibility hook files. Project scope is workspace-qualified: no user
home asset leaks into it, and `includeUserHome: false` records no user root.

### AC-5: Skill enablement is reported, not guessed

When `skill-config.json` parses, skills named in `disabledSkills`,
`deletedSkills`, or as `builtinSkillStatus: false` are reported with
`enabled: false` and `disabledBy: "skill-config.json"`; the remaining discovered
skills of that scope are `enabled: true`. When the file is missing or its shape
is unrecognized, no skill is marked and the diagnostic name says so. Matching
uses the declared skill name, then the directory name, case-insensitively, and
also accepts TRAE's `TRAE-`-prefixed builtin id for a skill whose own name drops
that prefix (observed: `builtinSkillStatus.TRAE-dynamic-ui` disables the
`dynamic-ui` skill).

### AC-6: Shared real tree counts once

`.trae/skills` (or `.traecli/skills`) that is a symlink to `.agents/skills`, and
a discovered skill that is the same physical file through two roots, counts
once, with the `.agents/skills` path preferred for evidence when that is the
shared source of truth.

### AC-7: Unavailable surfaces stay explicit

The inventory's `unsupported` list names the surfaces this slice does not read:
user-level MCP declarations, the opaque project-memory slug root, TraeCode CLI
2.0 `$TRAE_HOME` runtime skills, enterprise managed skills, and session
transcripts. Capability projections and lifecycle targets keep rejecting `trae`
for those slices.

## Non-Goals

- Session evidence, transcript parsing, or usage/token accounting for TRAE.
- Asset Practices, Checkup, Harness report, Evidence Bundle, report rendering,
  Canvas, or Studio support.
- A Better Harness plugin shell, manifest, or lifecycle profile for TRAE.
- A workspace-qualified mapping for `<traeHome>/memory/projects/<slug>`.
- Parsing user-level MCP state under `<traeHome>/mcps`.
- Any mutation of TRAE configuration, skills, rules, or settings.

## Plan / Tasks

1. Register `trae` in `scripts/host-support/index.mjs` with `AGENT_CUSTOMIZE`
   only.
2. Add `scripts/agent-customize/providers/trae.mjs` and register it in the
   provider map.
3. Extend the `agent-customize` human summary with `traeHome` and
   `traeCliHome`.
4. Document the host in `references/agent-customize/platforms/trae.md`,
   `references/agent-customize/routing.md`, `docs/adapters/README.md`,
   `docs/docs/hosts/adapter-matrix.md`, `docs/docs/installation.mdx`, and the
   README "More adapters" lists.
5. Cover AC-1 through AC-7 with focused provider tests and the existing host
   catalog gates.

## Test And Review Evidence

- Focused: `npx vitest run test/agents/agent-customize.test.mjs`
- Catalog gates: `npx vitest run test/plugins/host-support.test.mjs`
  `npx vitest run test/agents/agent-customize-architecture.test.mjs`
- Full suite: `npm test`
- Docs link integrity: `node scripts/doc-link-graph/cli.mjs skills/better-harness`
  then `npx vitest run test/skills-docs/doc-link-graph.test.mjs`
- Native observation: bounded read-only listing of a local `~/.trae-cn`
  (skill roots, `skill-config.json` keys, `memory/`, `builtin_skills/`). No real
  path, prompt, or user content is committed.

## Risks

- The documented user root is the CN build (`~/.trae-cn`). Another build may use
  a different root; `--trae-home` is the explicit escape hatch, and this spec
  does not claim automatic detection.
- `skill-config.json` is documented by behavior, not by schema. The provider
  reads only the three observed fields, fails open to "unobserved" on any other
  shape, and never deletes a discovered skill from the inventory.
- Claude Code compatibility means the same hook file can appear in both the
  Claude and Trae inventories. Items stay host-scoped and no shared item schema
  changes.
