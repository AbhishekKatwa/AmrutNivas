import { Star } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestRewardsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Rewards</h1>
        <p className="text-sm text-[#66706A] mt-1">Your loyalty points and benefits</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Star className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Loyalty program information</p>
          <p className="text-xs text-[#9CA3AF]">Shows points, tier, recent activity, benefits, and eligible rewards</p>
        </div>
      </Card>
    </div>
  );
}
