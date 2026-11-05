const mockClients: Record<string, any> = {};

export const CommonServiceIds = {
  ProjectPageService: "ms.vss-tfs-web.tfs-page-data-service",
  ExtensionDataService: "ms.vss-features.extension-data-service",
};

export function getClient(clientClass: any): any {
  if (!clientClass) return {};
  const name = clientClass._mockName || clientClass.name || "unknown";
  if (!mockClients[name]) {
    mockClients[name] = {};
  }
  return mockClients[name];
}

export function __setMockClient(name: string, client: any): void {
  mockClients[name] = client;
}

export function __resetMockClients(): void {
  for (const key of Object.keys(mockClients)) {
    delete mockClients[key];
  }
}

// Add stub interfaces for Extension Data Service
export interface IExtensionDataService {
  getExtensionDataManager(extensionId: string, accessToken: string): Promise<IExtensionDataManager>;
}

export interface IExtensionDataManager {
  getDocument(collectionName: string, id: string): Promise<any>;
  setDocument(collectionName: string, doc: any): Promise<any>;
}

export interface IProjectPageService {
  getProject(): Promise<{ name: string; id: string } | undefined>;
}

// Git types needed for this extension
export class GitRestClient {
  static _mockName = "GitRestClient";
}

export enum PullRequestStatus {
  Active = 1,
  Completed = 3,
  Abandoned = 2,
}

export interface GitPullRequest {
  pullRequestId: number;
  title: string;
  status: number;
  createdBy: any;
  creationDate: string;
  closedDate: string;
  repository: any;
  reviewers: any[];
  autoCompleteSetBy: any;
  url: string;
}

export interface GitRepository {
  id: string;
  name: string;
  defaultBranch: string;
  project: any;
}

export interface GitRef {
  name: string;
  objectId: string;
}

export interface GitCommitRef {
  commitId: string;
  author: any;
  committer: any;
  comment: string;
}

// Policy types
export class PolicyRestClient {
  static _mockName = "PolicyRestClient";
}

export interface PolicyConfiguration {
  id: number;
  type: { id: string; displayName: string };
  settings: any;
  isEnabled: boolean;
}
