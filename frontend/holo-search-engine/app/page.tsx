import { Suspense } from "react";
import HoloSearch from "@/components/HoloSearch";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12">Loading Holo...</div>}>
      <HoloSearch />
    </Suspense>
  );
}