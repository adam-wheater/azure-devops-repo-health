import { getClient } from "azure-devops-extension-api";
import { GitRestClient, PullRequestStatus } from "azure-devops-extension-api/Git";
import { ConcurrencyLimiter } from "../utils/ConcurrencyLimiter";
import {
  PrRecord,
  PrStats,
  PrDashboardData,
  UserPrStats,
  RepoHealthSettings,
  ReviewerRecord,
} from "../models/interfaces";

interface GitRepo {
  id: string;
  name: string;
  defaultBranch?: string;
  project?: { name: string; id: string };
}

interface GitPullRequestResult {
  pullRequestId: number;
  title: string;
  status: number;
  createdBy: { displayName: string; id: string };
  creationDate: string;
  closedDate?: string;
  repository: { id: string; name: string };
  reviewers: Array<{
    displayName: string;
    id: string;
    vote: number;
  }>;
  autoCompleteSetBy?: { displayName: string } | null;
  completionQueueTime?: string;
  url: string;
  mergeStatus?: number;
}

const PR_PAGE_SIZE = 100;

function statusToString(status: number): "active" | "completed" | "abandoned" {
  if (status === PullRequestStatus.Completed) return "completed";
  if (status === PullRequestStatus.Abandoned) return "abandoned";
  return "active";
}

function mapPr(pr: GitPullRequestResult): PrRecord {
  const reviewers: ReviewerRecord[] = (pr.reviewers || []).map((r) => ({
    name: r.displayName,
    id: r.id,
    vote: r.vote,
    reviewedDate: null,
  }));

  return {
    id: pr.pullRequestId,
    title: pr.title,
    repoName: pr.repository?.name ?? "Unknown",
    repoId: pr.repository?.id ?? "",
    authorName: pr.createdBy?.displayName ?? "Unknown",
    authorId: pr.createdBy?.id ?? "",
    createdDate: new Date(pr.creationDate),
    closedDate: pr.closedDate ? new Date(pr.closedDate) : null,
    status: statusToString(pr.status),
    mergeStatus: pr.mergeStatus != null ? String(pr.mergeStatus) : "",
    reviewers,
    commentCount: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    firstReviewDate: null,
    lastActivityDate: null,
    autoCompleteSetBy: pr.autoCompleteSetBy?.displayName ?? null,
    completionQueueTime: pr.completionQueueTime ? new Date(pr.completionQueueTime) : null,
    url: pr.url ?? "",
  };
}

export class PrDataService {
  async fetchAllPrs(
    projectName: string,
    repos: GitRepo[],
    timePeriodDays: number,
    signal?: AbortSignal
  ): Promise<PrRecord[]> {
    const gitClient = getClient(GitRestClient);
    const limiter = new ConcurrencyLimiter(5);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timePeriodDays);

    const allRecords: PrRecord[] = [];

    await limiter.map(repos, async (repo) => {
      if (signal?.aborted) return;

      for (const status of [
        PullRequestStatus.Active,
        PullRequestStatus.Completed,
        PullRequestStatus.Abandoned,
      ]) {
        if (signal?.aborted) return;

        try {
          const prs = await this.fetchPrsForStatus(
            gitClient,
            projectName,
            repo,
            status,
            cutoffDate,
            signal
          );

          for (const pr of prs) {
            if (signal?.aborted) return;
            const created = new Date(pr.creationDate);
            if (created < cutoffDate && status !== PullRequestStatus.Active) continue;
            const record = mapPr(pr);

            // Enrich with comment count and file stats
            try {
              const [threads, iterations] = await Promise.all([
                (gitClient as any).getThreads(repo.id, pr.pullRequestId, projectName),
                (gitClient as any).getPullRequestIterations(repo.id, pr.pullRequestId, projectName),
              ]);
              if (threads) {
                record.commentCount = threads.filter(
                  (t: any) => !t.isDeleted && t.comments?.length > 0
                ).length;

                // The Git API sends no reviewer votedDate, so review and activity dates come
                // from threads: every comment and every vote opens one.
                const authorId = pr.createdBy?.id;
                for (const thread of threads) {
                  if (thread.isDeleted || !thread.comments?.length || !thread.publishedDate)
                    continue;
                  const opened = new Date(thread.publishedDate);
                  const touched = thread.lastUpdatedDate
                    ? new Date(thread.lastUpdatedDate)
                    : opened;
                  if (!record.lastActivityDate || touched > record.lastActivityDate) {
                    record.lastActivityDate = touched;
                  }
                  const by = thread.comments[0]?.author?.id;
                  if (!by || by === authorId) continue;
                  if (!record.firstReviewDate || opened < record.firstReviewDate) {
                    record.firstReviewDate = opened;
                  }
                  const reviewer = record.reviewers.find((r) => r.id === by);
                  if (reviewer && (!reviewer.reviewedDate || opened < reviewer.reviewedDate)) {
                    reviewer.reviewedDate = opened;
                  }
                }
              }
              if (iterations && iterations.length > 0) {
                const lastIterId = iterations[iterations.length - 1].id;
                const pushed = iterations[iterations.length - 1].createdDate;
                if (
                  pushed &&
                  (!record.lastActivityDate || new Date(pushed) > record.lastActivityDate)
                ) {
                  record.lastActivityDate = new Date(pushed);
                }
                try {
                  const iterChanges = await (gitClient as any).getPullRequestIterationChanges(
                    repo.id,
                    pr.pullRequestId,
                    lastIterId,
                    projectName
                  );
                  record.filesChanged = iterChanges?.changeEntries?.length ?? 0;
                } catch {
                  // Fall back to iteration changeList if available
                  const lastIter = iterations[iterations.length - 1];
                  record.filesChanged = lastIter?.changeList?.length ?? 0;
                }
              }
            } catch {
              // Non-critical - leave as 0
            }

            allRecords.push(record);
          }
        } catch (err) {
          console.warn(`Failed to fetch PRs for repo ${repo.name} (status ${status}):`, err);
        }
      }
    });

    return allRecords;
  }

  /**
   * Fetch every pull request of one status for a repository. The REST endpoint
   * returns at most one page (default 101) per call, so page through with
   * skip/top until a short page comes back. Results arrive newest first, so for
   * closed PRs we stop as soon as a page runs past the time-period cutoff.
   */
  private async fetchPrsForStatus(
    gitClient: any,
    projectName: string,
    repo: GitRepo,
    status: number,
    cutoffDate: Date,
    signal?: AbortSignal
  ): Promise<GitPullRequestResult[]> {
    const results: GitPullRequestResult[] = [];
    let skip = 0;
    for (;;) {
      if (signal?.aborted) break;
      const page: GitPullRequestResult[] | null = await gitClient.getPullRequests(
        repo.id,
        { status, targetRefName: repo.defaultBranch },
        projectName,
        undefined,
        skip,
        PR_PAGE_SIZE
      );
      if (!page || page.length === 0) break;
      results.push(...page);
      if (page.length < PR_PAGE_SIZE) break;
      if (status !== PullRequestStatus.Active) {
        const oldest = new Date(page[page.length - 1].creationDate);
        if (oldest < cutoffDate) break;
      }
      skip += page.length;
    }
    return results;
  }

  computeSummary(records: PrRecord[]): PrStats {
    let totalOpen = 0;
    let totalMerged = 0;
    let totalAbandoned = 0;
    let mergeTimeSum = 0;
    let mergeTimeCount = 0;
    let reviewTurnaroundSum = 0;
    let reviewTurnaroundCount = 0;
    let sizeSum = 0;
    let sizeCount = 0;

    for (const pr of records) {
      if (pr.status === "active") totalOpen++;
      else if (pr.status === "completed") totalMerged++;
      else if (pr.status === "abandoned") totalAbandoned++;

      if (pr.status === "completed" && pr.closedDate) {
        const mergeHours = (pr.closedDate.getTime() - pr.createdDate.getTime()) / (1000 * 60 * 60);
        mergeTimeSum += mergeHours;
        mergeTimeCount++;
      }

      if (pr.firstReviewDate) {
        const turnaroundHours =
          (pr.firstReviewDate.getTime() - pr.createdDate.getTime()) / (1000 * 60 * 60);
        if (turnaroundHours >= 0) {
          reviewTurnaroundSum += turnaroundHours;
          reviewTurnaroundCount++;
        }
      }

      if (pr.filesChanged > 0) {
        sizeSum += pr.filesChanged;
        sizeCount++;
      }
    }

    return {
      totalOpen,
      totalMerged,
      totalAbandoned,
      avgTimeToMergeHours: mergeTimeCount > 0 ? mergeTimeSum / mergeTimeCount : 0,
      avgReviewTurnaroundHours:
        reviewTurnaroundCount > 0 ? reviewTurnaroundSum / reviewTurnaroundCount : 0,
      avgPrSizeLines: sizeCount > 0 ? sizeSum / sizeCount : 0,
    };
  }

  findStalePrs(records: PrRecord[], thresholdDays: number): PrRecord[] {
    const now = new Date();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

    return records.filter((pr) => {
      if (pr.status !== "active") return false;
      const age = now.getTime() - pr.createdDate.getTime();
      return age > thresholdMs;
    });
  }

  computeUserStats(records: PrRecord[]): UserPrStats[] {
    const userMap = new Map<
      string,
      {
        displayName: string;
        prsAuthored: number;
        prsReviewed: number;
        firstReviewTimes: number[];
        prSizes: number[];
        commentsGiven: number[];
        commentsReceived: number[];
      }
    >();

    const getOrCreate = (userId: string, displayName: string) => {
      let entry = userMap.get(userId);
      if (!entry) {
        entry = {
          displayName,
          prsAuthored: 0,
          prsReviewed: 0,
          firstReviewTimes: [],
          prSizes: [],
          commentsGiven: [],
          commentsReceived: [],
        };
        userMap.set(userId, entry);
      }
      return entry;
    };

    for (const pr of records) {
      // Author stats
      const author = getOrCreate(pr.authorId, pr.authorName);
      author.prsAuthored++;
      author.prSizes.push(pr.filesChanged);
      author.commentsReceived.push(pr.commentCount);

      // Reviewer stats
      for (const reviewer of pr.reviewers) {
        if (reviewer.id === pr.authorId) continue;
        const rev = getOrCreate(reviewer.id, reviewer.name);
        rev.prsReviewed++;
        rev.commentsGiven.push(pr.commentCount > 0 ? 1 : 0);

        if (reviewer.reviewedDate) {
          const turnaround =
            (reviewer.reviewedDate.getTime() - pr.createdDate.getTime()) / (1000 * 60 * 60);
          if (turnaround >= 0) {
            rev.firstReviewTimes.push(turnaround);
          }
        }
      }
    }

    const stats: UserPrStats[] = [];
    for (const [userId, data] of userMap) {
      const avgFirstReview =
        data.firstReviewTimes.length > 0
          ? data.firstReviewTimes.reduce((a, b) => a + b, 0) / data.firstReviewTimes.length
          : 0;
      const avgSize =
        data.prSizes.length > 0 ? data.prSizes.reduce((a, b) => a + b, 0) / data.prSizes.length : 0;
      const avgGiven =
        data.commentsGiven.length > 0
          ? data.commentsGiven.reduce((a, b) => a + b, 0) / data.commentsGiven.length
          : 0;
      const avgReceived =
        data.commentsReceived.length > 0
          ? data.commentsReceived.reduce((a, b) => a + b, 0) / data.commentsReceived.length
          : 0;

      stats.push({
        userId,
        displayName: data.displayName,
        prsAuthored: data.prsAuthored,
        prsReviewed: data.prsReviewed,
        avgTimeToFirstReviewHours: Math.round(avgFirstReview * 10) / 10,
        avgPrSizeLines: Math.round(avgSize),
        avgCommentsGiven: Math.round(avgGiven * 10) / 10,
        avgCommentsReceived: Math.round(avgReceived * 10) / 10,
      });
    }

    return stats.sort((a, b) => b.prsAuthored + b.prsReviewed - (a.prsAuthored + a.prsReviewed));
  }

  computeWeeklyFrequency(records: PrRecord[]): { week: string; created: number; merged: number }[] {
    const weekMap = new Map<string, { created: number; merged: number }>();

    // Build 12 weeks of buckets
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const key = this.getWeekKey(d);
      if (!weekMap.has(key)) {
        weekMap.set(key, { created: 0, merged: 0 });
      }
    }

    for (const pr of records) {
      const createdWeek = this.getWeekKey(pr.createdDate);
      const entry = weekMap.get(createdWeek);
      if (entry) entry.created++;

      if (pr.status === "completed" && pr.closedDate) {
        const mergedWeek = this.getWeekKey(pr.closedDate);
        const mergedEntry = weekMap.get(mergedWeek);
        if (mergedEntry) mergedEntry.merged++;
      }
    }

    return Array.from(weekMap.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  private getWeekKey(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async buildDashboard(
    projectName: string,
    repos: GitRepo[],
    settings: RepoHealthSettings,
    signal?: AbortSignal
  ): Promise<PrDashboardData> {
    const filteredRepos = repos.filter((r) => !settings.excludedRepoIds.includes(r.id));
    const prRecords = await this.fetchAllPrs(
      projectName,
      filteredRepos,
      settings.timePeriodDays,
      signal
    );
    const summary = this.computeSummary(prRecords);
    const stalePrs = this.findStalePrs(prRecords, settings.stalePrThresholdDays);
    const userStats = this.computeUserStats(prRecords);
    const weeklyFrequency = this.computeWeeklyFrequency(prRecords);

    return {
      summary,
      stalePrs,
      prRecords,
      userStats,
      weeklyFrequency,
    };
  }
}
