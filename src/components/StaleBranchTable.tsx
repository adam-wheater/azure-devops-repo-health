import * as React from "react";
import { StaleBranch } from "../models/hygieneInterfaces";
import { Button, Card, EmptyState, IconTrash, Pill } from "./ui";

interface StaleBranchTableProps {
  branches: StaleBranch[];
  onDelete: (branch: StaleBranch) => void;
  onBulkDelete: (branches: StaleBranch[]) => void;
}

const branchKey = (b: StaleBranch) => `${b.repoId}:${b.name}`;

export const StaleBranchTable: React.FC<StaleBranchTableProps> = ({
  branches,
  onDelete,
  onBulkDelete,
}) => {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const handleToggle = (branch: StaleBranch) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = branchKey(branch);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(branches.map(branchKey)));
    } else {
      setSelected(new Set());
    }
  };

  // Only count selections that still exist: branches deleted since the
  // selection was made must not inflate the "Delete Selected (N)" count.
  const selectedBranches = branches.filter((b) => selected.has(branchKey(b)));

  const handleBulkDelete = () => {
    if (selectedBranches.length > 0) {
      onBulkDelete(selectedBranches);
      setSelected(new Set());
    }
  };

  if (branches.length === 0) {
    return (
      <Card title="Stale Branches (0)">
        <EmptyState title="No stale branches found." />
      </Card>
    );
  }

  const allSelected = selectedBranches.length === branches.length;
  const someSelected = !allSelected && selectedBranches.length > 0;

  return (
    <Card
      title={`Stale Branches (${branches.length})`}
      hint="Branches with no commits beyond the configured threshold"
      flush
      actions={
        selectedBranches.length > 0 && (
          <Button variant="danger" size="sm" icon={<IconTrash />} onClick={handleBulkDelete}>
            Delete Selected ({selectedBranches.length})
          </Button>
        )
      }
    >
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th>
                <label className="ax-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="Select all branches"
                  />
                </label>
              </th>
              <th>Branch</th>
              <th>Repository</th>
              <th>Last Author</th>
              <th>Last Commit</th>
              <th className="ax-num">Age (days)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => {
              const key = branchKey(branch);
              return (
                <tr key={key}>
                  <td>
                    <label className="ax-check">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => handleToggle(branch)}
                        aria-label={`Select ${branch.name}`}
                      />
                    </label>
                  </td>
                  <td className="ax-mono" style={{ fontWeight: 600 }}>
                    {branch.name}
                  </td>
                  <td>{branch.repoName}</td>
                  <td>{branch.lastAuthor}</td>
                  <td className="ax-muted">{branch.lastCommitDate.toLocaleDateString()}</td>
                  <td className="ax-num">
                    <Pill tone={branch.ageDays > 60 ? "danger" : "warn"}>{branch.ageDays}d</Pill>
                  </td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<IconTrash size={12} />}
                      onClick={() => onDelete(branch)}
                      aria-label={`Delete ${branch.name}`}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
