import * as React from "react";
import { BranchPolicyStatus } from "../models/hygieneInterfaces";
import { StatusPill } from "./StatusPill";
import { Card, EmptyState } from "./ui";

interface PolicyAuditTableProps {
  policies: BranchPolicyStatus[];
}

export const PolicyAuditTable: React.FC<PolicyAuditTableProps> = ({ policies }) => {
  if (policies.length === 0) {
    return (
      <Card title="Branch Policy Audit">
        <EmptyState title="No policy data available." />
      </Card>
    );
  }

  return (
    <Card
      title="Branch Policy Audit"
      hint="Policies that apply to each repository's default branch"
      flush
    >
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th>Default Branch</th>
              <th className="ax-center">Min Reviewers</th>
              <th className="ax-center">Build Validation</th>
              <th className="ax-center">Comment Resolution</th>
              <th className="ax-num">Total Policies</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.repoId}>
                <td style={{ fontWeight: 600 }}>{policy.repoName}</td>
                <td className="ax-mono">{policy.defaultBranch}</td>
                <td className="ax-center">
                  <StatusPill ok={policy.hasMinReviewers} okLabel="Enabled" failLabel="Disabled" />
                </td>
                <td className="ax-center">
                  <StatusPill
                    ok={policy.hasBuildValidation}
                    okLabel="Enabled"
                    failLabel="Disabled"
                  />
                </td>
                <td className="ax-center">
                  <StatusPill
                    ok={policy.hasCommentResolution}
                    okLabel="Enabled"
                    failLabel="Disabled"
                  />
                </td>
                <td className="ax-num">
                  {policy.policyCount}
                  {policy.inheritedPolicyCount > 0 && (
                    <span
                      className="ax-fine"
                      style={{ marginLeft: 6 }}
                      title={`${policy.inheritedPolicyCount} inherited from project-level policies`}
                    >
                      ({policy.inheritedPolicyCount} inherited)
                    </span>
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
