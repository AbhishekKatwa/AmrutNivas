import { Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestBillsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">My Bills</h1>
        <p className="text-sm text-[#66706A] mt-1">View your bills and payment history</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Folio and billing information</p>
          <p className="text-xs text-[#9CA3AF]">Integrates with existing Folio system, shows charges, payments, and balance</p>
        </div>
      </Card>
    </div>
  );
}
