import * as React from "react";
import { PrRecord } from "../models/interfaces";
import { Card } from "./ui";

interface PrSizeAnalysisProps {
  prs: PrRecord[];
  warningThreshold: number;
  largeThreshold: number;
}

type BucketTone = "success" | "accent" | "warn" | "danger";

interface SizeBucket {
  label: string;
  count: number;
  tone: BucketTone;
  prs: PrRecord[];
}

const BAR_CLASS: Record<BucketTone, string> = {
  success: "ax-bar__fill ax-bar__fill--success",
  accent: "ax-bar__fill",
  warn: "ax-bar__fill ax-bar__fill--warn",
  danger: "ax-bar__fill ax-bar__fill--danger",
};

export const PrSizeAnalysis: React.FC<PrSizeAnalysisProps> = ({
  prs,
  warningThreshold,
  largeThreshold,
}) => {
  const buckets = React.useMemo((): SizeBucket[] => {
    const small: PrRecord[] = [];
    const medium: PrRecord[] = [];
    const warning: PrRecord[] = [];
    const large: PrRecord[] = [];

    const mediumThreshold = Math.max(5, Math.floor(warningThreshold / 2));

    for (const pr of prs) {
      const size = pr.filesChanged;
      if (size >= largeThreshold) large.push(pr);
      else if (size >= warningThreshold) warning.push(pr);
      else if (size >= mediumThreshold) medium.push(pr);
      else small.push(pr);
    }

    return [
      {
        label: `Small (<${mediumThreshold} files)`,
        count: small.length,
        tone: "success",
        prs: small,
      },
      {
        label: `Medium (${mediumThreshold}-${warningThreshold})`,
        count: medium.length,
        tone: "accent",
        prs: medium,
      },
      {
        label: `Warning (${warningThreshold}-${largeThreshold})`,
        count: warning.length,
        tone: "warn",
        prs: warning,
      },
      { label: `Large (${largeThreshold}+)`, count: large.length, tone: "danger", prs: large },
    ];
  }, [prs, warningThreshold, largeThreshold]);

  const total = prs.length || 1;

  return (
    <Card title="PR Size Distribution" hint="Pull requests grouped by number of files changed">
      <div className="ax-metrics" style={{ marginBottom: 0 }}>
        {buckets.map((bucket) => {
          const pct = (bucket.count / total) * 100;
          return (
            <div key={bucket.label} className={`ax-metric ax-metric--${bucket.tone}`}>
              <div className="ax-metric__label">{bucket.label}</div>
              <div className="ax-metric__value">{bucket.count}</div>
              <div className="ax-metric__hint">{Math.round(pct)}% of PRs</div>
              <div className="ax-bar" style={{ marginTop: 10 }} aria-hidden="true">
                <div className={BAR_CLASS[bucket.tone]} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
