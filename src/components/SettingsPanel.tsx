import * as React from "react";
import { RepoHealthSettings, DEFAULT_SETTINGS } from "../models/interfaces";
import { Button, Card, Pill } from "./ui";

interface SettingsPanelProps {
  settings: RepoHealthSettings;
  onSave: (settings: RepoHealthSettings) => void;
}

type NumericSetting = Exclude<keyof RepoHealthSettings, "excludedRepoIds">;

const FIELDS: { key: NumericSetting; label: string; help: string }[] = [
  {
    key: "stalePrThresholdDays",
    label: "Stale PR threshold (days)",
    help: "Active pull requests older than this are flagged as stale.",
  },
  {
    key: "prSizeWarningLines",
    label: "PR size warning threshold (files)",
    help: "Pull requests touching at least this many files enter the Warning bucket.",
  },
  {
    key: "prSizeLargeLines",
    label: "PR size large threshold (files)",
    help: "Pull requests touching at least this many files enter the Large bucket.",
  },
  {
    key: "timePeriodDays",
    label: "Time period (days)",
    help: "How far back completed and abandoned pull requests are fetched.",
  },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSave }) => {
  const [local, setLocal] = React.useState<RepoHealthSettings>({ ...settings });
  const [saved, setSaved] = React.useState(false);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings load asynchronously; pick them up if they arrive after the panel opened.
  React.useEffect(() => {
    setLocal({ ...settings });
  }, [settings]);

  React.useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const handleChange = (field: NumericSetting, raw: string) => {
    const parsed = parseInt(raw, 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS[field];
    setLocal((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SETTINGS });
    setSaved(false);
  };

  return (
    <Card title="Dashboard Settings" hint="Thresholds persist across sessions for this project">
      <div className="ax-form-grid">
        {FIELDS.map((field) => {
          const id = `setting-${field.key}`;
          return (
            <div key={field.key} className="ax-field">
              <label className="ax-label" htmlFor={id}>
                {field.label}
              </label>
              <input
                id={id}
                className="ax-input ax-input--num"
                type="number"
                min={1}
                value={local[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                aria-describedby={`${id}-help`}
              />
              <span id={`${id}-help`} className="ax-help">
                {field.help}
              </span>
            </div>
          );
        })}
      </div>

      <div className="ax-row" style={{ marginTop: 8 }}>
        <Button variant="primary" onClick={handleSave}>
          Save
        </Button>
        <Button onClick={handleReset}>Reset to Defaults</Button>
        {saved && (
          <Pill tone="success">
            <span role="status">Settings saved!</span>
          </Pill>
        )}
      </div>
    </Card>
  );
};
