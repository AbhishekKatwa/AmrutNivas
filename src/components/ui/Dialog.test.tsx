import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

/**
 * Only the rendered markup is exercised here — the suite has no DOM to fire a
 * keyboard event or run the scroll-lock effect. What is asserted is the accessible
 * contract the effects depend on: the dialog role, modal flag and title linkage.
 * Escape-to-close, click-outside and body-scroll lock are NOT_TESTED.
 */
describe("Dialog", () => {
  it("is a labelled modal when open", () => {
    const html = renderToStaticMarkup(
      <Dialog
        open
        onClose={() => {}}
        title="Archive property"
        description="This cannot be undone lightly."
        footer={<Button>Confirm</Button>}
      >
        <p>Body content</p>
      </Dialog>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    // aria-labelledby points at the element that actually holds the title.
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeDefined();
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toContain("Archive property");
    expect(html).toContain("Body content");
    expect(html).toContain("Confirm");
    expect(html).toContain('aria-label="Close"');
  });

  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<Dialog open={false} onClose={() => {}} title="Gone">x</Dialog>)).toBe("");
  });

  it("maps size and side to layout classes", () => {
    const wide = renderToStaticMarkup(
      <Dialog open onClose={() => {}} title="Wide" size="xl">
        x
      </Dialog>,
    );
    expect(wide).toContain("sm:max-w-4xl");

    const drawer = renderToStaticMarkup(
      <Dialog open side="right" onClose={() => {}} title="Side panel">
        x
      </Dialog>,
    );
    expect(drawer).toContain("sm:w-[28rem]");
  });

  it("hides the dismiss affordance when not dismissible", () => {
    const html = renderToStaticMarkup(
      <Dialog open dismissible={false} onClose={() => {}} title="Must answer">
        x
      </Dialog>,
    );
    expect(html).not.toContain('aria-label="Close"');
  });
});
