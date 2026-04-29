"use server";

const CSV_TEMPLATE = `full_name,email,dni,phone,birth_date,course_level,start_month,enrollment_date,preferred_hour,modality
Demo A1,correo-a1@demo.com,12345678,51911111111,2000-01-01,BASICO A1,2026-03,2026-03-01,18:00,Diaria
Demo A2,correo-a2@demo.com,23456789,51922222222,2001-02-02,BASICO A2,2026-03,2026-03-02,19:00,Interdiaria (Lunes, Miercoles y Viernes)
Demo B1,correo-b1@demo.com,34567890,51933333333,2002-03-03,INTERMEDIO B1,2026-03,2026-03-03,20:00,Interdiaria (Martes y Jueves)
Demo B2,correo-b2@demo.com,45678901,51944444444,2003-04-04,INTERMEDIO B2,2026-03,2026-03-04,21:00,Sabatinos
Demo C1,correo-c1@demo.com,56789012,51955555555,2004-05-05,AVANZADO C1,2026-03,2026-03-05,08:00,Diaria
`;

export async function GET() {
  return new Response(CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"students-template.csv\"",
      "Cache-Control": "no-store",
    },
  });
}
