import { notFound } from "next/navigation";
import { PdfLab } from "./pdf-lab";

// Local test bench for the PDF → reconstructed page extraction. Never served in production.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PdfLab />;
}
