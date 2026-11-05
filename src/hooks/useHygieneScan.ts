import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService, getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { formatError } from "../utils/formatError";
import { BranchHygieneService } from "../services/BranchHygieneService";
import { SettingsService } from "../services/SettingsService";
import {
  HygieneScanResult,
  HygieneSettings,
  DEFAULT_HYGIENE_SETTINGS,
  StaleBranch,
} from "../models/hygieneInterfaces";

const settingsService = new SettingsService();

const branchKey = (b: StaleBranch) => `${b.repoId}:${b.name}`;

async function getProjectName(): Promise<string> {
  const projectService = await SDK.getService<IProjectPageService>(
    CommonServiceIds.ProjectPageService
  );
  const project = await projectService.getProject();
  if (!project) throw new Error("Could not determine project.");
  return project.name;
}

export function useHygieneScan() {
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<HygieneScanResult | null>(null);
  const [settings, setSettings] = React.useState<HygieneSettings>({ ...DEFAULT_HYGIENE_SETTINGS });

  React.useEffect(() => {
    settingsService.getHygieneSettings().then(setSettings).catch(console.error);
  }, []);

  const abortRef = React.useRef<AbortController | null>(null);

  // Abort any in-flight scan when the owning component unmounts.
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleScan = React.useCallback(async () => {
    if (scanning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setScanning(true);
    setError(null);
    setProgress("Initializing...");

    try {
      const projectName = await getProjectName();

      setProgress("Fetching repositories...");
      const gitClient = getClient(GitRestClient);
      const repos = await (gitClient as any).getRepositories(projectName);
      if (!repos || repos.length === 0) throw new Error("No repositories found in this project.");

      const service = new BranchHygieneService();
      const scanResult = await service.scanAllRepos(
        projectName,
        repos,
        settings,
        (phase, current, total) => {
          if (!controller.signal.aborted) setProgress(`${phase} (${current}/${total})`);
        },
        controller.signal
      );

      if (!controller.signal.aborted) {
        setResult(scanResult);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(`Scan failed: ${formatError(err)}`);
      }
    } finally {
      if (!controller.signal.aborted) {
        setScanning(false);
        setProgress(null);
      }
    }
  }, [scanning, settings]);

  const handleCancel = React.useCallback(() => {
    abortRef.current?.abort();
    setScanning(false);
    setProgress(null);
  }, []);

  /** Remove the given branches from the result and recompute the stale count. */
  const removeBranches = React.useCallback((deleted: StaleBranch[]) => {
    if (deleted.length === 0) return;
    const deletedKeys = new Set(deleted.map(branchKey));
    setResult((prev) => {
      if (!prev) return prev;
      const remaining = prev.staleBranches.filter((b) => !deletedKeys.has(branchKey(b)));
      return {
        ...prev,
        staleBranches: remaining,
        summary: { ...prev.summary, totalStaleBranches: remaining.length },
      };
    });
  }, []);

  const handleDeleteBranch = React.useCallback(
    (branch: StaleBranch) => {
      return {
        title: "Delete Branch",
        message: `Are you sure you want to delete branch "${branch.name}" from repository "${branch.repoName}"? This action cannot be undone.`,
        onConfirm: async () => {
          try {
            const service = new BranchHygieneService();
            const projectName = await getProjectName();
            await service.deleteBranch(branch.repoId, branch.name, branch.objectId, projectName);
            removeBranches([branch]);
          } catch (err) {
            setError(`Failed to delete branch: ${formatError(err)}`);
          }
        },
      };
    },
    [removeBranches]
  );

  const handleBulkDelete = React.useCallback(
    (branches: StaleBranch[]) => {
      return {
        title: "Delete Branches",
        message: `Are you sure you want to delete ${branches.length} branch(es)? This action cannot be undone.`,
        onConfirm: async () => {
          let projectName: string;
          try {
            projectName = await getProjectName();
          } catch (err) {
            setError(`Failed to delete branches: ${formatError(err)}`);
            return;
          }

          // Delete one at a time and keep going on failure so the table only
          // drops the branches that were actually removed.
          const service = new BranchHygieneService();
          const deleted: StaleBranch[] = [];
          const failures: string[] = [];
          for (const branch of branches) {
            try {
              await service.deleteBranch(branch.repoId, branch.name, branch.objectId, projectName);
              deleted.push(branch);
            } catch (err) {
              failures.push(`${branch.repoName}/${branch.name}: ${formatError(err)}`);
            }
          }

          removeBranches(deleted);
          if (failures.length > 0) {
            setError(
              `Failed to delete ${failures.length} of ${branches.length} branch(es): ${failures.join("; ")}`
            );
          }
        },
      };
    },
    [removeBranches]
  );

  return {
    scanning,
    progress,
    error,
    result,
    settings,
    handleScan,
    handleCancel,
    handleDeleteBranch,
    handleBulkDelete,
    setError,
  };
}
