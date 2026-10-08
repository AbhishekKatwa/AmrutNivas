import { UtensilsCrossed } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestDiningPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Dining</h1>
        <p className="text-sm text-[#66706A] mt-1">Restaurant options and room service</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <UtensilsCrossed className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Restaurant menus and room service ordering</p>
          <p className="text-xs text-[#9CA3AF]">Integrates with existing Restaurant, Menu, Order, and KOT systems</p>
        </div>
      </Card>
    </div>
  );
}
