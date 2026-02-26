"use client";

import { useEffect } from "react";

function focusField(target) {
  if (!(target instanceof HTMLElement)) return;
  if (target.hasAttribute("disabled")) return;
  if (target.getAttribute("aria-hidden") === "true") return;

  requestAnimationFrame(() => {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  });
}

export default function FormErrorFocus() {
  useEffect(() => {
    const handleInvalid = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      focusField(target);
    };

    const handleSubmit = (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.checkValidity()) return;
      const firstInvalid = form.querySelector(":invalid");
      if (firstInvalid instanceof HTMLElement) {
        focusField(firstInvalid);
      }
    };

    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  return null;
}
