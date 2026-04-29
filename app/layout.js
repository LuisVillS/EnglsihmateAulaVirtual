import { Montserrat, Poppins } from "next/font/google";
import "./globals.css";
import "flag-icon-css/css/flag-icons.min.css";
import { ensureDefaultAdminUser } from "@/lib/default-admin";
import FormErrorFocus from "@/components/form-error-focus";

const bodyFont = Poppins({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const headingFont = Montserrat({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata = {
  title: "Aula Virtual",
  description: "Login, administracion basica de cursos y alumnos con Supabase.",
};

export default async function RootLayout({ children }) {
  await ensureDefaultAdminUser();
  return (
    <html lang="es">
      <body
        suppressHydrationWarning
        className={`${bodyFont.variable} ${headingFont.variable} bg-background text-foreground antialiased`}
      >
        <FormErrorFocus />
        {children}
      </body>
    </html>
  );
}
