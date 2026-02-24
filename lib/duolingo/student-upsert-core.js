function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeStudentCodeCore(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

export function normalizeIdDocumentCore(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

export function resolveExistingStudentRecord({ studentCode, idDocument, records }) {
  const code = normalizeStudentCodeCore(studentCode);
  const doc = normalizeIdDocumentCore(idDocument);
  const list = Array.isArray(records) ? records : [];

  const byCode = code ? list.find((row) => normalizeStudentCodeCore(row?.student_code) === code) : null;
  if (byCode) return byCode;

  const byDoc = doc
    ? list.find(
        (row) =>
          normalizeIdDocumentCore(row?.id_document || row?.dni) === doc
      )
    : null;

  return byDoc || null;
}

export function shouldUpdateStudentProfile({ existing, incoming }) {
  const currentCode = normalizeStudentCodeCore(existing?.student_code);
  const nextCode = normalizeStudentCodeCore(incoming?.studentCode);
  const currentDoc = normalizeIdDocumentCore(existing?.id_document || existing?.dni);
  const nextDoc = normalizeIdDocumentCore(incoming?.idDocument);
  const currentName = cleanText(existing?.full_name);
  const nextName = cleanText(incoming?.fullName);

  return (
    (nextCode && nextCode !== currentCode) ||
    (nextDoc && nextDoc !== currentDoc) ||
    (nextName && nextName !== currentName)
  );
}

