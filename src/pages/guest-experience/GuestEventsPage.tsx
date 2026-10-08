import { Calendar } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestEventsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">My Events</h1>
        <p className="text-sm text-[#66706A] mt-1">Upcoming and past events</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Event bookings and quotations</p>
          <p className="text-xs text-[#9CA3AF]">Integrates with existing Events module, shows approved documents only</p>
        </div>
      </Card>
    </div>
  );
}
