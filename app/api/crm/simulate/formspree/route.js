import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      error: "Formspree simulation is deprecated. Use the internal WebForm simulation instead.",
    },
    { status: 410 }
  );
}
