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
  // Written but not live: a menu, category or dish waiting to be published (014).
  DRAFT: { tone: "neutral", label: "Draft" },
  INVITED: { tone: "brand", label: "Invited" },

  // The order's working life (Prompt #04 §27, 016): written down, moving through the room.
  // The words carry the distinction — colour is never the only signal, and the machine that
  // decides which of these can follow which lives in `app`, not in a chip.
  PLACED: { tone: "brand", label: "Placed" },
  CONFIRMED: { tone: "brand", label: "Confirmed" },
  PREPARING: { tone: "warning", label: "Preparing" },
  READY: { tone: "success", label: "Ready" },
  SERVED: { tone: "brand", label: "Served" },
  COMPLETED: { tone: "success", label: "Completed" },

  // Brought to a stop, reversible — amber.
  SUSPENDED: { tone: "warning", label: "Suspended" },

  // Terminal / retired — the flatter muted tone.
  ARCHIVED: { tone: "muted", label: "Archived" },
  REMOVED: { tone: "muted", label: "Removed" },
  EXPIRED: { tone: "muted", label: "Expired" },
  CANCELLED: { tone: "muted", label: "Cancelled" },
  REVOKED: { tone: "muted", label: "Revoked" },

  // The restaurant floor's operational fact (§20, 015 + 016's derived read). Five states,
  // three of which a person can set — a floor map draws all five through this one map, so a
  // cover never gets a per-screen colour vocabulary.
  AVAILABLE: { tone: "success", label: "Available" },
  OCCUPIED: { tone: "brand", label: "Occupied" },
  RESERVED: { tone: "neutral", label: "Reserved" },
  CLEANING: { tone: "warning", label: "Cleaning" },
  OUT_OF_SERVICE: { tone: "muted", label: "Out of service" },

  // The bill's life (017) and the slip's (018), through the same one map. A bill's words carry
  // the money fact — OPEN means still due, PARTIALLY_PAID means some of it arrived — and a
  // ticket's carry the kitchen's, so CLOSED here means the pass rang every line up, which is
  // the same finish a floor or an order reads as success.
  OPEN: { tone: "brand", label: "Open" },
  PARTIALLY_PAID: { tone: "warning", label: "Partially paid" },
  PAID: { tone: "success", label: "Paid" },
  CLOSED: { tone: "success", label: "Closed" },

  // A payment's own state (017). FAILED is the one thing in this vocabulary that must not read
  // as calm: money that did not arrive cannot be shown in the same tone as money that did.
  SUCCESSFUL: { tone: "success", label: "Successful" },
  FAILED: { tone: "danger", label: "Failed" },
  REFUNDED: { tone: "muted", label: "Refunded" },

  // A line's KITCHEN state (018) — deliberately separate from the order's status above, and
  // from ACTIVE/VOIDED, which is the same line's SALES state. FIRED is work in progress; READY
  // is the pass, and reuses the one label the order ladder already gives it.
  NOT_FIRED: { tone: "neutral", label: "Not fired" },
  FIRED: { tone: "warning", label: "Fired" },
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
