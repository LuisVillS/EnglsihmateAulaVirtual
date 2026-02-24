import { redirect } from "next/navigation";

export const metadata = {
  title: "Course Content Editor | Admin",
};

export default function CourseEditorPage() {
  redirect("/admin/courses/templates");
}
