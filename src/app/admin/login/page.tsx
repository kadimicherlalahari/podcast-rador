import { redirect } from "next/navigation";

// Admin pages are open (no login); keep old links working.
export default function LoginPage() {
  redirect("/admin/shows");
}
