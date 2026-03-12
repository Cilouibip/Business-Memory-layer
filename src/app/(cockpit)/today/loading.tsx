import { Skeleton } from "@/components/ui/skeleton";

export default function TodayLoading() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[132px] w-full rounded-xl" />)}
      </div>
      
      {/* LIGNE 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-[180px] w-full rounded-xl" />
          <div>
            <Skeleton className="h-6 w-48 mb-4" />
            <Skeleton className="h-[280px] w-full rounded-xl" />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      </div>
      
      {/* LIGNE 3 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-[340px] w-full rounded-xl" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[180px] w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
