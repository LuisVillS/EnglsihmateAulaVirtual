"use client";

export default function CrmAutoSubmitSelect({
  form,
  className = "",
  children,
  ...props
}) {
  return (
    <select
      {...props}
      form={form}
      className={className}
      onChange={(event) => {
        event.currentTarget.form?.requestSubmit();
      }}
    >
      {children}
    </select>
  );
}
