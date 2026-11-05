import * as React from "react";
import { PrStats } from "../models/interfaces";
import { Metric } from "./ui";

interface SummaryBarProps {
  summary: PrStats;
}

type MetricTone = "neutral" | "accent" | "info" | "success" | "warn" | "danger";

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

export const SummaryBar: React.FC<SummaryBarProps> = ({ summary }) => {
  const cards: { label: string; value: string; tone: MetricTone }[] = [
    { label: "Open PRs", value: String(summary.totalOpen), tone: "accent" },
    { label: "Merged", value: String(summary.totalMerged), tone: "success" },
    { label: "Abandoned", value: String(summary.totalAbandoned), tone: "warn" },
    {
      label: "Avg Merge Time",
      value: formatHours(summary.avgTimeToMergeHours),
      tone: summary.avgTimeToMergeHours > 48 ? "danger" : "success",
    },
    {
      label: "Avg Review Turnaround",
      value: formatHours(summary.avgReviewTurnaroundHours),
      tone: summary.avgReviewTurnaroundHours > 24 ? "warn" : "success",
    },
    {
      label: "Avg PR Size",
      value: `${Math.round(summary.avgPrSizeLines)} files`,
      tone: summary.avgPrSizeLines > 20 ? "warn" : "success",
    },
  ];

  return (
    <div className="ax-metrics">
      {cards.map((card) => (
        <Metric key={card.label} label={card.label} value={card.value} tone={card.tone} />
      ))}
    </div>
  );
};
