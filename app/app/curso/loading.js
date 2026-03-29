function Skeleton({ className = "" }) {
  return <div className={`page-skeleton rounded-[18px] bg-surface-2 ${className}`} />;
}

export default function CourseLoading() {
  return (
    <section className="space-y-12 rounded-[32px] bg-[#05070b] px-5 py-8 sm:px-8 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Skeleton className="h-9 w-48 rounded-full" />
          <Skeleton className="mt-5 h-14 w-full max-w-[34rem]" />
          <div className="mt-5 flex flex-wrap gap-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-44" />
          </div>
        </div>
        <Skeleton className="h-[68px] w-full max-w-[18rem]" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>

      <div className="space-y-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Skeleton className="h-12 w-72" />
            <Skeleton className="mt-3 h-5 w-80" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-11 w-28 rounded-full" />
            <Skeleton className="h-11 w-11 rounded-full" />
          </div>
        </div>

        <div className="space-y-14">
          <div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-10 w-56" />
              <Skeleton className="h-px flex-1 rounded-none" />
            </div>
            <div className="ml-6 mt-8 border-l-2 border-dashed border-border pl-10 space-y-8">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-10 w-56" />
              <Skeleton className="h-px flex-1 rounded-none" />
            </div>
            <div className="ml-6 mt-8 border-l-2 border-dashed border-border pl-10">
              <Skeleton className="h-[26rem]" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-10 w-56" />
              <Skeleton className="h-px flex-1 rounded-none" />
            </div>
            <div className="ml-6 mt-8 border-l-2 border-dashed border-border pl-10">
              <Skeleton className="h-40" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
