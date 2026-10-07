import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";

/**
 * Field is the accessibility backbone of every form, so the wiring is asserted
 * against real markup rather than intent: the label must point at the control, the
 * control must name both its hint and its error, and an error only appears when the
 * field is actually invalid.
 */
describe("Field", () => {
  it("links label/control and describes hint + error together when invalid", () => {
    const html = renderToStaticMarkup(
      <Field id="org-name" label="Organization name" hint="Shown on invoices" error="Name is required">
        <TextInput value="" onChange={() => {}} />
      </Field>,
    );

    expect(html).toContain('<label for="org-name"');
    expect(html).toContain('id="org-name"');
    // One aria-describedby carries the hint id then the error id, in that order.
    expect(html).toContain('aria-describedby="org-name-hint org-name-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Name is required");
    expect(html).toContain("Shown on invoices");
    // The error is announced, not merely shown in red.
    expect(html).toContain('role="status"');
  });

  it("omits the error and its description id when the field is valid", () => {
    const html = renderToStaticMarkup(
      <Field id="org-name" label="Organization name" hint="Shown on invoices">
        <TextInput defaultValue="" />
      </Field>,
    );

    expect(html).not.toContain("Name is required");
    expect(html).not.toContain("org-name-error");
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="org-name-hint"');
  });

  it("marks a required field with a symbol, not colour alone", () => {
    const html = renderToStaticMarkup(
      <Field id="code" label="Code" required>
        <TextInput defaultValue="" />
      </Field>,
    );
    expect(html).toContain('aria-hidden="true">*</span>');
    expect(html).toContain(">required</span>");
  });

  it("feeds a control with no explicit id from the generated field id", () => {
    const html = renderToStaticMarkup(
      <Field label="Legal name">
        <TextInput defaultValue="" />
      </Field>,
    );
    // The label's `for` and the input's `id` resolve to the same generated value.
    const forMatch = html.match(/<label for="([^"]+)"/);
    expect(forMatch).not.toBeNull();
    expect(html).toContain(`id="${forMatch?.[1]}"`);
  });

  it("renders icon, suffix and invalid affordances on TextInput", () => {
    const html = renderToStaticMarkup(
      <TextInput invalid leadingIcon={<span data-testid="icon" />} suffix=".amrut" defaultValue="sunset" disabled />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(".amrut");
    expect(html).toContain("data-testid=\"icon\"");
    expect(html).toContain("disabled");
  });

  it("wires a Textarea to its Field", () => {
    const html = renderToStaticMarkup(
      <Field id="notes" label="Notes" error="Required">
        <Textarea defaultValue="" />
      </Field>,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain('id="notes"');
    expect(html).toContain('aria-describedby="notes-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Required");
  });
});
