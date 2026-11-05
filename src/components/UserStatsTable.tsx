import * as React from "react";
import { UserPrStats } from "../models/interfaces";
import { Card, EmptyState, Pill, SortHeader } from "./ui";

interface UserStatsTableProps {
  stats: UserPrStats[];
}

type SortField =
  | "displayName"
  | "prsAuthored"
  | "prsReviewed"
  | "avgTimeToFirstReviewHours"
  | "avgPrSizeLines"
  | "avgCommentsGiven"
  | "avgCommentsReceived";
type SortDir = "asc" | "desc";

export const UserStatsTable: React.FC<UserStatsTableProps> = ({ stats }) => {
  const [sortField, setSortField] = React.useState<SortField>("prsAuthored");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = React.useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "displayName":
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        default:
          cmp = (a[sortField] as number) - (b[sortField] as number);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [stats, sortField, sortDir]);

  if (stats.length === 0) {
    return (
      <Card title="Contributor Statistics">
        <EmptyState title="No user statistics available." />
      </Card>
    );
  }

  const header = (field: SortField, label: string, numeric = false) => (
    <SortHeader
      label={label}
      active={sortField === field}
      direction={sortDir}
      onClick={() => handleSort(field)}
      numeric={numeric}
    />
  );

  return (
    <Card
      title="Contributor Statistics"
      hint="Per-user activity across the scanned pull requests"
      flush
    >
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              {header("displayName", "Name")}
              {header("prsAuthored", "PRs Authored", true)}
              {header("prsReviewed", "PRs Reviewed", true)}
              {header("avgTimeToFirstReviewHours", "Avg First Review", true)}
              {header("avgPrSizeLines", "Avg PR Size", true)}
              {header("avgCommentsGiven", "Comments Given", true)}
              {header("avgCommentsReceived", "Comments Received", true)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((user) => (
              <tr key={user.userId}>
                <td style={{ fontWeight: 600 }}>{user.displayName}</td>
                <td className="ax-num">{user.prsAuthored}</td>
                <td className="ax-num">{user.prsReviewed}</td>
                <td className="ax-num">
                  {user.avgTimeToFirstReviewHours > 0 ? (
                    <Pill tone={user.avgTimeToFirstReviewHours > 24 ? "warn" : "success"}>
                      {user.avgTimeToFirstReviewHours}h
                    </Pill>
                  ) : (
                    <span className="ax-muted">-</span>
                  )}
                </td>
                <td className="ax-num">
                  {user.avgPrSizeLines > 0 ? (
                    `${user.avgPrSizeLines} files`
                  ) : (
                    <span className="ax-muted">-</span>
                  )}
                </td>
                <td className="ax-num">{user.avgCommentsGiven}</td>
                <td className="ax-num">{user.avgCommentsReceived}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
