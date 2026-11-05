import { __setMockClient, __resetMockClients } from "../__mocks__/azure-devops-extension-api";
import { BranchHygieneService, scopeAppliesTo } from "@/services/BranchHygieneService";

describe("BranchHygieneService", () => {
  let service: BranchHygieneService;

  beforeEach(() => {
    __resetMockClients();
    service = new BranchHygieneService();
  });

  describe("getStaleBranches", () => {
    it("should return stale branches older than threshold", async () => {
      const now = new Date();
      const staleDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days ago
      const freshDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      __setMockClient("GitRestClient", {
        getRefs: jest.fn().mockResolvedValue([
          { name: "refs/heads/feature-old", objectId: "abc123" },
          { name: "refs/heads/feature-new", objectId: "def456" },
          { name: "refs/heads/main", objectId: "ghi789" },
        ]),
        getCommits: jest.fn().mockImplementation((repoId: string, searchCriteria: any) => {
          const branch = searchCriteria?.itemVersion?.version;
          if (branch === "feature-old") {
            return Promise.resolve([
              {
                commitId: "abc123",
                author: { name: "Alice", date: staleDate.toISOString() },
                committer: { date: staleDate.toISOString() },
              },
            ]);
          }
          if (branch === "feature-new") {
            return Promise.resolve([
              {
                commitId: "def456",
                author: { name: "Bob", date: freshDate.toISOString() },
                committer: { date: freshDate.toISOString() },
              },
            ]);
          }
          return Promise.resolve([]);
        }),
      });

      const result = await service.getStaleBranches("repo-1", "my-repo", 30, "project-1");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("feature-old");
      expect(result[0].lastAuthor).toBe("Alice");
      expect(result[0].ageDays).toBeGreaterThanOrEqual(44);
      expect(result[0].repoName).toBe("my-repo");
    });

    it("should skip main, master, and develop branches", async () => {
      const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      __setMockClient("GitRestClient", {
        getRefs: jest.fn().mockResolvedValue([
          { name: "refs/heads/main", objectId: "a" },
          { name: "refs/heads/master", objectId: "b" },
          { name: "refs/heads/develop", objectId: "c" },
        ]),
        getCommits: jest.fn().mockResolvedValue([
          {
            commitId: "x",
            author: { name: "Test", date: staleDate.toISOString() },
            committer: { date: staleDate.toISOString() },
          },
        ]),
      });

      const result = await service.getStaleBranches("repo-1", "my-repo", 30, "project-1");
      expect(result).toHaveLength(0);
    });

    it("should skip the repository's own default branch even when it has a custom name", async () => {
      const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      __setMockClient("GitRestClient", {
        getRefs: jest.fn().mockResolvedValue([
          { name: "refs/heads/trunk", objectId: "a" },
          { name: "refs/heads/feature-x", objectId: "b" },
        ]),
        getCommits: jest.fn().mockResolvedValue([
          {
            commitId: "x",
            author: { name: "Test", date: staleDate.toISOString() },
            committer: { date: staleDate.toISOString() },
          },
        ]),
      });

      const result = await service.getStaleBranches(
        "repo-1",
        "my-repo",
        30,
        "project-1",
        "refs/heads/trunk"
      );
      expect(result.map((b) => b.name)).toEqual(["feature-x"]);
      expect(result[0].objectId).toBe("b");
    });

    it("should follow the refs continuation token across pages", async () => {
      const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const page1: any = [{ name: "refs/heads/old-1", objectId: "1" }];
      page1.continuationToken = "next";
      const page2: any = [{ name: "refs/heads/old-2", objectId: "2" }];

      const getRefs = jest.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
      __setMockClient("GitRestClient", {
        getRefs,
        getCommits: jest.fn().mockResolvedValue([
          {
            commitId: "x",
            author: { name: "Test", date: staleDate.toISOString() },
            committer: { date: staleDate.toISOString() },
          },
        ]),
      });

      const result = await service.getStaleBranches("repo-1", "my-repo", 30, "project-1");
      expect(result.map((b) => b.name).sort()).toEqual(["old-1", "old-2"]);
      expect(getRefs).toHaveBeenCalledTimes(2);
      expect(getRefs.mock.calls[1][10]).toBe("next");
    });

    it("should return empty array when no refs found", async () => {
      __setMockClient("GitRestClient", {
        getRefs: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getStaleBranches("repo-1", "my-repo", 30, "project-1");
      expect(result).toHaveLength(0);
    });

    it("should handle errors gracefully", async () => {
      __setMockClient("GitRestClient", {
        getRefs: jest.fn().mockRejectedValue(new Error("API error")),
      });

      const result = await service.getStaleBranches("repo-1", "my-repo", 30, "project-1");
      expect(result).toHaveLength(0);
    });
  });

  describe("getRepoPolicies", () => {
    it("should detect policy types correctly", () => {
      const allPolicies = [
        {
          isEnabled: true,
          type: {
            id: "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab",
            displayName: "Minimum number of reviewers",
          },
          settings: { scope: [{ repositoryId: "repo-1" }] },
        },
        {
          isEnabled: true,
          type: {
            id: "0609b952-1397-4640-95ec-e00a01b2c241",
            displayName: "Build validation",
          },
          settings: { scope: [{ repositoryId: "repo-1" }] },
        },
      ];

      const result = service.getRepoPolicies("repo-1", "my-repo", "refs/heads/main", allPolicies);

      expect(result.repoName).toBe("my-repo");
      expect(result.defaultBranch).toBe("main");
      expect(result.hasMinReviewers).toBe(true);
      expect(result.hasBuildValidation).toBe(true);
      expect(result.hasCommentResolution).toBe(false);
      expect(result.policyCount).toBe(2);
      expect(result.inheritedPolicyCount).toBe(0);
    });

    it("should include inherited project-level policies", () => {
      const allPolicies = [
        {
          isEnabled: true,
          type: {
            id: "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab",
            displayName: "Minimum number of reviewers",
          },
          settings: { scope: [{ repositoryId: null }] },
        },
        {
          isEnabled: true,
          type: {
            id: "0609b952-1397-4640-95ec-e00a01b2c241",
            displayName: "Build validation",
          },
          settings: { scope: [{ repositoryId: null }] },
        },
        {
          isEnabled: true,
          type: {
            id: "c6a1889d-b943-4856-b76f-9e46e181b22d",
            displayName: "Comment requirements",
          },
          settings: { scope: [{ repositoryId: null }] },
        },
      ];

      const result = service.getRepoPolicies("repo-1", "my-repo", "refs/heads/main", allPolicies);

      expect(result.hasMinReviewers).toBe(true);
      expect(result.hasBuildValidation).toBe(true);
      expect(result.hasCommentResolution).toBe(true);
      expect(result.policyCount).toBe(3);
      expect(result.inheritedPolicyCount).toBe(3);
    });

    it("should ignore policies scoped to other branches of the same repository", () => {
      const allPolicies = [
        {
          isEnabled: true,
          type: {
            id: "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab",
            displayName: "Minimum number of reviewers",
          },
          settings: {
            scope: [{ repositoryId: "repo-1", refName: "refs/heads/release", matchKind: "Exact" }],
          },
        },
        {
          isEnabled: true,
          type: { id: "0609b952-1397-4640-95ec-e00a01b2c241", displayName: "Build validation" },
          settings: {
            scope: [{ repositoryId: "repo-1", refName: "refs/heads/ma", matchKind: "Prefix" }],
          },
        },
        {
          isEnabled: true,
          type: { id: "c6a1889d-b943-4856-b76f-9e46e181b22d", displayName: "Comment requirements" },
          settings: { scope: [{ repositoryId: "other-repo" }] },
        },
      ];

      const result = service.getRepoPolicies("repo-1", "my-repo", "refs/heads/main", allPolicies);

      expect(result.hasMinReviewers).toBe(false);
      expect(result.hasBuildValidation).toBe(true);
      expect(result.hasCommentResolution).toBe(false);
      expect(result.policyCount).toBe(1);
    });

    it("should return all false when no policies found", () => {
      const result = service.getRepoPolicies("repo-1", "my-repo", "refs/heads/main", []);

      expect(result.hasMinReviewers).toBe(false);
      expect(result.hasBuildValidation).toBe(false);
      expect(result.hasCommentResolution).toBe(false);
      expect(result.policyCount).toBe(0);
      expect(result.inheritedPolicyCount).toBe(0);
    });
  });

  describe("scanAllRepos", () => {
    it("should aggregate results from multiple repos", async () => {
      const now = new Date();
      const staleDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      __setMockClient("GitRestClient", {
        getRefs: jest
          .fn()
          .mockResolvedValue([{ name: "refs/heads/stale-branch", objectId: "abc" }]),
        getCommits: jest.fn().mockResolvedValue([
          {
            commitId: "abc",
            author: { name: "Test", date: staleDate.toISOString() },
            committer: { date: staleDate.toISOString() },
          },
        ]),
        getItem: jest.fn().mockRejectedValue(new Error("Not found")),
        getItems: jest.fn().mockResolvedValue([]),
      });

      __setMockClient("PolicyRestClient", {
        getPolicyConfigurations: jest.fn().mockResolvedValue([]),
      });

      const repos = [
        { id: "r1", name: "repo-1", defaultBranch: "refs/heads/main" },
        { id: "r2", name: "repo-2", defaultBranch: "refs/heads/main" },
      ];

      const progress: string[] = [];
      const result = await service.scanAllRepos(
        "project-1",
        repos,
        { staleBranchThresholdDays: 30, abandonedRepoThresholdDays: 90, largeFileSizeMb: 10 },
        (phase) => progress.push(phase)
      );

      expect(result.staleBranches.length).toBeGreaterThanOrEqual(0);
      expect(result.policyAudit).toHaveLength(2);
      expect(result.repoReports).toHaveLength(2);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.totalStaleBranches).toBe("number");
      expect(typeof result.summary.unprotectedRepos).toBe("number");
      expect(typeof result.summary.abandonedRepos).toBe("number");
    });

    it("should detect abandoned repos", async () => {
      const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000); // 120 days ago

      __setMockClient("GitRestClient", {
        getRefs: jest.fn().mockResolvedValue([]),
        getCommits: jest.fn().mockResolvedValue([
          {
            commitId: "old",
            author: { name: "OldDev", date: oldDate.toISOString() },
            committer: { date: oldDate.toISOString() },
          },
        ]),
        getItem: jest.fn().mockResolvedValue({ path: ".gitignore" }),
        getItems: jest.fn().mockResolvedValue([]),
      });

      __setMockClient("PolicyRestClient", {
        getPolicyConfigurations: jest.fn().mockResolvedValue([]),
      });

      const repos = [{ id: "r1", name: "abandoned-repo", defaultBranch: "refs/heads/main" }];

      const result = await service.scanAllRepos(
        "project-1",
        repos,
        { staleBranchThresholdDays: 30, abandonedRepoThresholdDays: 90, largeFileSizeMb: 10 },
        () => {}
      );

      expect(result.repoReports).toHaveLength(1);
      expect(result.repoReports[0].isAbandoned).toBe(true);
      expect(result.repoReports[0].hasGitignore).toBe(true);
      expect(result.summary.abandonedRepos).toBe(1);
    });
  });

  describe("deleteBranch", () => {
    it("should send the scanned object id and the null object id", async () => {
      const updateRefs = jest.fn().mockResolvedValue([{ success: true }]);
      __setMockClient("GitRestClient", { updateRefs });

      await service.deleteBranch("repo-1", "feature-old", "abc123", "project-1");

      expect(updateRefs).toHaveBeenCalledWith(
        [
          {
            name: "refs/heads/feature-old",
            oldObjectId: "abc123",
            newObjectId: "0000000000000000000000000000000000000000",
          },
        ],
        "repo-1",
        "project-1"
      );
    });

    it("should throw when the server reports the ref update failed", async () => {
      __setMockClient("GitRestClient", {
        updateRefs: jest
          .fn()
          .mockResolvedValue([{ success: false, updateStatus: "oldObjectIdMismatch" }]),
      });

      await expect(
        service.deleteBranch("repo-1", "feature-old", "abc123", "project-1")
      ).rejects.toThrow(/oldObjectIdMismatch/);
    });
  });

  describe("scopeAppliesTo", () => {
    it("treats missing repositoryId and refName as project-wide", () => {
      expect(scopeAppliesTo({}, "r1", "refs/heads/main")).toBe(true);
      expect(scopeAppliesTo({ repositoryId: null }, "r1", "refs/heads/main")).toBe(true);
    });

    it("matches exact and prefix ref scopes", () => {
      expect(
        scopeAppliesTo({ refName: "refs/heads/main", matchKind: "Exact" }, "r1", "refs/heads/main")
      ).toBe(true);
      expect(
        scopeAppliesTo({ refName: "refs/heads/main", matchKind: "Exact" }, "r1", "refs/heads/dev")
      ).toBe(false);
      expect(
        scopeAppliesTo(
          { refName: "refs/heads/rel", matchKind: "prefix" },
          "r1",
          "refs/heads/release/1"
        )
      ).toBe(true);
    });

    it("rejects scopes for another repository", () => {
      expect(scopeAppliesTo({ repositoryId: "r2" }, "r1", "refs/heads/main")).toBe(false);
    });
  });
});
