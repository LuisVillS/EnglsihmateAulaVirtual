export default function PracticeExercisesLoading() {
  return (
    <section className="space-y-12">
      <div className="mx-auto h-16 max-w-3xl rounded-[2rem] bg-white shadow-sm" />
      <div className="min-h-[360px] rounded-[2.5rem] bg-[linear-gradient(135deg,#001943_0%,#102e62_100%)]" />
      <div className="space-y-8">
        <div className="flex items-end justify-between">
          <div className="space-y-3">
            <div className="h-3 w-36 rounded-full bg-slate-200" />
            <div className="h-12 w-80 rounded-full bg-slate-200" />
          </div>
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white" />
            <div className="h-12 w-12 rounded-2xl bg-white" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[420px] rounded-[2rem] bg-white" />
          ))}
        </div>
      </div>
      <div className="min-h-[520px] rounded-[3rem] bg-white" />
    </section>
  );
}
