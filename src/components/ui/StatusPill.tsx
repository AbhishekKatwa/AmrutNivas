import { Badge, type BadgeTone } from "./Badge";

/**
 * The lifecycle vocabulary, in one place.
 *
 * Every status union in `domain/identity` (Organization, Site, Membership,
 * Invitation, Account) is rendered through this single map, and the map is a plain
 * lookup rather than a hand-copied list so a picker elsewhere can be fed the
 * `const` arrays directly. A status the map has never seen falls through to a
 * neutral chip carrying its raw value — it is shown, never crashed on or dropped,
 * so a new enum value on the server degrades into an honest label instead of a
 * blank cell.
 */

/** Tone + human label per known status. Keys are the literal union members. */
const STATUS_TONES: Record<string, { tone: BadgeTone; label: string }> = {
  // Trading / current — green across every lifecycle.
  ACTIVE: { tone: "success", label: "Active" },
  ACCEPTED: { tone: "success", label: "Accepted" },

  // Paused but not retired — a present, neutral chip.
  INACTIVE: { tone: "neutral", label: "Inactive" },
  PAUSED: { tone: "neutral", label: "Paused" },
  INVITED: { tone: "brand", label: "Invited" },

  // Brought to a stop, reversible — amber.
  SUSPENDED: { tone: "warning", label: "Suspended" },

  // Terminal / retired — the flatter muted tone.
  ARCHIVED: { tone: "muted", label: "Archived" },
  REMOVED: { tone: "muted", label: "Removed" },
  EXPIRED: { tone: "muted", label: "Expired" },
  CANCELLED: { tone: "muted", label: "Cancelled" },
  REVOKED: { tone: "muted", label: "Revoked" },
};

/** The tone a status resolves to. Unknown values read as neutral. */
export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status]?.tone ?? "neutral";
}

/** The label a status reads as. Unknown values fall back to their raw value. */
export function statusLabel(status: string): string {
  return STATUS_TONES[status]?.label ?? status;
}

export type StatusPillProps = {
  /**
   * Any lifecycle status value. Typed loosely so all five unions share one pill,
   * and an unrecognised value still renders — see the fallback above.
   */
  status: string;
  /** Override the label (e.g. to localise or to add a count). */
  label?: string;
  className?: string;
};

/**
 * The one status chip in the system. It is `Badge` with the lifecycle meaning
 * baked in — not a second component — so there is never a competing status style.
 */
export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {label ?? statusLabel(status)}
    </Badge>
  );
}
