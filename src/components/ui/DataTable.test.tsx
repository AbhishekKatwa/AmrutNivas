import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type Row = { id: string; name: string; rooms: number };

const ROWS: Row[] = [
  { id: "prop-1", name: "Sunset Resort", rooms: 120 },
  { id: "prop-2", name: "Harbour Lodge", rooms: 48 },
];

const COLUMNS: readonly DataColumn<Row>[] = [
  { key: "name", header: "Property", render: (row) => row.name },
  { key: "rooms", header: "Rooms", align: "right", render: (row) => String(row.rooms) },
];

describe("DataTable", () => {
  it("renders one header per column and one row per record keyed by rowKey", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />,
    );
    expect(html).toContain(">Property<");
    expect(html).toContain(">Rooms<");
    // One <th scope="col"> per column.
    expect((html.match(/scope="col"/g) ?? []).length).toBe(COLUMNS.length);
    // One body row per record, in the supplied order.
    for (const row of ROWS) expect(html).toContain(row.name);
    const bodyRows = html.slice(html.indexOf("<tbody"));
    expect((bodyRows.match(/<tr/g) ?? []).length).toBe(ROWS.length);
  });

  it("right-aligns numeric cells with tabular figures", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />,
    );
    const numericCell = html.match(/<td class="([^"]*money-figure[^"]*)">120<\/td>/);
    expect(numericCell).not.toBeNull();
    expect(numericCell?.[1]).toContain("text-right");
  });

  it("renders the empty state and no data rows when there are no records", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        empty={<EmptyState title="No properties yet" description="Create the first site to begin." />}
      />,
    );
    expect(html).toContain("No properties yet");
    // A single full-width cell spans both columns.
    expect(html).toContain('colSpan="2"');
    const bodyRows = html.slice(html.indexOf("<tbody"));
    expect(bodyRows).not.toContain("Sunset Resort");
  });

  it("shows the loading skeleton even when rows are present, and hides the real data", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} loading />,
    );
    // Skeleton stands in for data: SKELETON_ROWS (5) × 2 columns of pulsing bars.
    expect((html.match(/animate-pulse/g) ?? []).length).toBe(10);
    expect(html).not.toContain("Sunset Resort");
    // Headers must survive loading so a broken loading branch cannot hide the table.
    expect(html).toContain(">Property<");
  });
});
