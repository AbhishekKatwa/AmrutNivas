/**
 * Public outlet menu page — mobile-first, no authentication required.
 *
 * Shows the outlet's public profile and menu items. This is what customers
 * see when they visit /menu/:outletSlug or scan a QR code.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Utensils, Phone, Mail, MapPin, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { getOutletPublicProfileBySlug } from "@/domain/commerce/commerce-service";
import type { OutletPublicProfile } from "@/domain/commerce/types";
import { toPublicError } from "@/lib/errors";

export default function PublicMenuPage() {
  const { outletSlug } = useParams<{ outletSlug: string }>();
  const [profile, setProfile] = useState<OutletPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!outletSlug) return;
    let ignore = false;

    setLoading(true);
    setError(null);

    getOutletPublicProfileBySlug(outletSlug)
      .then((data) => {
        if (!ignore) setProfile(data);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [outletSlug]);

  if (loading) {
    return <LoadingBlock label="Loading menu…" />;
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={<Utensils aria-hidden />}
            title="Unable to load menu"
            description={error}
          />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={<Utensils aria-hidden />}
            title="Menu not found"
            description={`No active outlet exists with the slug "${outletSlug}".`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      {profile.coverImage && (
        <div className="relative h-48 w-full overflow-hidden bg-brand-50 sm:h-64">
          <img
            src={profile.coverImage}
            alt={profile.publicName}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
            {profile.publicName}
          </h1>
          {profile.description && (
            <p className="mt-2 text-base text-muted sm:text-lg">
              {profile.description}
            </p>
          )}
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          {profile.phone && (
            <InfoCard
              icon={<Phone className="size-4" aria-hidden />}
              label="Phone"
              value={profile.phone}
              href={`tel:${profile.phone}`}
            />
          )}
          {profile.email && (
            <InfoCard
              icon={<Mail className="size-4" aria-hidden />}
              label="Email"
              value={profile.email}
              href={`mailto:${profile.email}`}
            />
          )}
          {profile.address && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 sm:col-span-2">
              <MapPin className="size-5 shrink-0 text-brand-600" aria-hidden />
              <address className="text-sm not-italic text-muted sm:text-base">
                {profile.address}
              </address>
            </div>
          )}
          {profile.openingHours && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 sm:col-span-2">
              <Clock className="size-5 shrink-0 text-brand-600" aria-hidden />
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">
                  Opening Hours
                </div>
                <div className="mt-1 text-sm text-ink">
                  {formatOpeningHours(profile.openingHours)}
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-ink">Menu</h2>
          <EmptyState
            icon={<Utensils aria-hidden />}
            title="Menu coming soon"
            description="Menu items will be available here shortly."
          />
        </section>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </div>
        <div className="mt-1 truncate text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className="block transition hover:border-brand-300 hover:shadow-sm"
      >
        {content}
      </a>
    );
  }

  return content;
}

function formatOpeningHours(hours: Record<string, unknown>): string {
  // Simple formatting - can be enhanced based on actual structure
  try {
    return JSON.stringify(hours, null, 2);
  } catch {
    return "See outlet for hours";
  }
}
