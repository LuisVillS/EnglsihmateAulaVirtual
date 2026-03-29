function SkeletonBlock({ className = "" }) {
  return <div className={`page-skeleton rounded-[22px] bg-surface-2 ${className}`} />;
}

export default function AppLoading() {
  return (
    <section className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="rounded-[30px] border border-border bg-surface p-6 sm:p-7">
          <SkeletonBlock className="h-3 w-40" />
          <div className="mt-5 space-y-3">
            <SkeletonBlock className="h-12 w-full max-w-[26rem]" />
            <SkeletonBlock className="h-12 w-full max-w-[20rem]" />
            <SkeletonBlock className="h-4 w-full max-w-[34rem]" />
            <SkeletonBlock className="h-4 w-full max-w-[28rem]" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <SkeletonBlock className="h-11 w-40" />
            <SkeletonBlock className="h-11 w-44" />
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
          </div>
        </div>

        <div className="rounded-[30px] border border-border bg-[#103474] p-6 sm:p-7">
          <SkeletonBlock className="h-8 w-36 bg-white/20" />
          <div className="mt-5 space-y-3">
            <SkeletonBlock className="h-10 w-48 bg-white/20" />
            <SkeletonBlock className="h-4 w-full bg-white/20" />
            <SkeletonBlock className="h-4 w-4/5 bg-white/20" />
          </div>
          <div className="mt-6 grid gap-3">
            <SkeletonBlock className="h-20 bg-white/20" />
            <SkeletonBlock className="h-20 bg-white/20" />
          </div>
          <div className="mt-6 space-y-3">
            <SkeletonBlock className="h-12 bg-white/30" />
            <SkeletonBlock className="h-12 bg-white/20" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-[30px] border border-border bg-surface p-6 sm:p-7">
          <SkeletonBlock className="h-3 w-40" />
          <div className="mt-6 flex justify-center">
            <SkeletonBlock className="h-40 w-40 rounded-full" />
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
          </div>
          <SkeletonBlock className="mt-6 h-36" />
        </div>

        <div className="rounded-[30px] border border-border bg-surface p-6 sm:p-7">
          <SkeletonBlock className="h-3 w-40" />
          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-8 w-56" />
            <SkeletonBlock className="h-4 w-full max-w-[30rem]" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
          </div>
          <SkeletonBlock className="mt-6 h-32" />
        </div>
      </div>

      <div className="rounded-[30px] border border-border bg-surface p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <SkeletonBlock className="h-3 w-36" />
            <SkeletonBlock className="h-8 w-64" />
            <SkeletonBlock className="h-4 w-full max-w-[34rem]" />
          </div>
          <div className="flex flex-wrap gap-3">
            <SkeletonBlock className="h-11 w-40" />
            <SkeletonBlock className="h-11 w-44" />
          </div>
        </div>
        <div className="mt-8 grid gap-4 xl:grid-cols-3">
          <SkeletonBlock className="h-72" />
          <SkeletonBlock className="h-72" />
          <SkeletonBlock className="h-72" />
        </div>
      </div>
    </section>
  );
}
