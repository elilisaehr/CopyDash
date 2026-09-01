import { HelpSupportScreen } from "@/components/screens/help-support-screen";

// PMs always see the static "CopyDash Support" contact card — no query needed.
export default function PmHelpPage() {
  return <HelpSupportScreen role="pm" />;
}
