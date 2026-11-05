import * as React from "react";
import { RepoHygieneReport } from "../models/hygieneInterfaces";
import { StatusPill } from "./StatusPill";
import { Card, EmptyState } from "./ui";

interface RepoHygieneTableProps {
  reports: RepoHygieneReport[];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const RepoHygieneTable: React.FC<RepoHygieneTableProps> = ({ reports }) => {
  if (reports.length === 0) {
    return (
      <Card title="Repository Hygiene">
        <EmptyState title="No repository hygiene data available." />
      </Card>
    );
  }

  return (
    <Card
      title="Repository Hygiene"
      hint=".gitignore presence, default branch protection, activity and large files"
      flush
    >
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th className="ax-center">.gitignore</th>
              <th className="ax-center">Branch Protection</th>
              <th className="ax-center">Abandoned</th>
              <th>Last Commit</th>
              <th>Large Files</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.repoId}>
                <td style={{ fontWeight: 600 }}>{report.repoName}</td>
                <td className="ax-center">
                  <StatusPill ok={report.hasGitignore} okLabel="Good" failLabel="Issue" />
                </td>
                <td className="ax-center">
                  <StatusPill
                    ok={report.isDefaultBranchProtected}
                    okLabel="Good"
                    failLabel="Issue"
                  />
                </td>
                <td className="ax-center">
                  <StatusPill ok={!report.isAbandoned} okLabel="Good" failLabel="Issue" />
                </td>
                <td className="ax-muted">
                  {report.lastCommitDate ? report.lastCommitDate.toLocaleDateString() : "Never"}
                </td>
                <td>
                  {report.largeFiles.length > 0 ? (
                    <span className="ax-pill ax-pill--warn" style={{ whiteSpace: "normal" }}>
                      {report.largeFiles.length} file(s):{" "}
                      {report.largeFiles
                        .map((f) => `${f.path} (${formatFileSize(f.size)})`)
                        .join(", ")}
                    </span>
                  ) : (
                    <span className="ax-pill ax-pill--success">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
