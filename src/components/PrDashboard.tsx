import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService, getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { formatError } from "../utils/formatError";
import { PrDataService } from "../services/PrDataService";
import { SettingsService } from "../services/SettingsService";
import { PrDashboardData, RepoHealthSettings, DEFAULT_SETTINGS } from "../models/interfaces";
import { SummaryBar } from "./SummaryBar";
import { StalePrTable } from "./StalePrTable";
import { UserStatsTable } from "./UserStatsTable";
import { PrFrequencyChart } from "./PrFrequencyChart";
import { PrSizeAnalysis } from "./PrSizeAnalysis";
import { ReviewLoadChart } from "./ReviewLoadChart";
import { SettingsPanel } from "./SettingsPanel";
import { Banner, Button, Card, EmptyState, IconPlay, IconSettings, IconStop, Metric } from "./ui";

const settingsService = new SettingsService();

const AutoCompleteTracking: React.FC<{ data: PrDashboardData }> = ({ data }) => {
  const completed = data.prRecords.filter((pr) => pr.status === "completed");
  const autoCompleted = completed.filter((pr) => pr.autoCompleteSetBy || pr.completionQueueTime);
  const pct =
    completed.length > 0 ? ((autoCompleted.length / completed.length) * 100).toFixed(1) : "0";
  return (
    <Card title="Auto-Complete Tracking" hint="How completed pull requests were merged">
      <div className="ax-metrics" style={{ marginBottom: 0 }}>
        <Metric label="Auto-Complete" value={autoCompleted.length} tone="accent" />
        <Metric label="Manual Merge" value={completed.length - autoCompleted.length} />
        <Metric label="Auto-Complete %" value={`${pct}%`} tone="success" />
      </div>
    </Card>
  );
};

export const PrDashboard: React.FC = () => {
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<PrDashboardData | null>(null);
  const [settings, setSettings] = React.useState<RepoHealthSettings>({ ...DEFAULT_SETTINGS });
  const [showSettings, setShowSettings] = React.useState(false);
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    settingsService
      .getSettings()
      .then(setSettings)
      .catch(console.error)
      .finally(() => setSettingsLoaded(true));
    // Abort any in-flight scan if the dashboard unmounts.
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
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService
      );
      const project = await projectService.getProject();
      if (!project) throw new Error("Could not determine the current project.");

      setProgress("Fetching repositories...");
      const gitClient = getClient(GitRestClient);
      const repos = await (gitClient as any).getRepositories(project.name);
      if (!repos || repos.length === 0) throw new Error("No repositories found in this project.");

      setProgress(`Scanning PRs across ${repos.length} repositories...`);

      const service = new PrDataService();
      const dashboard = await service.buildDashboard(
        project.name,
        repos,
        settings,
        controller.signal
      );

      if (!controller.signal.aborted) {
        setData(dashboard);
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

  const handleSaveSettings = React.useCallback((newSettings: RepoHealthSettings) => {
    setSettings(newSettings);
    settingsService.saveSettings(newSettings).catch(console.error);
  }, []);

  return (
    <div>
      <div className="ax-toolbar">
        <Button
          variant="primary"
          icon={<IconPlay />}
          busy={scanning}
          onClick={handleScan}
          disabled={scanning || !settingsLoaded}
        >
          {scanning ? "Scanning..." : "Scan PRs"}
        </Button>
        {scanning && (
          <Button icon={<IconStop />} onClick={handleCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<IconSettings />}
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
        >
          {showSettings ? "Hide Settings" : "Settings"}
        </Button>
      </div>

      {progress && (
        <div className="ax-section">
          <Banner tone="info">{progress}</Banner>
        </div>
      )}

      {error && (
        <div className="ax-section">
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        </div>
      )}

      {showSettings && <SettingsPanel settings={settings} onSave={handleSaveSettings} />}

      {data && (
        <>
          <SummaryBar summary={data.summary} />
          <StalePrTable prs={data.stalePrs} />

          <div className="ax-grid-2 ax-section">
            <PrFrequencyChart data={data.weeklyFrequency} />
            <ReviewLoadChart prs={data.prRecords} />
          </div>

          <PrSizeAnalysis
            prs={data.prRecords}
            warningThreshold={settings.prSizeWarningLines}
            largeThreshold={settings.prSizeLargeLines}
          />

          <UserStatsTable stats={data.userStats} />

          <AutoCompleteTracking data={data} />
        </>
      )}

      {!data && !scanning && !error && (
        <EmptyState
          title={
            <>
              Click <strong>Scan PRs</strong> to analyze pull request quality across your
              repositories.
            </>
          }
        >
          The dashboard shows PR trends, stale PRs, reviewer load, and contributor statistics.
        </EmptyState>
      )}
    </div>
  );
};
