"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StudentForm from "@/components/student-form";
import AppModal from "@/components/app-modal";

export default function AdminStudentCreateModal({ commissions = [] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
      >
        + Crear alumno
      </button>

      <AppModal open={open} onClose={() => setOpen(false)} title="Crear alumno" widthClass="max-w-3xl">
        <StudentForm
          commissions={commissions}
          embedded
          showBackLink={false}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </AppModal>
    </>
  );
}

