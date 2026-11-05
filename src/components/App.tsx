import * as React from "react";
import { BRAND, BrandGlyph } from "../brand";
import { useHygieneScan } from "../hooks/useHygieneScan";
import { PrDashboard } from "./PrDashboard";
import { BranchHygiene } from "./BranchHygiene";
import { RepoHygieneTable } from "./RepoHygieneTable";
import { PolicyAuditTable } from "./PolicyAuditTable";
import {
  AppShell,
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBoundary,
  IconPlay,
  IconStop,
  Tabs,
} from "./ui";

type TopTabId = "pr-dashboard" | "hygiene";
type HygieneTabId = "stale-branches" | "repo-hygiene" | "policy-audit";

const TOP_TABS: { id: TopTabId; label: string }[] = [
  { id: "pr-dashboard", label: "PR Quality Dashboard" },
  { id: "hygiene", label: "Branch & Repo Hygiene" },
];

const HYGIENE_TABS: { id: HygieneTabId; label: string }[] = [
  { id: "stale-branches", label: "Stale Branches" },
  { id: "repo-hygiene", label: "Repository Hygiene" },
  { id: "policy-audit", label: "Branch Policy Audit" },
];

const AppInner: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<TopTabId>("pr-dashboard");
  const [hygieneTab, setHygieneTab] = React.useState<HygieneTabId>("stale-branches");
  const scan = useHygieneScan();

  const [confirmDialog, setConfirmDialog] = React.useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const handleDeleteBranch = React.useCallback(
    (branch: Parameters<typeof scan.handleDeleteBranch>[0]) => {
      const dialog = scan.handleDeleteBranch(branch);
      setConfirmDialog({
        ...dialog,
        onConfirm: async () => {
          setConfirmDialog(null);
          await dialog.onConfirm();
        },
      });
    },
    [scan.handleDeleteBranch]
  );

  const handleBulkDelete = React.useCallback(
    (branches: Parameters<typeof scan.handleBulkDelete>[0]) => {
      const dialog = scan.handleBulkDelete(branches);
      setConfirmDialog({
        ...dialog,
        onConfirm: async () => {
          setConfirmDialog(null);
          await dialog.onConfirm();
        },
      });
    },
    [scan.handleBulkDelete]
  );

  const isHygieneTab = activeTab === "hygiene";

  return (
    <AppShell title={BRAND.name} subtitle={BRAND.tagline} mark={<BrandGlyph />}>
      <ConfirmDialog
        isOpen={confirmDialog !== null}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

      <Tabs
        tabs={TOP_TABS}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TopTabId)}
        aria-label="Dashboards"
      />

      {/* The PR dashboard stays mounted so its scan results survive tab switches. */}
      <div style={{ display: activeTab === "pr-dashboard" ? "block" : "none" }}>
        <PrDashboard />
      </div>

      {isHygieneTab && (
        <div>
          <Tabs
            tabs={HYGIENE_TABS}
            active={hygieneTab}
            onChange={(id) => setHygieneTab(id as HygieneTabId)}
            aria-label="Hygiene reports"
          />

          {/* Shared scan toolbar for all hygiene tabs */}
          <div className="ax-toolbar">
            <Button
              variant="primary"
              icon={<IconPlay />}
              busy={scan.scanning}
              onClick={scan.handleScan}
              disabled={scan.scanning}
            >
              {scan.scanning ? "Scanning..." : "Scan Repositories"}
            </Button>
            {scan.scanning && (
              <Button icon={<IconStop />} onClick={scan.handleCancel}>
                Cancel
              </Button>
            )}
          </div>

          {scan.progress && (
            <div className="ax-section">
              <Banner tone="info">{scan.progress}</Banner>
            </div>
          )}

          {scan.error && (
            <div className="ax-section">
              <Banner tone="error" onDismiss={() => scan.setError(null)}>
                {scan.error}
              </Banner>
            </div>
          )}

          {!scan.result && !scan.scanning && !scan.error && (
            <EmptyState
              title={
                <>
                  Click <strong>Scan Repositories</strong> to audit branch and repository hygiene.
                </>
              }
            >
              The scan checks for stale branches, branch policies, .gitignore files, abandoned
              repos, and large files.
            </EmptyState>
          )}

          {hygieneTab === "stale-branches" && scan.result && (
            <BranchHygiene
              result={scan.result}
              onDeleteBranch={handleDeleteBranch}
              onBulkDelete={handleBulkDelete}
            />
          )}
          {hygieneTab === "repo-hygiene" && scan.result && (
            <RepoHygieneTable reports={scan.result.repoReports} />
          )}
          {hygieneTab === "policy-audit" && scan.result && (
            <PolicyAuditTable policies={scan.result.policyAudit} />
          )}
        </div>
      )}
    </AppShell>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <AppInner />
  </ErrorBoundary>
);
