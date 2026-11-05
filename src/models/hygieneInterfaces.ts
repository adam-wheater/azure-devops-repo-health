export interface StaleBranch {
  name: string;
  repoName: string;
  repoId: string;
  /** Commit the branch pointed at when scanned; required to delete it safely. */
  objectId: string;
  lastCommitDate: Date;
  lastAuthor: string;
  ageDays: number;
}

export interface BranchPolicyStatus {
  repoName: string;
  repoId: string;
  defaultBranch: string;
  hasMinReviewers: boolean;
  hasBuildValidation: boolean;
  hasCommentResolution: boolean;
  policyCount: number;
  inheritedPolicyCount: number;
}

export interface RepoHygieneReport {
  repoName: string;
  repoId: string;
  hasGitignore: boolean;
  isDefaultBranchProtected: boolean;
  lastCommitDate: Date | null;
  isAbandoned: boolean;
  largeFiles: { path: string; size: number }[];
}

export interface HygieneScanResult {
  staleBranches: StaleBranch[];
  policyAudit: BranchPolicyStatus[];
  repoReports: RepoHygieneReport[];
  summary: {
    totalStaleBranches: number;
    unprotectedRepos: number;
    abandonedRepos: number;
    largeFileCount: number;
  };
}

export interface HygieneSettings {
  staleBranchThresholdDays: number;
  abandonedRepoThresholdDays: number;
  largeFileSizeMb: number;
}

export const DEFAULT_HYGIENE_SETTINGS: HygieneSettings = {
  staleBranchThresholdDays: 30,
  abandonedRepoThresholdDays: 90,
  largeFileSizeMb: 10,
};
