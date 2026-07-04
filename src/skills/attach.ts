import { cp, lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isErrno, loadStore, updateStore, type JsonStore } from "../core/atomic-json.js";
import { projectSkillsStatePath } from "../core/paths.js";

export interface ProjectSkillsState {
  version: 1;
  attached: SkillAttachment[];
}

export interface SkillAttachment {
  name: string;
  source: "sessions-pool" | "path";
  sourcePath: string;
  materializedPath: string;
}

export interface AttachSkillOptions {
  projectCwd: string;
  sourcePath: string;
  name?: string;
  preferSymlink?: boolean;
}

export interface ProjectSkillSelection {
  name: string;
  sourcePath: string;
  enabled: boolean;
}

function projectSkillsStore(projectCwd: string): JsonStore<ProjectSkillsState> {
  return {
    path: projectSkillsStatePath(projectCwd),
    empty: () => ({ version: 1, attached: [] }),
    parse: (state) => {
      if (state.version !== 1 || !Array.isArray(state.attached)) throw new Error("Invalid project skills state");
      return state;
    },
  };
}

export async function loadProjectSkillsState(projectCwd: string): Promise<ProjectSkillsState> {
  return loadStore(projectSkillsStore(projectCwd));
}

export async function attachSkill(options: AttachSkillOptions): Promise<SkillAttachment> {
  let attachment: SkillAttachment | undefined;
  await updateStore(projectSkillsStore(options.projectCwd), async (state) => {
    attachment = await materializeSkill(options.projectCwd, options.name ?? basename(options.sourcePath), options.sourcePath, options.preferSymlink ?? true);
    const next = state.attached.filter((item) => item.name !== attachment?.name);
    next.push(attachment);
    return { version: 1 as const, attached: next };
  });
  if (!attachment) throw new Error("Skill was not attached");
  return attachment;
}

export async function setProjectSkills(projectCwd: string, skills: ProjectSkillSelection[]): Promise<ProjectSkillsState> {
  return updateStore(projectSkillsStore(projectCwd), async (state) => {
    const disabled = new Set(skills.filter((skill) => !skill.enabled).map((skill) => skill.name));
    const attached = state.attached.filter((attachment) => !disabled.has(attachment.name));

    for (const skill of skills) {
      if (!skill.enabled) continue;
      const sourcePath = resolve(skill.sourcePath);
      const index = attached.findIndex((item) => item.name === skill.name);
      const existing = index === -1 ? undefined : attached[index];
      let attachment: SkillAttachment;
      if (existing && resolve(existing.sourcePath) === sourcePath) {
        await assertManagedMaterialization(existing);
        attachment = existing;
      } else {
        if (existing) {
          await assertManagedMaterialization(existing);
          await rm(existing.materializedPath, { recursive: true, force: false });
        }
        attachment = await materializeSkill(projectCwd, skill.name, sourcePath, true);
      }
      if (index !== -1) attached.splice(index, 1);
      attached.push(attachment);
    }

    for (const attachment of state.attached) {
      if (disabled.has(attachment.name)) {
        await assertManagedMaterialization(attachment);
        await rm(attachment.materializedPath, { recursive: true, force: false });
      }
    }

    return { version: 1 as const, attached };
  });
}

export async function detachSkill(projectCwd: string, name: string): Promise<boolean> {
  const current = await loadProjectSkillsState(projectCwd);
  if (!current.attached.some((item) => item.name === name)) return false;

  await updateStore(projectSkillsStore(projectCwd), async (state) => {
    const attachment = state.attached.find((item) => item.name === name);
    if (!attachment) return state;
    await assertManagedMaterialization(attachment);
    await rm(attachment.materializedPath, { recursive: true, force: false });
    return { version: 1 as const, attached: state.attached.filter((item) => item.name !== name) };
  });
  return true;
}

async function materializeSkill(projectCwd: string, name: string, inputPath: string, preferSymlink: boolean): Promise<SkillAttachment> {
  const sourcePath = resolve(inputPath);
  const materializedPath = join(resolve(projectCwd), ".pi", "skills", name);
  const attachment: SkillAttachment = { name, source: "path", sourcePath, materializedPath };

  await mkdir(join(resolve(projectCwd), ".pi", "skills"), { recursive: true });
  if (preferSymlink) {
    try {
      await symlink(sourcePath, materializedPath, "dir");
    } catch (error) {
      if (isErrno(error, "EEXIST")) throw error;
      await cp(sourcePath, materializedPath, { recursive: true });
    }
  } else {
    await cp(sourcePath, materializedPath, { recursive: true });
  }
  return attachment;
}

async function assertManagedMaterialization(attachment: SkillAttachment): Promise<void> {
  const stat = await lstat(attachment.materializedPath);
  if (!stat.isSymbolicLink()) return;
  const target = await readlink(attachment.materializedPath);
  if (resolve(target) !== resolve(attachment.sourcePath)) {
    throw new Error(`Refusing to detach unmanaged skill path: ${attachment.materializedPath}`);
  }
}
