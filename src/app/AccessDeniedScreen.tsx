/**
 * The access-denied experience (§63), for the person who followed a link or typed an
 * address and landed somewhere their access does not cover (§21: that is a normal path,
 * not an error).
 *
 * Three things and nothing else: what happened, in the server's own sentence; how to
 * leave; how to put it right. It never names the capability, the role or a door token
 * (§39, §63), and it never says whether the screen exists for somebody in another
 * tenant — under §40's enumeration rule the answer about a stranger's tenant has to be
 * the same sentence as the answer about your own.
 */

import { ArrowLeft, Compass, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { denialCopy } from "@/domain/access/authorize";
import type { AccessDenialReason } from "@/config/security";

export type AccessDeniedScreenProps = {
  readonly reason: AccessDenialReason;
};

export function AccessDeniedScreen({ reason }: AccessDeniedScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-xl py-6">
      <EmptyState
        icon={<Lock aria-hidden />}
        title="Access restricted"
        description={denialCopy(reason)}
        action={
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowLeft className="size-4" aria-hidden />}
                onClick={() => navigate(-1)}
              >
                Go back
              </Button>
              {/* The way out cannot depend on there being a page behind them, so the
                  overview is always offered too. */}
              <Button
                variant="ghost"
                size="sm"
                icon={<Compass className="size-4" aria-hidden />}
                onClick={() => navigate("/")}
              >
                Open the overview
              </Button>
            </div>
            <p className="max-w-prose text-xs leading-relaxed text-muted">
              If you are working in the wrong place, choose another organization or property with
              the switcher at the top of this page and open this screen again.
            </p>
            <p className="max-w-prose text-xs leading-relaxed text-muted">
              If this is the right place and it still will not open, ask an administrator to
              review your access. Nothing was changed, and no data was lost, by arriving here.
            </p>
          </div>
        }
      />
    </div>
  );
}
