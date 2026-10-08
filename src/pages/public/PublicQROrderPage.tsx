/**
 * Public QR code ordering page — mobile-first, no authentication required.
 *
 * Shows the table's menu and allows customers to place orders. This is what
 * customers see when they scan a QR code at their table.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QrCode, ShoppingBag, Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";

export default function PublicQROrderPage() {
  const { qrCode } = useParams<{ qrCode: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qrCode) return;
    let ignore = false;

    setLoading(true);
    setError(null);

    // TODO: Look up QR code and resolve to table/outlet
    // For now, just show a placeholder
    setTimeout(() => {
      if (!ignore) setLoading(false);
    }, 500);

    return () => {
      ignore = true;
    };
  }, [qrCode]);

  if (loading) {
    return <LoadingBlock label="Loading your table…" />;
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={<QrCode aria-hidden />}
            title="Unable to load table"
            description={error}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-600 p-3 text-white">
              <QrCode className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
                Table Service
              </h1>
              <p className="mt-1 text-sm text-muted">
                QR Code: {qrCode}
              </p>
            </div>
          </div>
        </header>

        <section className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-ink">Menu</h2>
          <EmptyState
            icon={<ShoppingBag aria-hidden />}
            title="Menu coming soon"
            description="You'll be able to browse and order from your table shortly."
          />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-ink">Need Service?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ServiceButton
              icon={<Bell className="size-5" aria-hidden />}
              label="Call Waiter"
              description="Get assistance from staff"
            />
            <ServiceButton
              icon={<ShoppingBag className="size-5" aria-hidden />}
              label="Request Bill"
              description="Ask for the check"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ServiceButton({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Button
      variant="secondary"
      className="flex h-auto flex-col items-start gap-2 p-4 text-left"
      onClick={() => {
        // TODO: Create table request
        alert(`${label} requested`);
      }}
    >
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
        <div>
          <div className="font-semibold text-ink">{label}</div>
          <div className="text-xs text-muted">{description}</div>
        </div>
      </div>
    </Button>
  );
}
