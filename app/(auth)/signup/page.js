import { redirect } from "next/navigation";

export const metadata = {
  title: "Acceso privado",
};

export default function SignupPage() {
  redirect("/");
}
