/**
 * Public property page — mobile-first, no authentication required.
 *
 * Shows the property's public profile: name, description, cover image,
 * contact details, address, and check-in/check-out times. This is what
 * guests see when they visit /stay/:propertySlug.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MapPin, Phone, Mail, Clock, Globe } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { getPropertyPublicProfileBySlug } from "@/domain/commerce/commerce-service";
import type { PropertyPublicProfile } from "@/domain/commerce/types";
import { toPublicError } from "@/lib/errors";

export default function PublicPropertyPage() {
  const { propertySlug } = useParams<{ propertySlug: string }>();
  const [profile, setProfile] = useState<PropertyPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertySlug) return;
    let ignore = false;

    setLoading(true);
    setError(null);

    getPropertyPublicProfileBySlug(propertySlug)
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
  }, [propertySlug]);

  if (loading) {
    return <LoadingBlock label="Loading property information…" />;
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={<MapPin aria-hidden />}
            title="Unable to load property"
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
            icon={<MapPin aria-hidden />}
            title="Property not found"
            description={`No active property exists with the slug "${propertySlug}".`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      {profile.coverImage && (
        <div className="relative h-64 w-full overflow-hidden bg-brand-50 sm:h-80">
          <img
            src={profile.coverImage}
            alt={profile.publicName}
            className="h-full w-full object-cover"
          />
          {profile.logo && (
            <div className="absolute bottom-4 left-4 rounded-lg bg-white p-2 shadow-lg">
              <img
                src={profile.logo}
                alt={`${profile.publicName} logo`}
                className="h-12 w-12 object-contain"
              />
            </div>
          )}
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
            {profile.publicName}
          </h1>
          {profile.shortDescription && (
            <p className="mt-2 text-base text-muted sm:text-lg">
              {profile.shortDescription}
            </p>
          )}
        </header>

        {profile.description && (
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold text-ink">About</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted sm:text-base">
              {profile.description}
            </p>
          </section>
        )}

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
          {profile.website && (
            <InfoCard
              icon={<Globe className="size-4" aria-hidden />}
              label="Website"
              value={profile.website}
              href={profile.website}
            />
          )}
          {(profile.checkInTime || profile.checkOutTime) && (
            <InfoCard
              icon={<Clock className="size-4" aria-hidden />}
              label="Check-in / Check-out"
              value={`${profile.checkInTime ?? "—"} / ${profile.checkOutTime ?? "—"}`}
            />
          )}
        </section>

        {(profile.address || profile.city || profile.state || profile.country) && (
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold text-ink">Location</h2>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
              <MapPin className="size-5 shrink-0 text-brand-600" aria-hidden />
              <address className="text-sm not-italic text-muted sm:text-base">
                {profile.address && <div>{profile.address}</div>}
                <div>
                  {[profile.city, profile.state, profile.country]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </address>
            </div>
          </section>
        )}
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
