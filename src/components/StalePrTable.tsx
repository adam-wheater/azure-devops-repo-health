import * as React from "react";
import { PrRecord } from "../models/interfaces";
import { Card, EmptyState, Pill, SortHeader } from "./ui";

interface StalePrTableProps {
  prs: PrRecord[];
}

type SortField = "title" | "repoName" | "authorName" | "age" | "reviewers";
type SortDir = "asc" | "desc";

function getAgeDays(pr: PrRecord): number {
  return Math.floor((Date.now() - pr.createdDate.getTime()) / (1000 * 60 * 60 * 24));
}

export const StalePrTable: React.FC<StalePrTableProps> = ({ prs }) => {
  const [sortField, setSortField] = React.useState<SortField>("age");
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
    const copy = [...prs];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "repoName":
          cmp = a.repoName.localeCompare(b.repoName);
          break;
        case "authorName":
          cmp = a.authorName.localeCompare(b.authorName);
          break;
        case "age":
          cmp = getAgeDays(a) - getAgeDays(b);
          break;
        case "reviewers":
          cmp = a.reviewers.length - b.reviewers.length;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [prs, sortField, sortDir]);

  if (prs.length === 0) {
    return (
      <Card title="Stale Pull Requests (0)">
        <EmptyState title="No stale pull requests found." />
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
      title={`Stale Pull Requests (${prs.length})`}
      hint="Active pull requests open longer than the configured threshold"
      flush
    >
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              {header("title", "PR Title")}
              {header("repoName", "Repository")}
              {header("authorName", "Author")}
              {header("age", "Age (days)", true)}
              {header("reviewers", "Reviewers")}
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pr) => {
              const ageDays = getAgeDays(pr);
              return (
                <tr key={`${pr.repoId}:${pr.id}`}>
                  <td>
                    <a
                      className="ax-link"
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={pr.title}
                    >
                      {pr.title.length > 60 ? pr.title.substring(0, 57) + "..." : pr.title}
                    </a>
                  </td>
                  <td>{pr.repoName}</td>
                  <td>{pr.authorName}</td>
                  <td className="ax-num">
                    <Pill tone={ageDays > 14 ? "danger" : "warn"}>{ageDays}d</Pill>
                  </td>
                  <td>
                    {pr.reviewers.length > 0 ? pr.reviewers.map((r) => r.name).join(", ") : "None"}
                  </td>
                  <td className="ax-muted">
                    {pr.lastActivityDate ? pr.lastActivityDate.toLocaleDateString() : "No activity"}
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
