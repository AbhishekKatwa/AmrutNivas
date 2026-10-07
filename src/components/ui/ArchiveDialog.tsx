import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { Textarea } from "./Textarea";
import { Spinner } from "./Spinner";

/**
 * The one rule the archive gate hinges on, kept outside the JSX so it can be
 * asserted directly.
 *
 * A reason is mandatory before an archive is allowed: the spec forbids retiring a
 * record without stating why, and every database door takes a `p_reason`. A blank
 * or whitespace-only reason never enables the action, and it normalizes to
 * "not provided" so an empty string can never reach the door. A missing entity name
 * is also refused — the confirmation must be able to name what is being retired.
 */
export function archiveActionState(
  reason: string | undefined,
  entityName: string | undefined,
): { canConfirm: boolean; normalizedReason: string } {
  const trimmed = (reason ?? "").trim();
  const hasName = (entityName ?? "").trim().length > 0;
  return {
    canConfirm: hasName && trimmed.length > 0,
    normalizedReason: trimmed.length > 0 ? trimmed : "not provided",
  };
}

export type ArchiveDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the normalized reason only once it is non-empty. */
  onConfirm: (reason: string) => void;
  /** The record being retired, shown verbatim so the action names its target. */
  entityName: string;
  /** Noun describing the record type: "organization", "property", "invitation". */
  entityLabel?: string;
  /** Plain-language consequences; a sensible non-destructive default is supplied. */
  consequences?: readonly string[];
  loading?: boolean;
};

const DEFAULT_CONSEQUENCES: readonly string[] = [
  "It will no longer appear in active lists or selectors.",
  "Its records and history are preserved and remain auditable.",
  "It can be restored later from the archived view.",
];

/**
 * The shared "archive / retire" confirmation for Organization, Property, Outlet,
 * Department, Member and Invitation screens.
 *
 * It states what will happen in plain language, requires a written reason before
 * the action is enabled, and never offers a "delete" affordance — this retires a
 * record, it does not remove it.
 */
export function ArchiveDialog({
  open,
  onClose,
  onConfirm,
  entityName,
  entityLabel = "record",
  consequences = DEFAULT_CONSEQUENCES,
  loading = false,
}: ArchiveDialogProps) {
  const [reason, setReason] = useState("");

  // Every fresh open starts from an empty reason; the reason belongs to one act of
  // archiving, not to the lifetime of the screen behind it.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const { canConfirm, normalizedReason } = archiveActionState(reason, entityName);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Archive ${entityName || "this " + entityLabel}?`}
      description="This retires the record; it does not remove its data."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={loading ? <Spinner size="sm" decorative /> : <Archive className="size-4" aria-hidden />}
            disabled={!canConfirm || loading}
            onClick={() => onConfirm(normalizedReason)}
          >
            {loading ? "Archiving…" : `Archive ${entityLabel}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink">
          You are about to archive <span className="font-semibold">{entityName || entityLabel}</span>.
        </p>

        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3">
          {consequences.map((line) => (
            <li key={line} className="text-xs leading-relaxed text-muted">
              {line}
            </li>
          ))}
        </ul>

        <Field
          label="Reason for archiving"
          required
          hint="Recorded in the audit trail and required before you can continue."
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Site closed for renovation; will reactivate in Q3."
            disabled={loading}
          />
        </Field>

        {!canConfirm && reason.length > 0 && (
          <p role="status" className="text-xs text-muted">
            A reason is still required.
          </p>
        )}
      </div>
    </Dialog>
  );
}
