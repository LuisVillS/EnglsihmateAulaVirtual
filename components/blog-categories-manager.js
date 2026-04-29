"use client";

import { useActionState, useState } from "react";
import {
  createBlogCategoryAction,
  deleteBlogCategoryAction,
  updateBlogCategoryAction,
} from "@/app/admin/blog/actions";

const INITIAL_STATE = { success: false, error: null, message: null };

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export default function BlogCategoriesManager({ categories = [] }) {
  const [state, formAction, pending] = useActionState(createBlogCategoryAction, INITIAL_STATE);
  const [newCategory, setNewCategory] = useState({ name: "", slug: "", slugEdited: false });

  function updateNewCategoryName(name) {
    setNewCategory((current) => ({
      ...current,
      name,
      slug: current.slugEdited ? current.slug : slugify(name),
    }));
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_16px_32px_rgba(15,23,42,0.05)]">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_120px_auto]">
          <input
            name="name"
            placeholder="Category name"
            required
            value={newCategory.name}
            onChange={(event) => updateNewCategoryName(event.target.value)}
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
          />
          <input
            name="slug"
            placeholder="category-slug"
            required
            value={newCategory.slug}
            onChange={(event) =>
              setNewCategory((current) => ({
                ...current,
                slug: slugify(event.target.value),
                slugEdited: true,
              }))
            }
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
          />
          <input
            name="description"
            placeholder="Description"
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
          />
          <input
            name="sort_order"
            type="number"
            defaultValue="0"
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
          />
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#334155]">
            <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4" />
            Active
          </label>
        </div>
        {state?.error ? <p className="mt-3 text-sm text-[#b91c1c]">{state.error}</p> : null}
        {state?.message ? <p className="mt-3 text-sm text-[#047857]">{state.message}</p> : null}
        <button
          disabled={pending}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create category"}
        </button>
      </form>

      <div className="space-y-3">
        {categories.map((category) => (
          <form
            key={category.id}
            action={updateBlogCategoryAction}
            className="grid gap-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)] lg:grid-cols-[1fr_1fr_1.2fr_120px_auto_auto]"
          >
            <input type="hidden" name="id" value={category.id} />
            <input
              name="name"
              defaultValue={category.name || ""}
              required
              className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
            />
            <input
              name="slug"
              defaultValue={category.slug || ""}
              required
              className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
            />
            <input
              name="description"
              defaultValue={category.description || ""}
              className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
            />
            <input
              name="sort_order"
              type="number"
              defaultValue={category.sort_order || 0}
              className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#103474]"
            />
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#334155]">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(category.is_active)} className="h-4 w-4" />
              Active
            </label>
            <div className="flex gap-2">
              <button className="rounded-2xl border border-[rgba(16,52,116,0.18)] px-4 text-sm font-semibold text-[#103474]">
                Save
              </button>
              <button
                formAction={deleteBlogCategoryAction}
                className="rounded-2xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-4 text-sm font-semibold text-[#b91c1c]"
              >
                Delete
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
