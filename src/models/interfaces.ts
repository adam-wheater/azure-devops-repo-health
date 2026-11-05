export interface PrStats {
  totalOpen: number;
  totalMerged: number;
  totalAbandoned: number;
  avgTimeToMergeHours: number;
  avgReviewTurnaroundHours: number;
  avgPrSizeLines: number;
}

export interface PrRecord {
  id: number;
  title: string;
  repoName: string;
  repoId: string;
  authorName: string;
  authorId: string;
  createdDate: Date;
  closedDate: Date | null;
  status: "active" | "completed" | "abandoned";
  mergeStatus: string;
  reviewers: ReviewerRecord[];
  commentCount: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  firstReviewDate: Date | null;
  lastActivityDate: Date | null;
  autoCompleteSetBy: string | null;
  completionQueueTime: Date | null;
  url: string;
}

export interface ReviewerRecord {
  name: string;
  id: string;
  vote: number;
  /** First comment or vote on the PR by this reviewer. */
  reviewedDate: Date | null;
}

export interface UserPrStats {
  userId: string;
  displayName: string;
  prsAuthored: number;
  prsReviewed: number;
  avgTimeToFirstReviewHours: number;
  avgPrSizeLines: number;
  avgCommentsGiven: number;
  avgCommentsReceived: number;
}

export interface PrDashboardData {
  summary: PrStats;
  stalePrs: PrRecord[];
  prRecords: PrRecord[];
  userStats: UserPrStats[];
  weeklyFrequency: { week: string; created: number; merged: number }[];
}

export interface RepoHealthSettings {
  stalePrThresholdDays: number;
  prSizeWarningLines: number;
  prSizeLargeLines: number;
  timePeriodDays: number;
  excludedRepoIds: string[];
}

export const DEFAULT_SETTINGS: RepoHealthSettings = {
  stalePrThresholdDays: 7,
  prSizeWarningLines: 20,
  prSizeLargeLines: 50,
  timePeriodDays: 30,
  excludedRepoIds: [],
};
