import { Calendar } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestBookingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">My Bookings</h1>
        <p className="text-sm text-[#66706A] mt-1">View and manage your reservations</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Booking management integrates with existing Reservation system</p>
          <p className="text-xs text-[#9CA3AF]">Shows upcoming, past, and cancelled reservations with view/modify/cancel actions</p>
        </div>
      </Card>
    </div>
  );
}
