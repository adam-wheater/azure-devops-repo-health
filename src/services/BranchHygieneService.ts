import { getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { PolicyRestClient } from "azure-devops-extension-api/Policy";
import { ConcurrencyLimiter } from "../utils/ConcurrencyLimiter";
import {
  StaleBranch,
  BranchPolicyStatus,
  RepoHygieneReport,
  HygieneScanResult,
  HygieneSettings,
} from "../models/hygieneInterfaces";

interface GitRepo {
  id: string;
  name: string;
  defaultBranch?: string;
  project?: { name: string; id: string };
}

const NULL_OBJECT_ID = "0000000000000000000000000000000000000000";

/** Normalise "main" / "refs/heads/main" to the full ref name. */
function toRefName(branch: string): string {
  return branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
}

/**
 * Whether a policy scope entry applies to `refName` in `repoId`.
 * A scope with no repositoryId is project-wide; one with no refName covers
 * every branch; otherwise matchKind decides between exact and prefix match.
 */
export function scopeAppliesTo(scope: any, repoId: string, refName: string): boolean {
  if (!scope) return false;
  if (scope.repositoryId && scope.repositoryId !== repoId) return false;
  if (!scope.refName) return true;
  const kind = String(scope.matchKind ?? "exact").toLowerCase();
  if (kind === "prefix") return refName.startsWith(scope.refName);
  return scope.refName === refName;
}

export class BranchHygieneService {
  async scanAllRepos(
    projectName: string,
    repos: GitRepo[],
    settings: HygieneSettings,
    onProgress: (phase: string, current: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<HygieneScanResult> {
    const limiter = new ConcurrencyLimiter(5);
    const allStaleBranches: StaleBranch[] = [];
    const allPolicies: BranchPolicyStatus[] = [];
    const allReports: RepoHygieneReport[] = [];

    // Fetch all project policies once upfront (includes inherited/project-level policies)
    const projectPolicies = await this.fetchProjectPolicies(projectName);

    let completed = 0;
    const total = repos.length;

    await limiter.map(repos, async (repo) => {
      if (signal?.aborted) return;

      onProgress(`Scanning ${repo.name}...`, completed, total);
      const defaultBranch = repo.defaultBranch ?? "refs/heads/main";

      try {
        const [staleBranches, policies, hygiene] = await Promise.all([
          this.getStaleBranches(
            repo.id,
            repo.name,
            settings.staleBranchThresholdDays,
            projectName,
            defaultBranch
          ),
          Promise.resolve(this.getRepoPolicies(repo.id, repo.name, defaultBranch, projectPolicies)),
          this.getRepoHygiene(
            repo.id,
            repo.name,
            settings.abandonedRepoThresholdDays,
            settings.largeFileSizeMb,
            projectName,
            projectPolicies,
            defaultBranch
          ),
        ]);

        allStaleBranches.push(...staleBranches);
        allPolicies.push(policies);
        allReports.push(hygiene);
      } catch (err) {
        console.warn(`Failed to scan repo ${repo.name}:`, err);
        allReports.push({
          repoName: repo.name,
          repoId: repo.id,
          hasGitignore: false,
          isDefaultBranchProtected: false,
          lastCommitDate: null,
          isAbandoned: false,
          largeFiles: [],
        });
      }

      completed++;
      onProgress(`Scanning ${repo.name}...`, completed, total);
    });

    const summary = {
      totalStaleBranches: allStaleBranches.length,
      unprotectedRepos: allPolicies.filter((p) => !p.hasMinReviewers && !p.hasBuildValidation)
        .length,
      abandonedRepos: allReports.filter((r) => r.isAbandoned).length,
      largeFileCount: allReports.reduce((sum, r) => sum + r.largeFiles.length, 0),
    };

    return {
      staleBranches: allStaleBranches.sort(
        (a, b) => b.ageDays - a.ageDays || a.repoName.localeCompare(b.repoName)
      ),
      policyAudit: allPolicies.sort((a, b) => a.repoName.localeCompare(b.repoName)),
      repoReports: allReports.sort((a, b) => a.repoName.localeCompare(b.repoName)),
      summary,
    };
  }

  /**
   * All branch refs for a repository. The refs API is paged (continuationToken
   * on the returned list), so a repository with more than one page of branches
   * would otherwise be silently truncated.
   */
  private async getAllBranchRefs(repoId: string, projectName: string): Promise<any[]> {
    const gitClient = getClient(GitRestClient);
    const refs: any[] = [];
    let continuationToken: string | undefined;
    do {
      const page: any = await (gitClient as any).getRefs(
        repoId,
        projectName,
        "heads/",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        continuationToken
      );
      if (!page || !Array.isArray(page)) break;
      refs.push(...page);
      continuationToken = (page as { continuationToken?: string }).continuationToken || undefined;
    } while (continuationToken);
    return refs;
  }

  async getStaleBranches(
    repoId: string,
    repoName: string,
    thresholdDays: number,
    projectName: string,
    defaultBranch?: string
  ): Promise<StaleBranch[]> {
    const gitClient = getClient(GitRestClient);
    const now = new Date();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const defaultRef = defaultBranch ? toRefName(defaultBranch) : null;

    try {
      const refs = await this.getAllBranchRefs(repoId, projectName);
      if (refs.length === 0) return [];

      const staleBranches: StaleBranch[] = [];

      for (const ref of refs) {
        const refName: string = ref.name ?? "";
        const branchName = refName.replace("refs/heads/", "");
        if (branchName === "main" || branchName === "master" || branchName === "develop") {
          continue;
        }
        // Never report (or offer to delete) the repository's own default branch.
        if (defaultRef && refName === defaultRef) continue;

        try {
          const commits = await (gitClient as any).getCommits(
            repoId,
            { $top: 1, itemVersion: { version: branchName } },
            projectName
          );

          if (commits && commits.length > 0) {
            const lastCommit = commits[0];
            const commitDate = new Date(lastCommit.committer?.date ?? lastCommit.author?.date);
            const ageMs = now.getTime() - commitDate.getTime();
            if (!Number.isFinite(ageMs)) continue;
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

            if (ageMs > thresholdMs) {
              staleBranches.push({
                name: branchName,
                repoName,
                repoId,
                objectId: ref.objectId ?? "",
                lastCommitDate: commitDate,
                lastAuthor: lastCommit.author?.name ?? "Unknown",
                ageDays,
              });
            }
          }
        } catch {
          // Skip branches where we can't get commits
        }
      }

      return staleBranches;
    } catch (err) {
      console.warn(`Failed to get refs for repo ${repoName}:`, err);
      return [];
    }
  }

  private async fetchProjectPolicies(projectName: string): Promise<any[]> {
    const policyClient = getClient(PolicyRestClient);
    try {
      const policies = await (policyClient as any).getPolicyConfigurations(projectName);
      return (policies || []).filter((p: any) => p.isEnabled);
    } catch (err) {
      console.warn("Failed to fetch project policies:", err);
      return [];
    }
  }

  getRepoPolicies(
    repoId: string,
    repoName: string,
    defaultBranch: string,
    allPolicies: any[]
  ): BranchPolicyStatus {
    const defaultRef = toRefName(defaultBranch);

    // Policies whose scope covers this repository's default branch, either
    // directly (repositoryId matches) or inherited from a project-level scope.
    const repoPolicies = allPolicies.filter((p: any) =>
      p.settings?.scope?.some((s: any) => scopeAppliesTo(s, repoId, defaultRef))
    );

    const inheritedPolicies = repoPolicies.filter((p: any) =>
      p.settings?.scope?.some((s: any) => !s.repositoryId && scopeAppliesTo(s, repoId, defaultRef))
    );

    const hasMinReviewers = repoPolicies.some(
      (p: any) =>
        p.type?.id === "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab" ||
        p.type?.displayName?.toLowerCase().includes("minimum number of reviewers")
    );

    const hasBuildValidation = repoPolicies.some(
      (p: any) =>
        p.type?.id === "0609b952-1397-4640-95ec-e00a01b2c241" ||
        p.type?.displayName?.toLowerCase().includes("build")
    );

    const hasCommentResolution = repoPolicies.some(
      (p: any) =>
        p.type?.id === "c6a1889d-b943-4856-b76f-9e46e181b22d" ||
        p.type?.displayName?.toLowerCase().includes("comment")
    );

    return {
      repoName,
      repoId,
      defaultBranch: defaultRef.replace("refs/heads/", ""),
      hasMinReviewers,
      hasBuildValidation,
      hasCommentResolution,
      policyCount: repoPolicies.length,
      inheritedPolicyCount: inheritedPolicies.length,
    };
  }

  async getRepoHygiene(
    repoId: string,
    repoName: string,
    abandonedThresholdDays: number,
    largeFileSizeMb: number,
    projectName: string,
    projectPolicies?: any[],
    defaultBranch = "refs/heads/main"
  ): Promise<RepoHygieneReport> {
    const gitClient = getClient(GitRestClient);
    let hasGitignore = false;
    let lastCommitDate: Date | null = null;
    let isAbandoned = false;
    const largeFiles: { path: string; size: number }[] = [];

    // Check for .gitignore
    try {
      const item = await (gitClient as any).getItem(repoId, ".gitignore", projectName);
      hasGitignore = !!item;
    } catch {
      hasGitignore = false;
    }

    // Get last commit date
    try {
      const commits = await (gitClient as any).getCommits(repoId, { $top: 1 }, projectName);
      if (commits && commits.length > 0) {
        lastCommitDate = new Date(commits[0].committer?.date ?? commits[0].author?.date);
        const daysSinceLastCommit = Math.floor(
          (Date.now() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        isAbandoned = daysSinceLastCommit > abandonedThresholdDays;
      }
    } catch {
      // Repository might be empty
    }

    // Check for large files by looking at root items
    try {
      const items = await (gitClient as any).getItems(repoId, projectName, "/", "Full");
      if (items && Array.isArray(items)) {
        const sizeThreshold = largeFileSizeMb * 1024 * 1024;
        for (const item of items) {
          if (item.size && item.size > sizeThreshold && !item.isFolder) {
            largeFiles.push({ path: item.path, size: item.size });
          }
        }
      }
    } catch {
      // Can't inspect items
    }

    // Default branch protection: any enabled policy whose scope covers it.
    // Policy configurations are project-scoped, so reuse the project list
    // when the caller already fetched it rather than querying per repo.
    let isDefaultBranchProtected = false;
    try {
      const policies = projectPolicies ?? (await this.fetchProjectPolicies(projectName));
      const defaultRef = toRefName(defaultBranch);
      isDefaultBranchProtected = policies.some(
        (p: any) =>
          p.isEnabled !== false &&
          p.settings?.scope?.some((s: any) => scopeAppliesTo(s, repoId, defaultRef))
      );
    } catch {
      // Policy check failed
    }

    return {
      repoName,
      repoId,
      hasGitignore,
      isDefaultBranchProtected,
      lastCommitDate,
      isAbandoned,
      largeFiles,
    };
  }

  /**
   * Delete a branch by updating its ref to the null object id.
   * `oldObjectId` must be the commit the branch pointed at when it was scanned:
   * the server rejects the update if the branch has moved since, which protects
   * against deleting work pushed after the scan.
   */
  async deleteBranch(
    repoId: string,
    branchName: string,
    oldObjectId: string,
    projectName: string
  ): Promise<void> {
    const gitClient = getClient(GitRestClient);
    const refUpdate = {
      name: toRefName(branchName),
      oldObjectId,
      newObjectId: NULL_OBJECT_ID,
    };

    const results = await (gitClient as any).updateRefs([refUpdate], repoId, projectName);
    // updateRefs resolves even when the server refuses the update; the outcome
    // is reported per ref in the result list.
    const outcome = Array.isArray(results) ? results[0] : undefined;
    if (outcome && outcome.success === false) {
      const reason = outcome.customMessage || outcome.updateStatus || "update rejected";
      throw new Error(`Could not delete branch "${branchName}": ${reason}`);
    }
  }
}
