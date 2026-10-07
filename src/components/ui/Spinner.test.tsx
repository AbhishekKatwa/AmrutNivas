import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Spinner, Skeleton, LoadingBlock } from "@/components/ui/Spinner";

describe("Spinner / LoadingBlock", () => {
  it("announces a spinner as a live status", () => {
    const html = renderToStaticMarkup(<Spinner label="Fetching organizations" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Fetching organizations"');
    expect(html).toContain("animate-spin");
  });

  it("renders a labelled loading region once", () => {
    const html = renderToStaticMarkup(<LoadingBlock label="Loading properties…" />);
    expect((html.match(/role="status"/g) ?? []).length).toBe(1);
    expect(html).toContain("Loading properties…");
  });

  it("renders a skeleton region as one announced block with decorative bars", () => {
    const html = renderToStaticMarkup(<LoadingBlock rows={3} />);
    // One live region for the whole block, three decorative bars inside it.
    expect((html.match(/role="status"/g) ?? []).length).toBe(1);
    expect((html.match(/animate-pulse/g) ?? []).length).toBe(3);
    expect((html.match(/aria-hidden/g) ?? []).length).toBe(3);
  });

  it("keeps the skeleton itself aria-hidden", () => {
    expect(renderToStaticMarkup(<Skeleton className="h-4 w-16" />)).toContain("aria-hidden");
  });
});
