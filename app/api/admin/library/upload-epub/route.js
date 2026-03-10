import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { deleteObjectFromR2, getLibraryR2Bucket, putObjectToR2 } from "@/lib/r2";

function sanitizeFileName(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLibraryManualUploadKey({ scope = "manual", entityKey = "", fileName = "" } = {}) {
  const safeScope = ["candidate", "staging", "book", "manual"].includes(String(scope || "").trim().toLowerCase())
    ? String(scope || "").trim().toLowerCase()
    : "manual";
  const safeEntityKey = sanitizeFileName(String(entityKey || "").trim()) || "book";
  const safeFileName = sanitizeFileName(String(fileName || "").trim()) || "book.epub";

  if (safeScope === "book") {
    return `library/books/${safeEntityKey}/${safeFileName}`;
  }

  return `library/manual-uploads/${safeScope}/${safeEntityKey}/${safeFileName}`;
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "EPUB file is required." }, { status: 400 });
    }

    const fileName = sanitizeFileName(file.name || "book.epub");
    if (!fileName.endsWith(".epub")) {
      return NextResponse.json({ error: "Only .epub files are allowed." }, { status: 400 });
    }

    const contentType = file.type || "application/epub+zip";
    const fileBytes = Buffer.from(await file.arrayBuffer());
    const scope = String(formData.get("scope") || "manual").trim();
    const entityKey =
      String(formData.get("entityKey") || formData.get("entityId") || "").trim() || fileName.replace(/\.epub$/i, "");
    const key = buildLibraryManualUploadKey({ scope, entityKey, fileName });

    await putObjectToR2(key, fileBytes, contentType, getLibraryR2Bucket());

    return NextResponse.json({
      uploadedEpub: {
        key,
        fileName: file.name || fileName,
        contentType,
        bytes: fileBytes.length,
      },
    });
  } catch (error) {
    console.error("POST /api/admin/library/upload-epub failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo subir el EPUB." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const key = String(body?.key || "").trim();
    if (!key) {
      return NextResponse.json({ error: "Upload key is required." }, { status: 400 });
    }

    await deleteObjectFromR2(key, getLibraryR2Bucket());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/library/upload-epub failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo eliminar el EPUB." },
      { status: 500 }
    );
  }
}
