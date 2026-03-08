import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { getAdminLibraryBookById } from "@/lib/library/repository";
import { patchLibraryBook } from "@/lib/library/admin";

export async function GET(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const book = await getAdminLibraryBookById({
      db: auth.db,
      id: params?.id,
    });

    if (!book?.id) {
      return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
    }

    return NextResponse.json({ book });
  } catch (error) {
    console.error("GET /api/admin/library/books/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar el libro." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const body = await request.json().catch(() => ({}));
    const book = await patchLibraryBook({
      db: auth.db,
      id: params?.id,
      changes: body || {},
    });

    return NextResponse.json({ book });
  } catch (error) {
    console.error("PATCH /api/admin/library/books/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar el libro." },
      { status: 500 }
    );
  }
}

