import { type ReactNode } from "react";
import clsx from "clsx";
import { Skeleton } from "./Spinner";

export type DataColumn<T> = {
  /** Stable identity for the column; also used as the React key on header/cells. */
  key: string;
  header: ReactNode;
  /** Produces the cell's content from a row. */
  render: (row: T) => ReactNode;
  /** Right alignment is reserved for money, counts and ids — it implies tabular numerals. */
  align?: "left" | "right";
  /** Optional column width hint (e.g. `"8rem"`, `"35%"`). */
  width?: string;
};

export type DataTableProps<T> = {
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  /** Supplies each row's React key. A row is keyed by the record, never by its index. */
  rowKey: (row: T) => string;
  /** Shows the skeleton instead of rows — including when rows are already present. */
  loading?: boolean;
  /** Rendered when there are no rows and not loading; usually an `EmptyState`. */
  empty?: ReactNode;
  caption?: ReactNode;
  className?: string;
};

const SKELETON_ROWS = 5;

/**
 * The table every admin list renders.
 *
 * Three things are non-negotiable and are the reason this is a shared component
 * rather than an ad-hoc `<table>` per screen: numeric columns use tabular numerals
 * so totals line up, a phone gets a card-like contained horizontal scroll instead
 * of a sideways page, and the empty and loading states are real states rather than
 * a header with nothing under it. Rows are keyed by a caller-supplied `rowKey` so
 * re-sorting a list cannot make React reconcile the wrong cell.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  caption,
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={clsx(
        // Card-like shell; `overflow-x-auto` keeps a wide table scrollable inside
        // the card so a 360px phone never scrolls the whole page sideways.
        "overflow-x-auto rounded-lg border border-line bg-surface shadow-soft",
        className,
      )}
    >
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        {caption !== undefined && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-[11px] tracking-[0.06em] text-muted uppercase">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={clsx(
                  // Sticky header at desktop; harmless where the wrapper is short.
                  "sticky top-0 z-10 bg-surface-sunken px-4 py-2.5 font-semibold",
                  column.align === "right" ? "text-right" : "text-left",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
              // Skeleton rows are decorative placeholders, not records — no data key.
              <tr key={`skeleton-${rowIndex}`} aria-hidden className="border-b border-line last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className={clsx("px-4 py-3", column.align === "right" && "text-right")}>
                    <Skeleton className={clsx("h-4", column.align === "right" ? "ml-auto w-16" : "w-full")} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6">
                {empty ?? (
                  <p className="text-sm text-muted">No records to show.</p>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-line transition-colors last:border-0 hover:bg-surface-sunken"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      "px-4 py-3 align-middle text-ink",
                      column.align === "right" && "money-figure whitespace-nowrap text-right",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
