import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "@/components/ui/Switch";
import { Checkbox } from "@/components/ui/Checkbox";

/**
 * The access screens select properties and outlets with these two controls, so the
 * switch must be a real `role="switch"` and the checkbox a native input — an
 * asserted-on element, not a styled div, or assistive tech cannot read the state.
 */
describe("Switch", () => {
  it("exposes role=switch with aria-checked reflecting state", () => {
    const on = renderToStaticMarkup(<Switch id="all" checked label="All properties" onChange={() => {}} />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('<label for="all"');
    expect(on).toContain('id="all"');

    const off = renderToStaticMarkup(<Switch id="all" checked={false} label="All properties" onChange={() => {}} />);
    expect(off).toContain('aria-checked="false"');
  });

  it("is not interactive when disabled", () => {
    const html = renderToStaticMarkup(<Switch checked label="Locked" disabled onChange={() => {}} />);
    expect(html).toContain("disabled");
  });
});

describe("Checkbox", () => {
  it("renders a native checkbox bound to its label", () => {
    const html = renderToStaticMarkup(
      <Checkbox id="prop-1" checked name="properties" value="prop-1" label="Sunset Resort" onChange={() => {}} />,
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('id="prop-1"');
    expect(html).toContain('<label for="prop-1"');
    expect(html).toContain('value="prop-1"');
    expect(html).toContain("checked");
    expect(html).toContain("Sunset Resort");
  });

  it("renders an unselected box without the checked attribute", () => {
    const html = renderToStaticMarkup(<Checkbox id="x" checked={false} label="Harbour Lodge" onChange={() => {}} />);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("checked");
  });
});
