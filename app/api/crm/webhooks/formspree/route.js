import { NextResponse } from "next/server";

function buildDeprecatedResponse() {
  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      error: "Formspree ingestion is deprecated. Use the internal /api/leads/submit pipeline instead.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return buildDeprecatedResponse();
}

export async function POST() {
  return buildDeprecatedResponse();
}
