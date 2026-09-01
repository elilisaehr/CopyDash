// Mocked AI layer.
//
// The original prototype called `window.claude.complete(prompt)` (only
// available inside the Claude Design tool). Per the product decision for
// this build, real LLM calls are stubbed out here so the UI/UX (loading
// states, streaming-feel delays, JSON contracts) stays intact and this
// is the SINGLE place to wire up a real provider later — e.g. a Server
// Action that calls the Anthropic Messages API with the same prompts
// used below, returning the same shapes.

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TEMPLATES: Record<string, (subject: string) => string> = {
  hero_headline: (s) => `${s} — built for people who expect more`,
  hero_subtitle: (s) => `Everything ${s} needs to look professional online, without the back-and-forth.`,
  cta_primary: () => "Get Started",
  about_title: (s) => `Why choose ${s}`,
  about_body: (s) =>
    `${s} has spent years perfecting a craft that shows in every detail. We combine thoughtful design with dependable service, so you get results you can trust — delivered on time, every time.`,
  footer_tagline: (s) => `Built with care by ${s}.`,
};

function subjectFrom(projectName: string) {
  return projectName.split(" ")[0];
}

/** Mocked whole-page AI fill (replaces the "extract from PDF" Claude call). */
export async function mockGeneratePageContent(
  fieldIds: string[],
  projectName: string,
  pageName: string,
  sourceText?: string | null,
): Promise<{ id: string; content: string }[]> {
  await delay(1400 + Math.random() * 900);
  const subject = subjectFrom(projectName);
  const hint = sourceText ? sourceText.slice(0, 60).trim() : "";
  return fieldIds.map((id) => {
    const base = TEMPLATES[id]?.(subject) ?? `${pageName} content for ${subject}`;
    return { id, content: hint ? `${base}` : base };
  });
}

/** Mocked per-field AI suggestion popover (Improve / Shorten / etc). */
export async function mockGenerateFieldSuggestions(
  actionLabel: string,
  currentText: string,
  fieldLabel: string,
  maxChars: number,
): Promise<{ id: number; text: string }[]> {
  await delay(900 + Math.random() * 700);
  const base = currentText || `${fieldLabel} copy`;
  const variants = [
    `${base}${actionLabel.toLowerCase().includes("short") ? "" : " — refined for clarity and impact"}`,
    `${base.split(".")[0]}.`,
    `Discover ${base.toLowerCase()}`,
  ];
  return variants
    .map((t, i) => ({ id: i, text: t.slice(0, maxChars) }))
    .filter((v, i, arr) => arr.findIndex((x) => x.text === v.text) === i);
}
