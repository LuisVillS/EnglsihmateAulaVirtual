"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  deleteBlogPostAction,
  publishBlogPostAction,
  unpublishBlogPostAction,
} from "@/app/admin/blog/actions";
import AppModal from "@/components/app-modal";

const MENU_WIDTH = 230;
const MENU_MARGIN = 8;

function calculateMenuPosition(rect, menuHeight = 190) {
  if (!rect) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = rect.right - MENU_WIDTH;
  if (left < 12) left = 12;
  if (left + MENU_WIDTH > viewportWidth - 12) {
    left = viewportWidth - MENU_WIDTH - 12;
  }

  let top = rect.bottom + MENU_MARGIN;
  if (top + menuHeight > viewportHeight - 12) {
    top = Math.max(12, rect.top - menuHeight - MENU_MARGIN);
  }

  return { top, left };
}

function MenuSubmitButton({ children, action, postId, className = "" }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={postId} />
      <button
      type="submit"
      className={`block w-full rounded-xl px-3 py-2 text-left text-[#0f172a] transition hover:bg-[#f8fbff] ${className}`}
      >
        {children}
      </button>
    </form>
  );
}

export default function BlogPostRowActions({ post }) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const anchorRectRef = useRef(null);
  const postId = post?.id || "";
  const isPublished = post?.status === "published";

  const closeMenu = () => {
    setOpen(false);
    setMenuStyle(null);
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu();
      return;
    }
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    anchorRectRef.current = rect;
    setMenuStyle(calculateMenuPosition(rect));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") closeMenu();
    }

    function handleViewportChange() {
      closeMenu();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !anchorRectRef.current) return;
    const nextStyle = calculateMenuPosition(anchorRectRef.current, menuRef.current.offsetHeight || 190);
    if (nextStyle && (nextStyle.top !== menuStyle?.top || nextStyle.left !== menuStyle?.left)) {
      setMenuStyle(nextStyle);
    }
  }, [open, menuStyle]);

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: MENU_WIDTH,
              zIndex: 10000,
            }}
            className="rounded-2xl border border-border bg-surface p-2 text-sm text-foreground shadow-2xl shadow-black/35"
          >
            <Link
              href={`/admin/blog/${postId}`}
              prefetch={false}
              onClick={closeMenu}
              className="block rounded-xl px-3 py-2 text-[#0f172a] transition hover:bg-[#f8fbff]"
            >
              Edit post
            </Link>

            {isPublished ? (
              <Link
                href={`/blog/${post?.slug || ""}`}
                target="_blank"
                prefetch={false}
                onClick={closeMenu}
                className="block rounded-xl px-3 py-2 text-[#0f172a] transition hover:bg-[#f8fbff]"
              >
                Visit live blog
              </Link>
            ) : null}

            {!isPublished ? (
              <MenuSubmitButton action={publishBlogPostAction} postId={postId}>
                Publish
              </MenuSubmitButton>
            ) : (
              <MenuSubmitButton action={unpublishBlogPostAction} postId={postId}>
                Unpublish
              </MenuSubmitButton>
            )}

            <button
              type="button"
              className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.08)]"
              onClick={() => {
                closeMenu();
                setDeleteOpen(true);
              }}
            >
              Delete post...
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        onClick={toggleMenu}
        ref={buttonRef}
        className="rounded-xl border border-[rgba(15,23,42,0.1)] p-2 text-[#64748b] transition hover:border-[rgba(16,52,116,0.22)] hover:bg-[#f8fbff] hover:text-[#103474]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Blog post actions"
      >
        <span className="text-lg leading-none">{"\u22EE"}</span>
      </button>
      {menu}
      <AppModal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete blog post" widthClass="max-w-xl">
        <div className="space-y-4">
          <p className="text-sm text-[#475569]">
            This permanently deletes <span className="font-semibold">{post?.title || "this post"}</span>. This does not
            affect categories or subscribers.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancel
            </button>
            <form action={deleteBlogPostAction}>
              <input type="hidden" name="id" value={postId} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#b91c1c] px-4 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
              >
                Confirm delete
              </button>
            </form>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
