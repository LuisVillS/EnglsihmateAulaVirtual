"use client";

import { useMemo } from "react";
import { buildMonthCells, formatMonthTitle } from "./calendar-utils";

const WEEK_DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
}) {
  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const title = useMemo(() => formatMonthTitle(visibleMonth), [visibleMonth]);

  return (
    <>
      <section className="student-panel p-4 text-slate-800 lg:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onPrevMonth}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#103474] transition hover:bg-[#eef3fb]"
            aria-label="Mes anterior"
          >
            <ArrowLeftIcon />
          </button>
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          <button
            type="button"
            onClick={onNextMonth}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#103474] transition hover:bg-[#eef3fb]"
            aria-label="Mes siguiente"
          >
            <ArrowRightIcon />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-y-2 text-center text-[9px] uppercase tracking-[0.18em] text-slate-400">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-0.5">
              {day}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-y-1.5">
          {monthCells.map((cell) => {
            const metrics = dayMetrics.get(cell.dateKey) || { count: 0 };
            const hasEvents = metrics.count > 0;
            const isSelected = selectedDate === cell.dateKey;
            const isToday = todayDateKey === cell.dateKey;

            if (!cell.inCurrentMonth) {
              return <div key={cell.key} className="h-9" />;
            }

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  if (!onSelectDate) return;
                  onSelectDate(cell.dateKey);
                }}
                className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-sm font-medium transition ${
                    isSelected
                      ? "bg-[#103474] text-white"
                      : hasEvents
                        ? "bg-[#103474] text-white"
                        : "text-slate-800 hover:bg-slate-100"
                  } ${isToday && !isSelected ? "ring-2 ring-[#103474]/25 ring-offset-1 ring-offset-white" : ""}`}
                >
                  {cell.dayNumber}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="mt-3 text-center text-xs text-slate-500">Cargando clases del mes...</p>
        ) : null}
      </section>

      <section className="student-panel hidden p-4 text-slate-800 lg:block lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800 md:text-xl">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevMonth}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              aria-label="Mes anterior"
            >
              <ArrowLeftIcon />
            </button>
            <button
              type="button"
              onClick={onNextMonth}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              aria-label="Mes siguiente"
            >
              <ArrowRightIcon />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {monthCells.map((cell) => {
            const metrics = dayMetrics.get(cell.dateKey) || { count: 0 };
            const dotCount = Math.min(metrics.count, 3);
            const overflow = Math.max(0, metrics.count - 3);
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
                className={`relative flex h-[78px] flex-col justify-between rounded-[10px] border p-2 text-left transition md:h-[88px] ${
                  cell.inCurrentMonth
                    ? "border-slate-200 bg-white hover:bg-slate-50"
                    : "cursor-default border-slate-100 bg-slate-50 text-slate-400"
                } ${isToday ? "border-[#103474]/35 bg-[#f4f7fc]" : ""} ${isSelected ? "border-[#103474] bg-[#eef3fb] ring-1 ring-[#103474]/20" : ""}`}
              >
                <span className={`text-xs font-medium md:text-sm ${cell.inCurrentMonth ? "text-slate-700" : "text-slate-400"}`}>
                  {cell.dayNumber}
                </span>
                {metrics.count > 0 && cell.inCurrentMonth ? (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: dotCount }).map((_, idx) => (
                      <span key={`${cell.dateKey}-dot-${idx}`} className="h-1.5 w-1.5 rounded-full bg-[#103474]/75" />
                    ))}
                    {overflow > 0 ? (
                      <span className="ml-0.5 text-[10px] font-medium text-slate-500">+{overflow}</span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-300"> </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="mt-3 text-xs text-slate-500">Cargando clases del mes...</p>
        ) : null}
      </section>
    </>
  );
}
