import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <LoadingSpinner className="w-10 h-10 mb-4" />
      <p className="text-slate-500 font-medium">Loading...</p>
    </div>
  );
}
