export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f3f5f8]">
      <div className="mx-auto max-w-7xl animate-pulse px-5 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="h-3 w-64 rounded-full bg-white" />
            <div className="mt-4 h-14 w-[32rem] max-w-full rounded-full bg-white" />
          </div>
          <div className="flex gap-4">
            <div className="h-12 w-80 rounded-full bg-white" />
            <div className="h-12 w-40 rounded-[18px] bg-white" />
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
          <div className="rounded-[28px] bg-white p-8">
            <div className="h-8 w-56 rounded-full bg-[#eef1f6]" />
            <div className="mt-8 grid grid-cols-7 gap-3">
              {Array.from({ length: 42 }).map((_, index) => (
                <div key={index} className="h-[84px] rounded-[20px] bg-[#f5f6fa]" />
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <div className="rounded-[24px] bg-white p-6">
              <div className="h-4 w-40 rounded-full bg-[#eef1f6]" />
              <div className="mt-4 h-8 w-56 rounded-full bg-[#eef1f6]" />
            </div>
            <div className="rounded-[24px] bg-white p-6">
              <div className="h-4 w-32 rounded-full bg-[#eef1f6]" />
              <div className="mt-5 h-28 rounded-[20px] bg-[#f5f6fa]" />
            </div>
            <div className="rounded-[24px] bg-white p-6">
              <div className="h-4 w-36 rounded-full bg-[#eef1f6]" />
              <div className="mt-5 h-24 rounded-[20px] bg-[#f5f6fa]" />
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="h-64 rounded-[24px] bg-white" />
          <div className="grid gap-8 md:grid-cols-2">
            <div className="h-64 rounded-[24px] bg-white" />
            <div className="h-64 rounded-[24px] bg-white" />
          </div>
        </div>
      </div>
    </main>
  );
}
