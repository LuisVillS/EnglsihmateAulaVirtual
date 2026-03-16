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
        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
      >
        Crear alumno
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
