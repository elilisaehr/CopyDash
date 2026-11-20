import { redirect } from "next/navigation";

// Old address, kept so existing links keep working.
export default function LegacyPage() {
  redirect("/projects");
}
