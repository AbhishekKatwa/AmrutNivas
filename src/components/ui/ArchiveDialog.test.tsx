import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveDialog, archiveActionState } from "@/components/ui/ArchiveDialog";

/**
 * The archive gate is the one real decision rule in this set: a reason is mandatory
 * before a record can be retired, because every database door takes a `p_reason`.
 * The rule lives in a pure function so it can be asserted in both directions — the
 * positive case included, not just that the gate can refuse.
 */
describe("archiveActionState", () => {
  it("enables the action when a real reason and a name are present", () => {
    const state = archiveActionState("Closed for renovation", "Sunset Resort");
    expect(state.canConfirm).toBe(true);
    expect(state.normalizedReason).toBe("Closed for renovation");
  });

  it("trims the reason before deciding and normalizing", () => {
    const state = archiveActionState("   reactivate in Q3   ", "Harbour Lodge");
    expect(state.canConfirm).toBe(true);
    expect(state.normalizedReason).toBe("reactivate in Q3");
  });

  it("refuses an empty reason and normalizes it to 'not provided'", () => {
    expect(archiveActionState("", "Sunset Resort").canConfirm).toBe(false);
    expect(archiveActionState("", "Sunset Resort").normalizedReason).toBe("not provided");
  });

  it("refuses a whitespace-only reason", () => {
    const state = archiveActionState("   \t  ", "Sunset Resort");
    expect(state.canConfirm).toBe(false);
    expect(state.normalizedReason).toBe("not provided");
  });

  it("refuses when the entity name is missing, even with a reason", () => {
    expect(archiveActionState("some reason", "").canConfirm).toBe(false);
    expect(archiveActionState("some reason", "   ").canConfirm).toBe(false);
    expect(archiveActionState("some reason", undefined).canConfirm).toBe(false);
  });

  it("tolerates an undefined reason without throwing", () => {
    expect(archiveActionState(undefined, "Sunset Resort").canConfirm).toBe(false);
  });
});

describe("ArchiveDialog markup", () => {
  it("opens with the confirm disabled until a reason is written, and never says delete", () => {
    const html = renderToStaticMarkup(
      <ArchiveDialog open onClose={() => {}} onConfirm={() => {}} entityName="Sunset Resort" entityLabel="property" />,
    );
    // The archive button is disabled because the reason starts empty.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Archive property/);
    expect(html).toContain("Reason for archiving");
    expect(html).toContain("<textarea");
    expect(html).toContain("Sunset Resort");
    // Plain-language consequences are shown.
    expect(html).toContain("Its records and history are preserved");
    // The confirmation reassures it is not destructive, and never says "delete".
    expect(html).toContain("does not remove its data");
    expect(html.toLowerCase()).not.toContain("delete");
  });

  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      <ArchiveDialog open={false} onClose={() => {}} onConfirm={() => {}} entityName="Sunset Resort" />,
    );
    expect(html).toBe("");
  });
});
