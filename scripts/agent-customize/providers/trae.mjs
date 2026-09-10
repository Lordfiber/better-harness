/**
 * TraeCode (TRAE) configured-asset inventory.
 *
 * Native home: `--trae-home`, else `~/.trae-cn` (TRAE CN desktop build).
 * Contract: https://docs.trae.cn/ide_skills and the sibling TraeCode pages.
 *
 * Only the configured-asset slice is claimed. TRAE has no documented on-disk
 * workspace-qualified session transcript, no native Better Harness plugin
 * manifest, and no validated lifecycle contract, so those slices stay absent.
 */
import os from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";

import { expandHome, normalizeWorkspace, pathExists } from "../../session-analysis/index.mjs";
import { MANAGE_TABS } from "../constants.mjs";
import {
  agentsMarkdownRuleSource,
  buildManageCollections,
  collectHookItems,
  collectHooksFromFile,
  collectMarkdownItems,
  collectRuleSources,
  collectSkillFiles,
  collectWorkspaceRootPrimitives,
  directoryRuleSource,
  readJson,
  sortByName,
  workspaceSourceLabel,
} from "../core/items.mjs";

export function defaultTraeHome() {
  return path.join(os.homedir(), ".trae-cn");
}

export function defaultTraeCliHome() {
  return path.join(os.homedir(), ".traecli");
}

// TRAE documents three user skill roots: user-installed skills, bundled
// builtin skills, and the builtin/global catalog the IDE downloads into.
const USER_SKILL_ROOTS = [
  "skills",
  "builtin_skills",
  path.join("builtin", "global", "skills"),
];

// TraeCode merges Claude Code hook configuration with its own hooks.
const CLAUDE_USER_HOOK_FILES = [[".claude", "settings.json"]];
const CLAUDE_PROJECT_HOOK_FILES = [
  [".claude", "settings.json"],
  [".claude", "settings.local.json"],
];

const CLAUDE_PROJECT_RULE_FILES = ["CLAUDE.md", "CLAUDE.local.md"];

function emptyPrimitives() {
  return { skills: [], subagents: [], rules: [], commands: [], hooks: [], mcps: [] };
}

async function resolveRealPath(filePath) {
  try {
    return await realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

/**
 * Read the documented `skill-config.json` exception lists.
 *
 * TRAE documents the file by behavior, not by schema, so only the three
 * observed fields are trusted. Any other shape returns null: callers then
 * report `unobserved` instead of inventing enablement.
 */
export function parseTraeSkillConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const nameList = (value) => (Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
    : null);
  const disabled = nameList(config.disabledSkills);
  const deleted = nameList(config.deletedSkills);
  const builtinStatus = config.builtinSkillStatus;
  const builtinDisabled = builtinStatus && typeof builtinStatus === "object" && !Array.isArray(builtinStatus)
    ? Object.entries(builtinStatus)
      .filter(([, enabled]) => enabled === false)
      .map(([name]) => name)
    : null;
  if (disabled === null && deleted === null && builtinDisabled === null) {
    return null;
  }
  return Object.freeze({
    disabled: Object.freeze([...new Set([...(disabled ?? []), ...(deleted ?? []), ...(builtinDisabled ?? [])])]),
    fields: Object.freeze([
      ...(disabled === null ? [] : ["disabledSkills"]),
      ...(deleted === null ? [] : ["deletedSkills"]),
      ...(builtinDisabled === null ? [] : ["builtinSkillStatus"]),
    ]),
  });
}

/**
 * Apply the exception lists to discovered skills. A skill that is not listed is
 * active, which is how TRAE's lists behave.
 *
 * TRAE's builtin catalog identifies skills with a `TRAE-` prefix that the
 * skill's own frontmatter `name` does not repeat, so a match compares both the
 * raw and the prefix-stripped form. This is the documented approximation of
 * TRAE's builtin enablement model, not a claimed exactness.
 */
export function applyTraeSkillEnablement(skills, skillConfig) {
  if (!skillConfig) {
    return { skills, disabledCount: 0 };
  }
  const disabled = new Set(skillConfig.disabled.flatMap(skillNameVariants));
  let disabledCount = 0;
  const next = skills.map((skill) => {
    const variants = [
      ...skillNameVariants(skill.declaredName),
      ...skillNameVariants(skill.name),
    ];
    if (variants.some((variant) => disabled.has(variant))) {
      disabledCount += 1;
      return { ...skill, enabled: false, disabledBy: "skill-config.json" };
    }
    return { ...skill, enabled: true };
  });
  return { skills: next, disabledCount };
}

function skillNameVariants(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return [];
  const stripped = normalized.replace(/^trae-/u, "");
  return stripped === normalized ? [normalized] : [normalized, stripped];
}

/**
 * Dedupe skills that resolve to one physical file through several roots, such
 * as `.agents/skills` symlinked from `.trae/skills`. The preferred root wins
 * for evidence so the shared source of truth is the reported path.
 *
 * @param {Array<object>} skills flat list of discovered skill items
 * @param {Array<string>} preferredRoots roots whose path wins a physical tie
 */
export async function mergeTraeSkills(skills, preferredRoots = []) {
  const preferred = preferredRoots.map((root) => path.resolve(root));
  const byRealPath = new Map();
  for (const skill of skills) {
    const filePath = skill?.filePath ?? skill?.evidence?.path;
    if (!filePath) continue;
    const key = await resolveRealPath(filePath);
    const existing = byRealPath.get(key);
    if (!existing) {
      byRealPath.set(key, skill);
      continue;
    }
    const existingPath = existing.filePath ?? existing.evidence?.path ?? "";
    const candidatePreferred = preferred.some((root) => isInside(root, filePath));
    const existingPreferred = preferred.some((root) => isInside(root, existingPath));
    if (candidatePreferred && !existingPreferred) {
      byRealPath.set(key, skill);
    }
  }
  return [...byRealPath.values()].sort(sortByName);
}

function markClaudeCompatible(items) {
  return items.map((item) => ({
    ...item,
    compatSource: "claude-code",
    sourceKind: item.sourceKind ?? "trae-claude-compat-hooks",
  }));
}

async function collectClaudeCompatibleHooks(base, relativeParts, scope, sourceLabel, rootForEvidence) {
  const filePath = path.join(base, ...relativeParts);
  if (!(await pathExists(filePath))) {
    return [];
  }
  const items = await collectHooksFromFile(filePath, scope, sourceLabel, rootForEvidence);
  return markClaudeCompatible(items);
}

function claudeMarkdownRuleSource(workspace, sourceLabel, fileName, precedence) {
  return {
    type: "file",
    filePath: path.join(workspace, fileName),
    scope: "project",
    sourceLabel,
    rootForEvidence: workspace,
    name: fileName,
    sourceKind: "trae-claude-md-compat",
    precedence,
    useHeading: true,
  };
}

async function readTraeSkillConfig(filePath) {
  if (!(await pathExists(filePath))) {
    return { path: filePath, state: "missing", config: null };
  }
  const raw = await readJson(filePath);
  const config = parseTraeSkillConfig(raw);
  if (!config) {
    return { path: filePath, state: "unrecognized", config: null };
  }
  return { path: filePath, state: "parsed", config };
}

async function collectTraeUserPrimitives({ traeHome, traeUserHome, traeCliHome }) {
  const skillConfigPath = path.join(traeHome, "skill-config.json");
  const agentsSkillsRoot = path.join(traeUserHome, ".agents", "skills");
  const cliSkillsRoot = path.join(traeCliHome, "skills");
  const [skillConfig, ...skillGroups] = await Promise.all([
    readTraeSkillConfig(skillConfigPath),
    ...USER_SKILL_ROOTS.map((relative) =>
      collectSkillFiles(path.join(traeHome, relative), "user", "User", traeHome)),
    collectSkillFiles(cliSkillsRoot, "user", "User TraeCode CLI", traeCliHome),
    collectSkillFiles(agentsSkillsRoot, "user", "User agents", agentsSkillsRoot),
  ]);
  const skills = await mergeTraeSkills(skillGroups.flat(), [agentsSkillsRoot]);
  const enabled = applyTraeSkillEnablement(skills, skillConfig.config);
  const [subagents, commands, nativeHooks, userRules, claudeHooks] = await Promise.all([
    collectMarkdownItems(path.join(traeHome, "agents"), "subagent", "user", "User", traeHome),
    collectMarkdownItems(path.join(traeHome, "commands"), "command", "user", "User", traeHome),
    collectHookItems(traeHome, "user", "User", traeHome),
    collectRuleSources([
      directoryRuleSource(
        path.join(traeHome, "user_rules"),
        "user",
        "User",
        traeHome,
        { sourceKind: "trae-user-rules", precedence: "before-project-rules" },
      ),
      {
        type: "file",
        filePath: path.join(traeHome, "memory", "user_profile.md"),
        scope: "user",
        sourceLabel: "User",
        rootForEvidence: traeHome,
        name: "user_profile.md",
        sourceKind: "trae-user-memory",
        precedence: "after-user-rules",
        useHeading: false,
      },
    ]),
    collectClaudeCompatibleHooks(traeUserHome, CLAUDE_USER_HOOK_FILES[0], "user", "User", traeUserHome),
  ]);
  return {
    primitives: {
      skills: enabled.skills,
      subagents,
      rules: userRules,
      commands,
      hooks: [...nativeHooks, ...claudeHooks].sort(sortByName),
      // TRAE stores user MCP servers under <traeHome>/mcps/<server-id>/ with an
      // undocumented per-server layout, so user MCP stays an explicit boundary.
      mcps: [],
    },
    diagnostics: {
      skillConfigPath,
      skillConfigState: skillConfig.state,
      skillConfigFields: skillConfig.config?.fields ?? [],
      disabledSkillCount: enabled.disabledCount,
      cliSkillsRoot,
      bundledSkillRoots: USER_SKILL_ROOTS.slice(1).map((relative) => path.join(traeHome, relative)),
    },
  };
}

async function collectTraeWorkspacePrimitives({ workspace, traeHome, traeUserHome }) {
  const sourceLabel = await workspaceSourceLabel(workspace);
  const projectRoot = path.join(workspace, ".trae");
  const agentsProjectRoot = path.join(workspace, ".agents", "skills");
  const agentsUserRoot = path.join(traeUserHome, ".agents", "skills");
  const projectIsUserHome = (await resolveRealPath(projectRoot)) === (await resolveRealPath(traeHome));
  const agentsIsUserHome = (await resolveRealPath(agentsProjectRoot)) === (await resolveRealPath(agentsUserRoot));
  const projectSkillConfigPath = path.join(projectRoot, "skill-config.json");
  const [skillConfig, project] = await Promise.all([
    readTraeSkillConfig(projectSkillConfigPath),
    projectIsUserHome
      ? emptyPrimitives()
      : collectWorkspaceRootPrimitives(projectRoot, sourceLabel, workspace),
  ]);
  const [agentsSkills, cliSkills, rules, claudeHooks] = await Promise.all([
    agentsIsUserHome
      ? []
      : collectSkillFiles(agentsProjectRoot, "project", sourceLabel, workspace),
    collectSkillFiles(path.join(workspace, ".traecli", "skills"), "project", sourceLabel, workspace),
    collectRuleSources([
      agentsMarkdownRuleSource(workspace, sourceLabel),
      ...CLAUDE_PROJECT_RULE_FILES.map((fileName, index) =>
        claudeMarkdownRuleSource(
          workspace,
          sourceLabel,
          fileName,
          index === 0 ? "after-agents-md" : "after-claude-md",
        )),
    ]),
    Promise.all(CLAUDE_PROJECT_HOOK_FILES.map((relativeParts) =>
      collectClaudeCompatibleHooks(workspace, relativeParts, "project", sourceLabel, workspace)))
      .then((groups) => groups.flat().sort(sortByName)),
  ]);
  const skills = await mergeTraeSkills([...project.skills, ...agentsSkills, ...cliSkills], [agentsProjectRoot]);
  const enabled = applyTraeSkillEnablement(skills, skillConfig.config);
  return {
    primitives: {
      skills: enabled.skills,
      subagents: project.subagents,
      rules: [...project.rules, ...rules],
      commands: project.commands,
      hooks: [...project.hooks, ...claudeHooks].sort(sortByName),
      mcps: project.mcps,
    },
    diagnostics: {
      projectRoot,
      projectSkillConfigPath,
      projectSkillConfigState: skillConfig.state,
      projectDisabledSkillCount: enabled.disabledCount,
      projectIsUserHome,
      agentsIsUserHome,
    },
  };
}

export async function collectTraeCustomizeInventory(options = {}) {
  const traeHome = path.resolve(expandHome(
    options.traeHome ?? options["trae-home"] ?? defaultTraeHome(),
  ));
  const traeCliHome = path.resolve(expandHome(
    options.traeCliHome ?? options["trae-cli-home"] ?? defaultTraeCliHome(),
  ));
  // Claude Code compatibility is a sibling of the TRAE home by default, so an
  // isolated --trae-home never reads the real user home.
  const traeUserHome = path.resolve(expandHome(
    options.traeUserHome ?? path.dirname(traeHome),
  ));
  const workspace = normalizeWorkspace(options.workspace ?? process.cwd());
  const includeUserHome = options.includeUserHome !== false;
  const [user, project] = await Promise.all([
    includeUserHome
      ? collectTraeUserPrimitives({ traeHome, traeUserHome, traeCliHome })
      : Promise.resolve({ primitives: emptyPrimitives(), diagnostics: {} }),
    collectTraeWorkspacePrimitives({ workspace, traeHome, traeUserHome }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    provider: "trae",
    traeHome,
    traeCliHome,
    traeUserHome,
    workspace,
    tabs: MANAGE_TABS,
    plugins: [],
    manage: buildManageCollections([], user.primitives, project.primitives),
    diagnostics: {
      installedPluginState: "missing",
      installedPluginRecordCount: 0,
      installedPluginRecordFiles: [],
      remotePluginInstallMarkersRequired: false,
      ...(includeUserHome ? user.diagnostics : {}),
      ...project.diagnostics,
    },
    unsupported: [
      "user-level MCP declarations under <traeHome>/mcps (undocumented per-server layout)",
      "project memory at <traeHome>/memory/projects/<opaque-slug>/project_memory.md (slug scheme undocumented, so it is not workspace-qualified)",
      "TraeCode CLI 2.0 runtime skill root under $TRAE_HOME (undocumented)",
      "enterprise-edition TRAE managed skills and skill controls",
      "session transcripts (TRAE exposes a conversation SessionID and a packaged log folder, not a workspace-qualified on-disk transcript)",
      "skill-config.json fields other than disabledSkills, deletedSkills, and builtinSkillStatus",
      "Better Harness plugin install/lifecycle for TRAE (no documented native manifest or install command)",
    ],
  };
}
