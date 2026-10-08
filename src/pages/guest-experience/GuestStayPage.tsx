import { Home } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestStayPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">My Stay</h1>
        <p className="text-sm text-[#66706A] mt-1">Current stay details and room information</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Home className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Active stay information from PMS</p>
          <p className="text-xs text-[#9CA3AF]">Shows room, amenities, Wi-Fi, property info, and available services</p>
        </div>
      </Card>
    </div>
  );
}
