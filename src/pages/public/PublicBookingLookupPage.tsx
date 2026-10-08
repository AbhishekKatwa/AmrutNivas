/**
 * Public booking lookup page — mobile-first, no authentication required.
 *
 * Allows guests to look up their reservations by confirmation number or
 * contact details. This is the entry point for direct booking management.
 */

import { useState } from "react";
import { Calendar, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function PublicBookingLookupPage() {
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmationNumber && !email) {
      setError("Please enter a confirmation number or email address.");
      return;
    }

    setSearching(true);
    setError(null);

    // TODO: Look up reservation
    setTimeout(() => {
      setSearching(false);
      setError("No reservation found. Please check your details and try again.");
    }, 1000);
  }

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Calendar className="size-8" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
            Manage Your Booking
          </h1>
          <p className="mt-2 text-base text-muted">
            Enter your confirmation number or email to view your reservation.
          </p>
        </header>

        <Card className="p-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="confirmation"
                className="block text-sm font-medium text-ink"
              >
                Confirmation Number
              </label>
              <input
                id="confirmation"
                type="text"
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
                placeholder="e.g., RES-123456"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-ink"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={searching}
              icon={<Search className="size-4" aria-hidden />}
              className="w-full"
            >
              {searching ? "Searching…" : "Find Reservation"}
            </Button>
          </form>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted">
            Need help? Contact the property directly.
          </p>
        </div>
      </div>
    </div>
  );
}
