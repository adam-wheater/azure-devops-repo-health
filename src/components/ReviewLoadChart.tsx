import * as React from "react";
import { PrRecord } from "../models/interfaces";
import { Card, EmptyState } from "./ui";

interface ReviewLoadChartProps {
  prs: PrRecord[];
}

interface ReviewerLoad {
  id: string;
  name: string;
  count: number;
}

export const ReviewLoadChart: React.FC<ReviewLoadChartProps> = ({ prs }) => {
  const reviewerLoads = React.useMemo((): ReviewerLoad[] => {
    const countMap = new Map<string, ReviewerLoad>();

    for (const pr of prs) {
      for (const reviewer of pr.reviewers) {
        if (reviewer.id === pr.authorId) continue;
        const existing = countMap.get(reviewer.id);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(reviewer.id, { id: reviewer.id, name: reviewer.name, count: 1 });
        }
      }
    }

    return Array.from(countMap.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 15);
  }, [prs]);

  if (reviewerLoads.length === 0) {
    return (
      <Card title="Review Load Distribution">
        <EmptyState title="No reviewer data available." />
      </Card>
    );
  }

  const maxCount = Math.max(...reviewerLoads.map((r) => r.count), 1);

  return (
    <Card title="Review Load Distribution" hint="Top 15 reviewers by number of PR assignments">
      <div className="ax-stack" style={{ gap: 8 }}>
        {reviewerLoads.map((reviewer) => (
          <div key={reviewer.id} className="ax-row" style={{ flexWrap: "nowrap" }}>
            <div
              className="ax-truncate"
              style={{ width: 140, flex: "0 0 140px", fontSize: 13, textAlign: "right" }}
              title={reviewer.name}
            >
              {reviewer.name}
            </div>
            <div
              className="ax-bar"
              style={{ flex: 1 }}
              role="meter"
              aria-label={`${reviewer.name}: ${reviewer.count} reviews`}
              aria-valuemin={0}
              aria-valuemax={maxCount}
              aria-valuenow={reviewer.count}
            >
              <div
                className="ax-bar__fill"
                style={{ width: `${(reviewer.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="ax-mono ax-num" style={{ width: 32, textAlign: "right" }}>
              {reviewer.count}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
