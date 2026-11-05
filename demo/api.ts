// Sample data for the demo build: a fictional "Contoso" project with nine
// repositories, three months of pull requests, branches and branch policies.
// See demo/kit.ts for the helpers.
import { PullRequestStatus } from "azure-devops-extension-api/Git";
import { CommonServiceIds, clientFactory, delay, extensionDataService, projectPageService } from "./kit";

export { CommonServiceIds };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const daysAgo = (days: number) => iso(now - days * DAY);

// Small deterministic generator so every screenshot run shows the same data.
let seed = 23;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pickWeighted = <T>(items: [T, number][], skip?: T): T => {
  const pool = items.filter(([item]) => item !== skip);
  let roll = rand() * pool.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [item, weight] of pool) if ((roll -= weight) < 0) return item;
  return pool[pool.length - 1][0];
};
const sha = () => Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");

// --- People and repositories --------------------------------------------------

const person = (name: string, n: number) => ({
  displayName: name,
  id: `5e1b7c20-0000-4000-8000-00000000000${n}`,
});
const priya = person("Priya Shah", 1);
const tom = person("Tom Ellis", 2);
const maria = person("Maria Lopez", 3);
const sam = person("Sam Okafor", 4);
const chen = person("Chen Wei", 5);
const ruth = person("Ruth Adams", 6);
const authorWeights: [typeof priya, number][] = [[priya, 3], [tom, 4], [maria, 4], [sam, 3], [chen, 3], [ruth, 2]];
const reviewerWeights: [typeof priya, number][] = [[priya, 6], [tom, 4], [maria, 3], [sam, 3], [chen, 2], [ruth, 1]];

const repo = (n: number, name: string, defaultBranch = "refs/heads/main") => ({
  id: `c0ffee00-0000-4000-8000-00000000000${n}`,
  name,
  defaultBranch,
  project: { id: "6ce954b1-ce1f-45d1-b94d-e6bf2464ba2c", name: "Contoso" },
});
const billing = repo(1, "billing-api");
const portal = repo(2, "web-portal");
const payments = repo(3, "payments-worker");
const auth = repo(4, "auth-service");
const notifications = repo(5, "notifications-service");
const mobile = repo(6, "mobile-app");
const infra = repo(7, "infra-config");
const reporting = repo(8, "reporting-service", "refs/heads/master");
const docs = repo(9, "docs-site", "refs/heads/master");
const repos = [billing, portal, payments, auth, notifications, mobile, infra, reporting, docs];
const repoWeights: [typeof billing, number][] = [
  [billing, 5], [portal, 5], [payments, 4], [auth, 3], [notifications, 2], [mobile, 3], [infra, 2], [docs, 1],
];

const titles: Record<string, string[]> = {
  "billing-api": ["Round EUR totals half-even", "Add credit note endpoint", "Fix duplicate invoice numbers", "Paginate invoice list", "Validate VAT numbers on create", "Return 409 on repeated payment"],
  "web-portal": ["Remember last used filter", "Fix date picker locale", "Move settings to its own route", "Lazy load report charts", "Add empty state to project list", "Keyboard support for the nav menu"],
  "payments-worker": ["Batch settlements by currency", "Log gateway timeouts with context", "Drop unused queue binding", "Retry failed webhooks once", "Add dead letter alert", "Cap concurrent captures"],
  "auth-service": ["Rotate signing keys weekly", "Add partner SSO claims", "Fix token refresh race", "Tighten password reset expiry", "Return 429 after repeated failures"],
  "notifications-service": ["Template digest subject lines", "Add quiet hours", "Fix duplicate SMS on retry", "Unsubscribe link in footer"],
  "mobile-app": ["Show upload progress", "Fix crash on rotate", "Add profile photo cropper", "Cache the last dashboard", "Update onboarding copy"],
  "infra-config": ["Pin base image digests", "Add staging alert rules", "Tidy old pipeline variables", "Raise worker pool size"],
  "docs-site": ["Document webhook signatures", "Fix broken link in quick start", "Add rate limit table"],
};

// --- Pull requests ------------------------------------------------------------

type Person = typeof priya;
interface Spec {
  repo: typeof billing;
  title: string;
  author: Person;
  reviewers: Person[];
  createdMs: number;
  status: number;
  closedMs?: number;
  auto?: boolean;
  files: number;
  threads: number;
  firstReviewHours: number | null;
}

const filesChanged = () => {
  const r = rand();
  if (r < 0.6) return 1 + Math.floor(rand() * 8);
  if (r < 0.86) return 10 + Math.floor(rand() * 10);
  if (r < 0.97) return 20 + Math.floor(rand() * 30);
  return 50 + Math.floor(rand() * 40);
};
const mergeHours = () => {
  const r = rand();
  if (r < 0.55) return 1 + rand() * 8;
  if (r < 0.8) return 9 + rand() * 20;
  if (r < 0.93) return 30 + rand() * 40;
  return 70 + rand() * 90;
};
const reviewersFor = (author: Person) => {
  const count = rand() < 0.3 ? 1 : rand() < 0.7 ? 2 : 3;
  const chosen: Person[] = [];
  while (chosen.length < count) {
    const next = pickWeighted(reviewerWeights, author);
    if (!chosen.includes(next)) chosen.push(next);
  }
  return chosen;
};

const specs: Spec[] = [];

// Named open PRs: the stale ones the dashboard should call out.
const open = (r: typeof billing, title: string, author: Person, reviewers: Person[], ageDays: number, threads: number) =>
  specs.push({ repo: r, title, author, reviewers, createdMs: now - ageDays * DAY, status: PullRequestStatus.Active, files: filesChanged(), threads, firstReviewHours: threads ? 3 + rand() * 20 : null });
open(payments, "Add retry with backoff to ledger sync", tom, [priya, sam], 26, 4);
open(billing, "Refactor invoice rendering pipeline to support multi-currency totals and rounding", maria, [chen], 19, 2);
open(portal, "Replace legacy date picker with the shared component", sam, [], 16, 0);
open(infra, "Move build agents to Node 20 LTS", ruth, [tom], 12, 1);
open(auth, "Cache rate limit lookups", chen, [maria], 9, 3);
open(mobile, "Add push notification preferences screen", priya, [ruth, sam], 8, 2);

// Everything else, day by day for the last 88 days (weekdays only).
for (let ago = 88; ago >= 0; ago--) {
  const day = new Date(now - ago * DAY).getDay();
  if (day === 0 || day === 6) continue;
  const perDay = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < perDay; i++) {
    const r = pickWeighted(repoWeights);
    const author = pickWeighted(authorWeights);
    const createdMs = now - ago * DAY - Math.floor(rand() * 8) * HOUR - 2 * HOUR;
    const spec: Spec = {
      repo: r,
      title: titles[r.name][Math.floor(rand() * titles[r.name].length)],
      author,
      reviewers: reviewersFor(author),
      createdMs,
      status: PullRequestStatus.Completed,
      files: filesChanged(),
      threads: rand() < 0.15 ? 0 : 1 + Math.floor(rand() * rand() * 7),
      firstReviewHours: 0.3 + rand() * rand() * 20,
    };
    const ageHours = (now - createdMs) / HOUR;
    if (ago <= 5 && rand() < 0.45) {
      spec.status = PullRequestStatus.Active;
    } else if (rand() < 0.07) {
      spec.status = PullRequestStatus.Abandoned;
      spec.closedMs = createdMs + Math.min(ageHours - 1, 24 + rand() * 120) * HOUR;
    } else {
      spec.closedMs = createdMs + Math.min(ageHours - 1, mergeHours()) * HOUR;
      spec.auto = rand() < 0.45;
    }
    specs.push(spec);
  }
}

specs.sort((a, b) => a.createdMs - b.createdMs);

interface Pr {
  raw: any;
  threads: any[];
  files: number;
}
const prs: Pr[] = specs.map((s, index) => {
  const id = 1042 + index;
  const raw: any = {
    pullRequestId: id,
    title: s.title,
    status: s.status,
    createdBy: s.author,
    creationDate: iso(s.createdMs),
    closedDate: s.closedMs ? iso(s.closedMs) : undefined,
    repository: { id: s.repo.id, name: s.repo.name },
    reviewers: s.reviewers.map((r) => ({
      ...r,
      vote: s.status === PullRequestStatus.Completed ? 10 : s.status === PullRequestStatus.Active && s.threads > 1 ? 5 : 0,
    })),
    autoCompleteSetBy: s.auto ? { displayName: s.author.displayName } : null,
    completionQueueTime: s.auto && s.closedMs ? iso(s.closedMs - HOUR) : undefined,
    mergeStatus: 3,
    url: `https://dev.azure.com/contoso/Contoso/_git/${s.repo.name}/pullrequest/${id}`,
  };
  const threads: any[] = [];
  if (s.reviewers.length && s.threads) {
    const limit = s.closedMs ? s.closedMs - s.createdMs : now - s.createdMs;
    for (let t = 0; t < s.threads; t++) {
      const offset = Math.min(((s.firstReviewHours ?? 1) + t * 2.5) * HOUR, limit - HOUR);
      threads.push({
        isDeleted: false,
        publishedDate: iso(s.createdMs + Math.max(offset, 0.2 * HOUR)),
        comments: [{ author: { id: s.reviewers[t % s.reviewers.length].id } }],
      });
    }
  }
  return { raw, threads, files: s.files };
});
const prById = new Map(prs.map((p) => [p.raw.pullRequestId, p]));

// --- Branches, commits and files ------------------------------------------------

interface Branch {
  name: string;
  ageDays: number;
  author: string;
  objectId: string;
}
const branch = (name: string, ageDays: number, author: string): Branch => ({ name, ageDays, author, objectId: sha() });
const branches: Record<string, Branch[]> = {
  [billing.id]: [
    branch("main", 1, "Maria Lopez"), branch("develop", 12, "Tom Ellis"),
    branch("feature/csv-export-v2", 3, "Maria Lopez"), branch("bugfix/invoice-pdf-margin", 5, "Tom Ellis"),
    branch("feature/eur-rounding", 47, "Maria Lopez"), branch("spike/pdf-renderer", 112, "Tom Ellis"),
  ],
  [portal.id]: [
    branch("main", 0, "Sam Okafor"), branch("develop", 9, "Priya Shah"),
    branch("feature/dark-mode-reports", 2, "Priya Shah"), branch("feature/bulk-archive", 38, "Sam Okafor"),
    branch("release/2.3", 66, "Priya Shah"), branch("hotfix/session-timeout", 74, "Sam Okafor"),
    branch("experiment/new-nav", 203, "Ruth Adams"),
  ],
  [payments.id]: [
    branch("main", 1, "Tom Ellis"), branch("feature/webhook-retries", 4, "Chen Wei"),
    branch("feature/ledger-sync-backoff", 26, "Tom Ellis"), branch("feature/settlement-batching", 33, "Tom Ellis"),
  ],
  [auth.id]: [
    branch("main", 2, "Chen Wei"), branch("feature/partner-sso", 11, "Maria Lopez"),
    branch("bugfix/token-refresh", 52, "Chen Wei"),
  ],
  [notifications.id]: [
    branch("main", 3, "Priya Shah"), branch("feature/digest-email", 21, "Maria Lopez"),
    branch("feature/push-topics", 36, "Priya Shah"), branch("feature/sms-fallback", 89, "Maria Lopez"),
  ],
  [mobile.id]: [
    branch("main", 6, "Priya Shah"), branch("feature/profile-photos", 8, "Sam Okafor"),
    branch("feature/offline-mode", 128, "Chen Wei"),
  ],
  [infra.id]: [
    branch("main", 2, "Ruth Adams"), branch("feature/node-20", 12, "Ruth Adams"),
    branch("cleanup/old-pipelines", 58, "Ruth Adams"),
  ],
  [reporting.id]: [branch("master", 141, "Tom Ellis"), branch("feature/export-v2", 176, "Tom Ellis")],
  [docs.id]: [branch("master", 19, "Ruth Adams"), branch("update/getting-started", 6, "Ruth Adams")],
};
const commitOf = (b: Branch) => ({
  commitId: b.objectId,
  author: { name: b.author, date: daysAgo(b.ageDays) },
  committer: { name: b.author, date: daysAgo(b.ageDays) },
});

const MB = 1024 * 1024;
const rootItems = (extra: { path: string; size: number }[] = []) => [
  { path: "/", isFolder: true },
  { path: "/src", isFolder: true },
  { path: "/README.md", size: 3_400 },
  ...extra,
];
const items: Record<string, any[]> = {
  [mobile.id]: rootItems([{ path: "/promo-video.mp4", size: 31.4 * MB }, { path: "/splash-assets.zip", size: 18.2 * MB }]),
  [reporting.id]: rootItems([{ path: "/legacy-dump.sql", size: 24.6 * MB }]),
};
const noGitignore = new Set([docs.id]);

// --- Branch policies ----------------------------------------------------------

const MIN_REVIEWERS = { id: "fa4e907d-c16b-4a4c-9dfa-4916e5d171ab", displayName: "Minimum number of reviewers" };
const BUILD = { id: "0609b952-1397-4640-95ec-e00a01b2c241", displayName: "Build" };
const COMMENTS = { id: "c6a1889d-b943-4856-b76f-9e46e181b22d", displayName: "Comment requirements" };
const WORK_ITEMS = { id: "40e92b44-2fe1-4dd6-b3d8-74a9c21d0c6e", displayName: "Work item linking" };

const policy = (type: typeof BUILD, repositoryId: string | null, refName: string) => ({
  isEnabled: true,
  type,
  settings: { scope: [{ ...(repositoryId ? { repositoryId } : {}), refName, matchKind: "Exact" }] },
});
const on = (r: typeof billing, ...types: (typeof BUILD)[]) => types.map((t) => policy(t, r.id, r.defaultBranch));
const policies = [
  // Project-wide: every repository whose default branch is master inherits it.
  policy(MIN_REVIEWERS, null, "refs/heads/master"),
  ...on(billing, MIN_REVIEWERS, BUILD, COMMENTS),
  ...on(portal, MIN_REVIEWERS, BUILD, COMMENTS),
  ...on(payments, MIN_REVIEWERS, BUILD, COMMENTS, WORK_ITEMS),
  ...on(auth, MIN_REVIEWERS, BUILD, COMMENTS),
  ...on(notifications, MIN_REVIEWERS, COMMENTS),
  ...on(infra, MIN_REVIEWERS, BUILD),
  ...on(reporting, COMMENTS),
];

// --- Wiring ---------------------------------------------------------------------

const settings = extensionDataService({
  "repo-health-settings": {
    "pr-dashboard-settings": {
      stalePrThresholdDays: 7,
      prSizeWarningLines: 20,
      prSizeLargeLines: 50,
      timePeriodDays: 90,
      excludedRepoIds: [],
    },
  },
});

export const services: Record<string, unknown> = {
  [CommonServiceIds.ProjectPageService]: projectPageService("Contoso"),
  [CommonServiceIds.ExtensionDataService]: settings,
};

const notFound = () => Promise.reject({ status: 404, message: "Item not found" });
const branchesOf = (repoId: string) => branches[repoId] ?? [];

export const getClient = clientFactory({
  GitRestClient: {
    getRepositories: () => delay(repos, 250),
    getPullRequests: (repoId: string, criteria: { status: number }, _p: string, _m: unknown, skip = 0, top = 100) => {
      const matches = prs
        .filter((p) => p.raw.repository.id === repoId && p.raw.status === criteria.status)
        .map((p) => p.raw)
        .reverse();
      return delay(matches.slice(skip, skip + top), 20);
    },
    getThreads: (_repoId: string, prId: number) => delay(prById.get(prId)?.threads ?? [], 4),
    getPullRequestIterations: (_repoId: string, prId: number) =>
      delay([{ id: 1 }, ...(prId % 3 === 0 ? [{ id: 2 }] : [])], 4),
    getPullRequestIterationChanges: (_repoId: string, prId: number) =>
      delay({ changeEntries: Array.from({ length: prById.get(prId)?.files ?? 0 }, () => ({})) }, 4),
    getRefs: (repoId: string) =>
      delay(branchesOf(repoId).map((b) => ({ name: `refs/heads/${b.name}`, objectId: b.objectId })), 60),
    getCommits: (repoId: string, criteria: { itemVersion?: { version: string } }) => {
      const list = branchesOf(repoId);
      const found = criteria.itemVersion
        ? list.find((b) => b.name === criteria.itemVersion!.version)
        : [...list].sort((a, b) => a.ageDays - b.ageDays)[0];
      return delay(found ? [commitOf(found)] : [], 30);
    },
    getItem: (repoId: string) =>
      noGitignore.has(repoId) ? notFound() : delay({ path: "/.gitignore", size: 412 }, 30),
    getItems: (repoId: string) => delay(items[repoId] ?? rootItems(), 30),
    // Deleting is never triggered in the screenshots; refuse so the demo cannot change data.
    updateRefs: () => Promise.reject(new Error("The demo does not delete branches.")),
  },
  PolicyRestClient: {
    getPolicyConfigurations: () => delay(policies, 150),
  },
});
