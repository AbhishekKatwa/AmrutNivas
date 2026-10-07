import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PROPERTY_TYPES, PROPERTY_ACCESS_MODES, SITE_STATUSES } from "@/domain/identity/types";
import { SelectInput } from "@/components/ui/SelectInput";
import { Field } from "@/components/ui/Field";

/**
 * A picker is only safe if it renders the taxonomy and nothing else. These assert
 * the options come from the array that was passed in — no hand-copied list hiding
 * inside the component, which is the failure mode that let the donor project's
 * property-type list drift.
 */
function optionValues(html: string): string[] {
  return [...html.matchAll(/<option[^>]*value="([^"]*)"/g)].map((match) => match[1]).filter((v) => v !== "");
}

describe("SelectInput", () => {
  it("renders exactly the property types passed in — no more, no fewer", () => {
    const options = PROPERTY_TYPES.map((value) => ({ value, label: value }));
    const html = renderToStaticMarkup(
      <SelectInput options={options} value="" placeholder="Choose a type" />,
    );

    expect(optionValues(html).sort()).toEqual([...PROPERTY_TYPES].sort());
    expect(optionValues(html)).toHaveLength(PROPERTY_TYPES.length);
    expect(html).toContain('value="CONVENTION_CENTER"');
    expect(html).toContain("Choose a type");
  });

  it("carries a full 11-type taxonomy and a 2-value mode taxonomy unchanged", () => {
    const modes = PROPERTY_ACCESS_MODES.map((value) => ({ value, label: value }));
    const html = renderToStaticMarkup(<SelectInput options={modes} value={PROPERTY_ACCESS_MODES[0]} />);
    expect(optionValues(html).sort()).toEqual([...PROPERTY_ACCESS_MODES].sort());
    expect(PROPERTY_TYPES).toHaveLength(11);
  });

  it("renders any status array it is fed straight from domain/identity", () => {
    const options = SITE_STATUSES.map((value) => ({ value, label: value }));
    const html = renderToStaticMarkup(<SelectInput options={options} value="" />);
    expect(optionValues(html).sort()).toEqual([...SITE_STATUSES].sort());
  });

  it("groups options under optgroups when an option declares a group", () => {
    const options = [
      { value: "HOTEL", label: "Hotel", group: "Stay" },
      { value: "RESTAURANT", label: "Restaurant", group: "Dine" },
    ] as const;
    const html = renderToStaticMarkup(<SelectInput options={options} value="" />);
    expect(html).toContain('<optgroup label="Stay"');
    expect(html).toContain('<optgroup label="Dine"');
  });

  it("inherits its id and description from a wrapping Field", () => {
    const options = PROPERTY_ACCESS_MODES.map((value) => ({ value, label: value }));
    const html = renderToStaticMarkup(
      <Field id="mode" label="Access mode" hint="How wide the grant reaches">
        <SelectInput options={options} value="" />
      </Field>,
    );
    expect(html).toContain('<select id="mode"');
    expect(html).toContain('aria-describedby="mode-hint"');
  });
});
