import { Gift } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function GuestOffersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Offers</h1>
        <p className="text-sm text-[#66706A] mt-1">Personalized offers and promotions</p>
      </div>

      <Card>
        <div className="p-12 text-center">
          <Gift className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
          <p className="text-sm text-[#66706A] mb-4">Eligible offers from Marketing module</p>
          <p className="text-xs text-[#9CA3AF]">Server-side eligibility calculation, never trust client-side offer data</p>
        </div>
      </Card>
    </div>
  );
}
