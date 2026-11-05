import * as React from "react";
import { useTheme } from "../utils/theme";
import { Card, EmptyState } from "./ui";

interface PrFrequencyChartProps {
  data: { week: string; created: number; merged: number }[];
}

export const PrFrequencyChart: React.FC<PrFrequencyChartProps> = ({ data }) => {
  const theme = useTheme();
  const createdColor = theme.chart[0];
  const mergedColor = theme.chart[1];

  if (data.length === 0) {
    return (
      <Card title="Weekly PR Frequency">
        <EmptyState title="No frequency data available." />
      </Card>
    );
  }

  const maxVal = Math.max(...data.flatMap((d) => [d.created, d.merged]), 1);
  const chartHeight = 200;
  const barWidth = 24;
  const gap = 8;
  const groupWidth = barWidth * 2 + gap;
  const chartWidth = data.length * (groupWidth + 16) + 40;

  const swatch = (color: string) => (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 2,
        background: color,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );

  return (
    <Card title="Weekly PR Frequency" hint="Created vs merged pull requests over the last 12 weeks">
      <div className="ax-row ax-fine" style={{ marginBottom: 8 }}>
        <span>
          {swatch(createdColor)}
          Created
        </span>
        <span>
          {swatch(mergedColor)}
          Merged
        </span>
      </div>
      <div className="ax-table-wrap">
        <svg
          className="ax-chart"
          width={chartWidth}
          height={chartHeight + 50}
          viewBox={`0 0 ${chartWidth} ${chartHeight + 50}`}
          style={{ width: chartWidth, maxWidth: "none" }}
          role="img"
          aria-label="Weekly PR frequency bar chart"
        >
          <line className="ax-axis" x1={30} y1={0} x2={30} y2={chartHeight} />
          <line className="ax-axis" x1={30} y1={chartHeight} x2={chartWidth} y2={chartHeight} />

          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = chartHeight - fraction * chartHeight;
            const label = Math.round(maxVal * fraction);
            return (
              <g key={fraction}>
                <text x={26} y={y + 4} textAnchor="end" fontSize={10}>
                  {label}
                </text>
                <line
                  className="ax-grid"
                  x1={30}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  strokeDasharray="4,4"
                />
              </g>
            );
          })}

          {data.map((item, i) => {
            const x = 40 + i * (groupWidth + 16);
            const createdHeight = (item.created / maxVal) * chartHeight;
            const mergedHeight = (item.merged / maxVal) * chartHeight;

            return (
              <g key={item.week}>
                <rect
                  x={x}
                  y={chartHeight - createdHeight}
                  width={barWidth}
                  height={createdHeight}
                  fill={createdColor}
                  rx={2}
                >
                  <title>
                    Week of {item.week}: {item.created} created
                  </title>
                </rect>
                <rect
                  x={x + barWidth + gap}
                  y={chartHeight - mergedHeight}
                  width={barWidth}
                  height={mergedHeight}
                  fill={mergedColor}
                  rx={2}
                >
                  <title>
                    Week of {item.week}: {item.merged} merged
                  </title>
                </rect>
                <text
                  x={x + groupWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  fontSize={9}
                  transform={`rotate(45, ${x + groupWidth / 2}, ${chartHeight + 16})`}
                >
                  {item.week}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
};
