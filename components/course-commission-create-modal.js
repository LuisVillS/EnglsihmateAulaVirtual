"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CourseForm from "@/app/admin/courses/course-form";
import { upsertCommission } from "@/app/admin/actions";
import AppModal from "@/components/app-modal";

export default function CourseCommissionCreateModal() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
      >
        + Crear comision
      </button>

      <AppModal open={open} onClose={() => setOpen(false)} title="Crear comision" widthClass="max-w-2xl">
        <CourseForm
          action={upsertCommission}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </AppModal>
    </>
  );
}

