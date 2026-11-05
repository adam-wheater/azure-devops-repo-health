import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StalePrTable } from "@/components/StalePrTable";
import { PrRecord } from "@/models/interfaces";

function makeStalePr(overrides: Partial<PrRecord> = {}): PrRecord {
  return {
    id: 1,
    title: "Fix authentication bug",
    repoName: "backend-api",
    repoId: "r1",
    authorName: "Alice Johnson",
    authorId: "user-alice",
    createdDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    closedDate: null,
    status: "active",
    mergeStatus: "",
    reviewers: [{ name: "Bob Smith", id: "user-bob", vote: 0, reviewedDate: null }],
    commentCount: 2,
    filesChanged: 5,
    linesAdded: 120,
    linesDeleted: 30,
    firstReviewDate: null,
    lastActivityDate: null,
    autoCompleteSetBy: null,
    completionQueueTime: null,
    url: "https://dev.azure.com/org/project/_git/repo/pullrequest/1",
    ...overrides,
  };
}

describe("StalePrTable", () => {
  it("should render PR rows", () => {
    const prs = [
      makeStalePr({ id: 1, title: "Fix auth bug" }),
      makeStalePr({ id: 2, title: "Update dependencies", repoName: "frontend" }),
    ];

    render(<StalePrTable prs={prs} />);

    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    expect(screen.getByText("Update dependencies")).toBeInTheDocument();
    expect(screen.getByText("backend-api")).toBeInTheDocument();
    expect(screen.getByText("frontend")).toBeInTheDocument();
  });

  it("should show empty message when no PRs", () => {
    render(<StalePrTable prs={[]} />);
    expect(screen.getByText("No stale pull requests found.")).toBeInTheDocument();
  });

  it("should render clickable PR title links", () => {
    const prs = [makeStalePr({ id: 1, title: "My PR Title" })];
    render(<StalePrTable prs={prs} />);

    const link = screen.getByText("My PR Title");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute(
      "href",
      "https://dev.azure.com/org/project/_git/repo/pullrequest/1"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("should sort by age when clicking age header", () => {
    const now = Date.now();
    const prs = [
      makeStalePr({
        id: 1,
        title: "Old PR",
        createdDate: new Date(now - 30 * 24 * 60 * 60 * 1000),
      }),
      makeStalePr({
        id: 2,
        title: "Newer PR",
        createdDate: new Date(now - 10 * 24 * 60 * 60 * 1000),
      }),
    ];

    render(<StalePrTable prs={prs} />);

    // Default sort is by age descending
    const rows = screen.getAllByRole("row");
    // row 0 is header, row 1 should be Old PR (30 days)
    expect(rows[1]).toHaveTextContent("Old PR");

    // Click age header to toggle to ascending
    const ageHeader = screen.getByText(/Age/);
    fireEvent.click(ageHeader);

    const rowsAfterSort = screen.getAllByRole("row");
    expect(rowsAfterSort[1]).toHaveTextContent("Newer PR");
  });

  it("should display reviewer names", () => {
    const prs = [
      makeStalePr({
        id: 1,
        reviewers: [
          { name: "Bob Smith", id: "user-bob", vote: 10, reviewedDate: new Date() },
          { name: "Carol Lee", id: "user-carol", vote: 0, reviewedDate: null },
        ],
      }),
    ];

    render(<StalePrTable prs={prs} />);
    expect(screen.getByText("Bob Smith, Carol Lee")).toBeInTheDocument();
  });

  it("should display stale PR count in heading", () => {
    const prs = [makeStalePr({ id: 1 }), makeStalePr({ id: 2 }), makeStalePr({ id: 3 })];

    render(<StalePrTable prs={prs} />);
    expect(screen.getByText("Stale Pull Requests (3)")).toBeInTheDocument();
  });
});
