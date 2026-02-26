function SkeletonLine({ width = "100%" }) {
  return <div className="page-skeleton h-4 rounded-lg bg-surface-2" style={{ width }} />;
}

export default function AdminLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="rounded-3xl border border-border bg-surface p-5">
        <SkeletonLine width="24%" />
        <div className="mt-4 space-y-3">
          <SkeletonLine width="100%" />
          <SkeletonLine width="92%" />
          <SkeletonLine width="75%" />
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-5">
        <SkeletonLine width="30%" />
        <div className="mt-4 space-y-3">
          <SkeletonLine width="100%" />
          <SkeletonLine width="85%" />
          <SkeletonLine width="90%" />
          <SkeletonLine width="70%" />
        </div>
      </div>
    </section>
  );
}
