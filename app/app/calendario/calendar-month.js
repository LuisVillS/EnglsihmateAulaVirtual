"use client";

import { useMemo } from "react";
import { buildMonthCells, formatMonthTitle } from "./calendar-utils";

const WEEK_DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m14.5 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9.5 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CalendarMonth({
  visibleMonth,
  selectedDate,
  todayDateKey,
  dayMetrics = new Map(),
  loading = false,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  onToday,
}) {
  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const title = useMemo(() => formatMonthTitle(visibleMonth), [visibleMonth]);

  return (
    <section className="rounded-[30px] bg-white px-4 py-5 shadow-[0_20px_60px_rgba(16,52,116,0.08)] sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[2rem] font-semibold tracking-[-0.045em] text-[#103474] sm:text-[2.25rem]">
          {title}
        </h2>
        <div className="flex items-center justify-end gap-1 text-[#103474]">
          <button
            type="button"
            onClick={onPrevMonth}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-[#eef4ff]"
            aria-label="Mes anterior"
          >
            <ArrowLeftIcon />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-base font-semibold transition hover:bg-[#eef4ff]"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-[#eef4ff]"
            aria-label="Mes siguiente"
          >
            <ArrowRightIcon />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-x-2 gap-y-2 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-[#535866] sm:mt-8 sm:text-[11px]">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-x-2 gap-y-2 sm:mt-4 sm:gap-x-3 sm:gap-y-1">
        {monthCells.map((cell) => {
          const metrics = dayMetrics.get(cell.dateKey) || { count: 0 };
          const hasEvents = metrics.count > 0;
          const isSelected = selectedDate === cell.dateKey;
          const isToday = todayDateKey === cell.dateKey;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => {
                if (!cell.inCurrentMonth || !onSelectDate) return;
                onSelectDate(cell.dateKey);
              }}
              className={`flex w-full min-h-[68px] flex-col items-center justify-center rounded-[20px] border text-center transition sm:min-h-[84px] lg:min-h-[100px] ${
                cell.inCurrentMonth
                  ? ""
                  : "cursor-default border-transparent bg-transparent text-[#c9cfdd]"
              } ${
                hasEvents && cell.inCurrentMonth ? "bg-[#eff6ff]" : ""
              } ${
                isSelected ? "border-[3px] border-[#103474] bg-[#eff6ff] shadow-[inset_0_0_0_1px_#103474]" : "border-transparent"
              } ${
                isToday && !isSelected ? "ring-2 ring-[#103474]/18 ring-offset-0" : ""
              }`}
            >
              <span
                className={`text-xl font-semibold leading-none sm:text-2xl ${
                  cell.inCurrentMonth ? "text-[#182033]" : "text-[#c9cfdd]"
                } ${isSelected || hasEvents ? "text-[#103474]" : ""}`}
                style={{ fontSize: "clamp(1rem, 1.4vw, 1.15rem)", fontWeight: 500 }}
              >
                {cell.dayNumber}
              </span>
              <span className="mt-2 h-2 w-2 rounded-full bg-[#103474] opacity-0 transition" style={{ opacity: hasEvents && cell.inCurrentMonth ? 1 : 0 }} />
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-[#6f7789]">Cargando clases del mes...</p>
      ) : null}
    </section>
  );
}
