import { __setMockClient, __resetMockClients } from "../__mocks__/azure-devops-extension-api";
import { PrDataService } from "@/services/PrDataService";
import { PrRecord, ReviewerRecord } from "@/models/interfaces";

function makePr(overrides: Partial<PrRecord> = {}): PrRecord {
  return {
    id: 1,
    title: "Test PR",
    repoName: "repo-1",
    repoId: "r1",
    authorName: "Alice",
    authorId: "user-alice",
    createdDate: new Date("2025-01-01T10:00:00Z"),
    closedDate: null,
    status: "active",
    mergeStatus: "",
    reviewers: [],
    commentCount: 0,
    filesChanged: 3,
    linesAdded: 100,
    linesDeleted: 50,
    firstReviewDate: null,
    lastActivityDate: null,
    autoCompleteSetBy: null,
    completionQueueTime: null,
    url: "https://dev.azure.com/pr/1",
    ...overrides,
  };
}

describe("PrDataService", () => {
  let service: PrDataService;

  beforeEach(() => {
    service = new PrDataService();
  });

  describe("computeSummary", () => {
    it("should count PRs by status correctly", () => {
      const records: PrRecord[] = [
        makePr({ id: 1, status: "active" }),
        makePr({ id: 2, status: "active" }),
        makePr({
          id: 3,
          status: "completed",
          closedDate: new Date("2025-01-03T10:00:00Z"),
        }),
        makePr({ id: 4, status: "abandoned" }),
      ];

      const summary = service.computeSummary(records);
      expect(summary.totalOpen).toBe(2);
      expect(summary.totalMerged).toBe(1);
      expect(summary.totalAbandoned).toBe(1);
    });

    it("should compute average time to merge", () => {
      const records: PrRecord[] = [
        makePr({
          id: 1,
          status: "completed",
          createdDate: new Date("2025-01-01T00:00:00Z"),
          closedDate: new Date("2025-01-02T00:00:00Z"),
        }),
        makePr({
          id: 2,
          status: "completed",
          createdDate: new Date("2025-01-01T00:00:00Z"),
          closedDate: new Date("2025-01-03T00:00:00Z"),
        }),
      ];

      const summary = service.computeSummary(records);
      // 24 hours + 48 hours = 72 / 2 = 36 hours
      expect(summary.avgTimeToMergeHours).toBe(36);
    });

    it("should compute average review turnaround", () => {
      const records: PrRecord[] = [
        makePr({
          id: 1,
          createdDate: new Date("2025-01-01T00:00:00Z"),
          firstReviewDate: new Date("2025-01-01T04:00:00Z"),
        }),
        makePr({
          id: 2,
          createdDate: new Date("2025-01-01T00:00:00Z"),
          firstReviewDate: new Date("2025-01-01T08:00:00Z"),
        }),
      ];

      const summary = service.computeSummary(records);
      // 4 + 8 = 12 / 2 = 6 hours
      expect(summary.avgReviewTurnaroundHours).toBe(6);
    });

    it("should return zero averages for empty records", () => {
      const summary = service.computeSummary([]);
      expect(summary.totalOpen).toBe(0);
      expect(summary.totalMerged).toBe(0);
      expect(summary.totalAbandoned).toBe(0);
      expect(summary.avgTimeToMergeHours).toBe(0);
      expect(summary.avgReviewTurnaroundHours).toBe(0);
      expect(summary.avgPrSizeLines).toBe(0);
    });

    it("should compute average PR size from filesChanged", () => {
      const records: PrRecord[] = [
        makePr({ id: 1, filesChanged: 5 }),
        makePr({ id: 2, filesChanged: 15 }),
      ];

      const summary = service.computeSummary(records);
      // (5 + 15) / 2 = 10
      expect(summary.avgPrSizeLines).toBe(10);
    });
  });

  describe("findStalePrs", () => {
    it("should return only active PRs older than threshold", () => {
      const now = Date.now();
      const records: PrRecord[] = [
        makePr({
          id: 1,
          status: "active",
          createdDate: new Date(now - 10 * 24 * 60 * 60 * 1000),
        }),
        makePr({
          id: 2,
          status: "active",
          createdDate: new Date(now - 3 * 24 * 60 * 60 * 1000),
        }),
        makePr({
          id: 3,
          status: "completed",
          createdDate: new Date(now - 10 * 24 * 60 * 60 * 1000),
          closedDate: new Date(),
        }),
      ];

      const stale = service.findStalePrs(records, 7);
      expect(stale).toHaveLength(1);
      expect(stale[0].id).toBe(1);
    });

    it("should return empty array when no stale PRs", () => {
      const now = Date.now();
      const records: PrRecord[] = [
        makePr({
          id: 1,
          status: "active",
          createdDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
        }),
      ];

      const stale = service.findStalePrs(records, 7);
      expect(stale).toHaveLength(0);
    });

    it("should not include completed or abandoned PRs", () => {
      const now = Date.now();
      const records: PrRecord[] = [
        makePr({
          id: 1,
          status: "completed",
          createdDate: new Date(now - 30 * 24 * 60 * 60 * 1000),
          closedDate: new Date(),
        }),
        makePr({
          id: 2,
          status: "abandoned",
          createdDate: new Date(now - 30 * 24 * 60 * 60 * 1000),
        }),
      ];

      const stale = service.findStalePrs(records, 7);
      expect(stale).toHaveLength(0);
    });
  });

  describe("computeUserStats", () => {
    it("should compute author and reviewer stats", () => {
      const reviewers: ReviewerRecord[] = [
        { name: "Bob", id: "user-bob", vote: 10, reviewedDate: new Date("2025-01-01T12:00:00Z") },
      ];

      const records: PrRecord[] = [
        makePr({
          id: 1,
          authorName: "Alice",
          authorId: "user-alice",
          reviewers,
          commentCount: 5,
        }),
        makePr({
          id: 2,
          authorName: "Alice",
          authorId: "user-alice",
          reviewers,
          commentCount: 3,
        }),
      ];

      const stats = service.computeUserStats(records);
      const alice = stats.find((s) => s.userId === "user-alice");
      const bob = stats.find((s) => s.userId === "user-bob");

      expect(alice).toBeDefined();
      expect(alice!.prsAuthored).toBe(2);
      expect(alice!.prsReviewed).toBe(0);

      expect(bob).toBeDefined();
      expect(bob!.prsReviewed).toBe(2);
      expect(bob!.prsAuthored).toBe(0);
    });

    it("should sort by total activity (authored + reviewed)", () => {
      const records: PrRecord[] = [
        makePr({
          id: 1,
          authorName: "Alice",
          authorId: "user-alice",
          reviewers: [
            {
              name: "Charlie",
              id: "user-charlie",
              vote: 10,
              reviewedDate: new Date("2025-01-02T00:00:00Z"),
            },
          ],
        }),
        makePr({
          id: 2,
          authorName: "Bob",
          authorId: "user-bob",
          reviewers: [
            {
              name: "Charlie",
              id: "user-charlie",
              vote: 10,
              reviewedDate: new Date("2025-01-02T00:00:00Z"),
            },
          ],
        }),
        makePr({
          id: 3,
          authorName: "Bob",
          authorId: "user-bob",
          reviewers: [
            {
              name: "Charlie",
              id: "user-charlie",
              vote: 10,
              reviewedDate: new Date("2025-01-02T00:00:00Z"),
            },
          ],
        }),
      ];

      const stats = service.computeUserStats(records);
      // Charlie: 0 authored + 3 reviewed = 3
      // Bob: 2 authored + 0 reviewed = 2
      // Alice: 1 authored + 0 reviewed = 1
      expect(stats[0].userId).toBe("user-charlie");
      expect(stats[1].userId).toBe("user-bob");
      expect(stats[2].userId).toBe("user-alice");
    });

    it("should return empty array for no records", () => {
      const stats = service.computeUserStats([]);
      expect(stats).toHaveLength(0);
    });
  });

  describe("computeWeeklyFrequency", () => {
    it("should return 12 weeks of data", () => {
      const frequency = service.computeWeeklyFrequency([]);
      expect(frequency.length).toBe(12);
    });

    it("should count created PRs in correct weeks", () => {
      const now = new Date();
      const records: PrRecord[] = [
        makePr({ id: 1, createdDate: new Date(now) }),
        makePr({ id: 2, createdDate: new Date(now) }),
      ];

      const frequency = service.computeWeeklyFrequency(records);
      const lastWeek = frequency[frequency.length - 1];
      expect(lastWeek.created).toBeGreaterThanOrEqual(2);
    });

    it("should count merged PRs in correct weeks", () => {
      const now = new Date();
      const records: PrRecord[] = [
        makePr({
          id: 1,
          status: "completed",
          createdDate: new Date(now),
          closedDate: new Date(now),
        }),
      ];

      const frequency = service.computeWeeklyFrequency(records);
      const totalMerged = frequency.reduce((sum, w) => sum + w.merged, 0);
      expect(totalMerged).toBeGreaterThanOrEqual(1);
    });

    it("should return weeks in sorted order", () => {
      const frequency = service.computeWeeklyFrequency([]);
      for (let i = 1; i < frequency.length; i++) {
        expect(frequency[i].week >= frequency[i - 1].week).toBe(true);
      }
    });
  });

  describe("fetchAllPrs", () => {
    beforeEach(() => __resetMockClients());

    function makeApiPr(id: number, created: Date) {
      return {
        pullRequestId: id,
        title: `PR ${id}`,
        status: 1,
        createdBy: { displayName: "Alice", id: "user-alice" },
        creationDate: created.toISOString(),
        repository: { id: "r1", name: "repo-1" },
        reviewers: [],
        url: `https://dev.azure.com/pr/${id}`,
      };
    }

    it("should page through pull requests with skip/top until a short page", async () => {
      const now = new Date();
      const fullPage = Array.from({ length: 100 }, (_, i) => makeApiPr(i + 1, now));
      const shortPage = [makeApiPr(101, now)];

      const getPullRequests = jest
        .fn()
        .mockImplementation(
          (_repoId: string, criteria: any, _project: string, _max: any, skip: number) => {
            if (criteria.status !== 1) return Promise.resolve([]);
            return Promise.resolve(skip === 0 ? fullPage : shortPage);
          }
        );

      __setMockClient("GitRestClient", {
        getPullRequests,
        getThreads: jest.fn().mockResolvedValue([]),
        getPullRequestIterations: jest.fn().mockResolvedValue([]),
      });

      const records = await service.fetchAllPrs(
        "project-1",
        [{ id: "r1", name: "repo-1", defaultBranch: "refs/heads/main" }],
        30
      );

      expect(records).toHaveLength(101);
      const activeCalls = getPullRequests.mock.calls.filter((c) => c[1].status === 1);
      expect(activeCalls.map((c) => c[4])).toEqual([0, 100]);
      expect(activeCalls[0][5]).toBe(100);
    });

    it("should stop paging closed PRs once a page is older than the cutoff", async () => {
      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      const fullOldPage = Array.from({ length: 100 }, (_, i) => ({
        ...makeApiPr(i + 1, old),
        status: 3,
        closedDate: old.toISOString(),
      }));

      const getPullRequests = jest
        .fn()
        .mockImplementation((_repoId: string, criteria: any) =>
          Promise.resolve(criteria.status === 3 ? fullOldPage : [])
        );

      __setMockClient("GitRestClient", {
        getPullRequests,
        getThreads: jest.fn().mockResolvedValue([]),
        getPullRequestIterations: jest.fn().mockResolvedValue([]),
      });

      const records = await service.fetchAllPrs(
        "project-1",
        [{ id: "r1", name: "repo-1", defaultBranch: "refs/heads/main" }],
        30
      );

      expect(records).toHaveLength(0);
      expect(getPullRequests.mock.calls.filter((c) => c[1].status === 3)).toHaveLength(1);
    });

    it("should date reviews and last activity from threads and pushes", async () => {
      const now = new Date();
      const pr = {
        ...makeApiPr(1, now),
        reviewers: [{ displayName: "Bob", id: "user-bob", vote: 10 }],
      };
      const thread = (by: string, published: string, updated?: string) => ({
        isDeleted: false,
        publishedDate: published,
        lastUpdatedDate: updated,
        comments: [{ author: { id: by } }],
      });

      __setMockClient("GitRestClient", {
        getPullRequests: jest
          .fn()
          .mockImplementation((_r: string, c: any) => Promise.resolve(c.status === 1 ? [pr] : [])),
        getThreads: jest
          .fn()
          .mockResolvedValue([
            thread("user-alice", "2026-01-01T09:00:00Z"),
            thread("user-bob", "2026-01-03T09:00:00Z", "2026-01-05T09:00:00Z"),
            thread("user-bob", "2026-01-02T09:00:00Z"),
          ]),
        getPullRequestIterations: jest
          .fn()
          .mockResolvedValue([{ id: 1, createdDate: "2026-01-06T09:00:00Z" }]),
        getPullRequestIterationChanges: jest.fn().mockResolvedValue({ changeEntries: [] }),
      });

      const [record] = await service.fetchAllPrs("project-1", [{ id: "r1", name: "repo-1" }], 30);

      expect(record.reviewers[0].reviewedDate).toEqual(new Date("2026-01-02T09:00:00Z"));
      expect(record.firstReviewDate).toEqual(new Date("2026-01-02T09:00:00Z"));
      expect(record.lastActivityDate).toEqual(new Date("2026-01-06T09:00:00Z"));
    });

    it("should stop fetching when the signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const getPullRequests = jest.fn().mockResolvedValue([]);
      __setMockClient("GitRestClient", { getPullRequests });

      const records = await service.fetchAllPrs(
        "project-1",
        [{ id: "r1", name: "repo-1" }],
        30,
        controller.signal
      );

      expect(records).toHaveLength(0);
      expect(getPullRequests).not.toHaveBeenCalled();
    });
  });
});
