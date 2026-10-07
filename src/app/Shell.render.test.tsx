/**
 * Renders the real shell + foundation page through react-dom/server.
 *
 * This exists to pin the two claims that matter in a foundation-only build: the
 * money string is exact, and a not-yet-built destination cannot be clicked. The
 * counts are derived from navigation.ts rather than typed in, so adding a nav row
 * that links to nothing fails a test instead of shipping a dead menu item.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";
import { Shell } from "@/app/Shell";
import { allNavItems } from "@/app/navigation";
import { FoundationStatusPage } from "@/pages/FoundationStatusPage";

function render(path = "/"): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Shell>
        <FoundationStatusPage />
      </Shell>
    </MemoryRouter>,
  );
}

describe("shell + foundation page render", () => {
  const html = render();

  it("renders brand identity from config", () => {
    expect(html).toContain(APP_NAME);
    expect(html).toContain(APP_TAGLINE);
  });

  it("renders the exact money proof and the deterministic split", () => {
    expect(html).toContain("₹1,23,45,678.90");
    expect(html).toContain("₹33.34 + ₹33.33 + ₹33.33");
  });

  it("renders disabled destinations as non-interactive rows", () => {
    const items = allNavItems();
    const live = items.filter((item) => item.available);
    expect(html).toContain("Not implemented");
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(
      items.length - live.length,
    );
    // One anchor per live row, and every one of them carries that row's path.
    expect((html.match(/<a /g) ?? []).length).toBe(live.length);
    for (const item of live) {
      expect(html).toContain(`href="${item.path}"`);
    }
  });

  it("names the hierarchy and the next prompt", () => {
    for (const term of ["Organization", "Property", "Outlet", "Department"]) {
      expect(html).toContain(term);
    }
    expect(html).toContain("Prompt #02");
  });
});
