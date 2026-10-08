import { Phone } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">My Profile</h1>
        <p className="text-sm text-[#66706A] mt-1">Personal information and preferences</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Phone className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Profile and preference management</p>
          <p className="text-xs text-[#9CA3AF]">Integrates with existing CRM customer data and preferences</p>
        </div>
      </Card>
    </div>
  );
}
