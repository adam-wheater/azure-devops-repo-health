import * as React from "react";
import { IconCheck, IconX } from "./ui";

/**
 * Compact pass/fail indicator used by the hygiene and policy audit tables.
 * State is conveyed by icon + visually hidden text, never by colour alone.
 */
export const StatusPill: React.FC<{ ok: boolean; okLabel: string; failLabel: string }> = ({
  ok,
  okLabel,
  failLabel,
}) => {
  const label = ok ? okLabel : failLabel;
  return (
    <span className={`ax-pill ${ok ? "ax-pill--success" : "ax-pill--danger"}`} title={label}>
      {ok ? <IconCheck size={12} /> : <IconX size={12} />}
      <span className="ax-sr-only">{label}</span>
    </span>
  );
};
