"use client";

import { usePathname } from "next/navigation";
import UserAvatarMenu from "@/components/user-avatar-menu";
import { getStudentRouteMeta } from "@/lib/student-navigation";

function HeaderButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-white text-[#103474] transition hover:border-[rgba(16,52,116,0.2)] hover:bg-[#f8faff]"
    >
      {children}
    </button>
  );
}

export default function MainHeader({ title, user, onToggleSidebar, compact = false, studentUiLanguage = "es" }) {
  const pathname = usePathname();
  const routeMeta = getStudentRouteMeta(pathname, title, studentUiLanguage);

  return (
    <header className="safe-area-top sticky top-0 z-30 border-b border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.94)] backdrop-blur-xl">
      <div className={`safe-area-x flex items-center justify-between gap-3 px-4 ${compact ? "py-2.5" : "py-3 sm:px-5"}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <HeaderButton label={studentUiLanguage === "en" ? "Toggle sidebar" : "Alternar menú lateral"} onClick={onToggleSidebar}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="5" width="4.5" height="14" rx="1.2" />
              <path d="M12 7h8M12 12h8M12 17h8" />
            </svg>
          </HeaderButton>

          <h1 className={`truncate font-semibold text-[#111827] ${compact ? "text-[15px]" : "text-[15px] sm:text-base"}`}>
            {routeMeta.title}
          </h1>
        </div>

        <div className="flex items-center">
          <UserAvatarMenu name={user?.name} email={user?.email} avatarUrl={user?.avatarUrl} />
        </div>
      </div>
    </header>
  );
}
