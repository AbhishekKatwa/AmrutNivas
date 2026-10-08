import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import {
  createLocation,
  listLocations,
} from "@/domain/inventory/inventory-service";
import type { InventoryLocation, LocationType } from "@/domain/inventory/types";
import { LOCATION_TYPES } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type LocationFormState = {
  name: string;
  code: string;
  locationType: LocationType;
  description: string;
};

const EMPTY_FORM: LocationFormState = {
  name: "",
  code: "",
  locationType: "STORE",
  description: "",
};

const COLUMNS: DataColumn<InventoryLocation>[] = [
  {
    key: "name",
    header: "Name",
    render: (row) => (
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-muted" />
        <span className="font-medium text-ink">{row.name}</span>
      </div>
    ),
  },
  {
    key: "code",
    header: "Code",
    render: (row) => (
      <span className="font-mono text-xs">{row.code}</span>
    ),
  },
  { key: "locationType", header: "Type", render: (row) => row.locationType },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge tone={row.status === "ACTIVE" ? "success" : "muted"}>
        {row.status}
      </Badge>
    ),
  },
];

export default function LocationsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [locations, setLocations] = useState<InventoryLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId || !propertyId) return;
    let ignore = false;
    setLocations(null);
    listLocations(organizationId, propertyId, outletId)
      .then((data) => {
        if (ignore) return;
        setLocations(data);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId, propertyId]);

  const typeOptions = useMemo<SelectOption<LocationType>[]>(
    () => LOCATION_TYPES.map((t) => ({ value: t, label: t })),
    [],
  );

  const handleOpen = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!organizationId || !propertyId) return;
    setSubmitting(true);
    setError(null);
    try {
      await createLocation(
        organizationId,
        propertyId,
        outletId,
        form.name,
        form.code,
        form.locationType,
        form.description || undefined,
      );
      setDialogOpen(false);
      const data = await listLocations(organizationId, propertyId, outletId);
      setLocations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!locations) {
    return <LoadingBlock label="Loading locations" />;
  }

  return (
    <div className="space-y-6">
      <Card
        title="Inventory Locations"
        description="Storage areas: stores, kitchens, bars, cold storage, freezers"
        actions={
          <Button variant="primary" size="sm" onClick={handleOpen}>
            New Location
          </Button>
        }
      >
        {locations.length === 0 ? (
          <EmptyState
            icon={<MapPin />}
            title="No locations yet"
            description="Create your first storage location to start tracking inventory."
            action={
              <Button variant="primary" size="sm" onClick={handleOpen}>
                Create Location
              </Button>
            }
          />
        ) : (
          <DataTable columns={COLUMNS} rows={locations} rowKey={(r) => r.id} />
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="New Location"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !form.name || !form.code}
            >
              {submitting ? "Creating..." : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <Field id="loc-name" label="Name" required>
            <TextInput
              id="loc-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Main Store"
            />
          </Field>
          <Field id="loc-code" label="Code" required>
            <TextInput
              id="loc-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="STORE-01"
            />
          </Field>
          <Field id="loc-type" label="Type" required>
            <SelectInput
              options={typeOptions}
              value={form.locationType}
              onChange={(value) =>
                setForm({ ...form, locationType: value as LocationType })
              }
            />
          </Field>
          <Field id="loc-desc" label="Description">
            <TextInput
              id="loc-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional notes"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
