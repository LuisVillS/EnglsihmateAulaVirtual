export default function PracticeDecksLoading() {
  return (
    <section className="space-y-12">
      <div className="h-16 max-w-2xl rounded-2xl bg-[#f3f4f5]" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="h-3 w-40 rounded-full bg-slate-200" />
          <div className="h-14 w-80 rounded-full bg-slate-200" />
          <div className="h-20 w-[38rem] max-w-full rounded-[1.5rem] bg-slate-200" />
        </div>
        <div className="flex gap-3">
          <div className="h-16 w-32 rounded-xl bg-[#f3f4f5]" />
          <div className="h-16 w-32 rounded-xl bg-[#f3f4f5]" />
          <div className="h-16 w-14 rounded-xl bg-[#e7e8e9]" />
        </div>
      </div>
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl bg-white shadow-[0px_12px_32px_rgba(0,25,67,0.06)]">
            <div className="h-48 bg-slate-200" />
            <div className="space-y-4 p-6">
              <div className="h-8 w-40 rounded-full bg-slate-200" />
              <div className="h-6 w-28 rounded-full bg-slate-200" />
              <div className="h-2.5 w-full rounded-full bg-[#d9e2ff]" />
              <div className="h-12 w-full rounded-xl bg-[#002a5c]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
