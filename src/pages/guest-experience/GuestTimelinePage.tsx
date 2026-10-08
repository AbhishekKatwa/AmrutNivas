import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestTimelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Journey Timeline</h1>
        <p className="text-sm text-[#66706A] mt-1">Your complete guest journey</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <MapPin className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Complete journey timeline across all stages</p>
          <p className="text-xs text-[#9CA3AF]">Shows booking, check-in, orders, requests, payments, events, checkout, feedback</p>
        </div>
      </Card>
    </div>
  );
}
