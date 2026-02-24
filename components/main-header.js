"use client";

import UserAvatarMenu from "@/components/user-avatar-menu";

export default function MainHeader({ title, user, onOpenSidebar }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#1F202E]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 md:hidden"
          aria-label="Abrir menu"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">Aula virtual</p>
          <h1 className="truncate text-2xl font-semibold text-white">{title}</h1>
        </div>
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="relative w-full max-w-md">
            <input
              type="search"
              placeholder="Buscar clases, recursos o temas"
              className="w-full rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/60">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/75 md:flex lg:hidden">
            <span className="h-2 w-2 rounded-full bg-success" />
            En linea
          </div>
          <UserAvatarMenu name={user?.name} email={user?.email} avatarUrl={user?.avatarUrl} />
        </div>
      </div>
      <div className="px-6 pb-4 lg:hidden">
        <input
          type="search"
          placeholder="Buscar clases, recursos o temas"
          className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </header>
  );
}
