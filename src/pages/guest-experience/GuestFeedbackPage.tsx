import { Star } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestFeedbackPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Feedback</h1>
        <p className="text-sm text-[#66706A] mt-1">Share your experience</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Star className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Feedback forms for stay, dining, events, and service requests</p>
          <p className="text-xs text-[#9CA3AF]">Integrates with existing Experience feedback system</p>
        </div>
      </Card>
    </div>
  );
}
