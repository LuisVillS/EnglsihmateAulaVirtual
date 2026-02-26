function SkeletonLine({ width = "100%" }) {
  return <div className="page-skeleton h-4 rounded-lg bg-surface-2" style={{ width }} />;
}

export default function AppLoading() {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-border bg-surface p-5">
        <SkeletonLine width="32%" />
        <div className="mt-4 space-y-3">
          <SkeletonLine width="100%" />
          <SkeletonLine width="85%" />
          <SkeletonLine width="70%" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-border bg-surface p-5">
          <SkeletonLine width="45%" />
          <div className="mt-4 space-y-3">
            <SkeletonLine width="100%" />
            <SkeletonLine width="88%" />
            <SkeletonLine width="76%" />
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <SkeletonLine width="45%" />
          <div className="mt-4 space-y-3">
            <SkeletonLine width="100%" />
            <SkeletonLine width="90%" />
            <SkeletonLine width="65%" />
          </div>
        </div>
      </div>
    </section>
  );
}
