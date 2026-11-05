import * as React from "react";
import { HygieneScanResult, StaleBranch } from "../models/hygieneInterfaces";
import { StaleBranchTable } from "./StaleBranchTable";
import { Metric } from "./ui";

interface BranchHygieneProps {
  result: HygieneScanResult;
  onDeleteBranch: (branch: StaleBranch) => void;
  onBulkDelete: (branches: StaleBranch[]) => void;
}

export const BranchHygiene: React.FC<BranchHygieneProps> = ({
  result,
  onDeleteBranch,
  onBulkDelete,
}) => {
  const { summary } = result;
  return (
    <div>
      <div className="ax-metrics">
        <Metric
          label="Stale Branches"
          value={summary.totalStaleBranches}
          tone={summary.totalStaleBranches > 0 ? "warn" : "success"}
        />
        <Metric
          label="Unprotected Repos"
          value={summary.unprotectedRepos}
          tone={summary.unprotectedRepos > 0 ? "danger" : "success"}
        />
        <Metric
          label="Abandoned Repos"
          value={summary.abandonedRepos}
          tone={summary.abandonedRepos > 0 ? "warn" : "success"}
        />
        <Metric
          label="Large Files"
          value={summary.largeFileCount}
          tone={summary.largeFileCount > 0 ? "warn" : "success"}
        />
      </div>

      <StaleBranchTable
        branches={result.staleBranches}
        onDelete={onDeleteBranch}
        onBulkDelete={onBulkDelete}
      />
    </div>
  );
};
