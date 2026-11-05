import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  NEWSLETTER_COLOR_PREVIEW_OPTIONS,
  NewsletterColorPreviewMode,
  applyNewsletterColorPreviewMode,
  ensureNewsletterDarkModeHead,
} from "@/lib/newsletterEmailDarkMode";

type NewsletterColorPreviewProps = {
  html: string;
  title?: string;
  height?: number;
  width?: number | string;
  className?: string;
};

export default function NewsletterColorPreview({
  html,
  title = "Newsletter preview",
  height = 760,
  width = "100%",
  className,
}: NewsletterColorPreviewProps) {
  const [mode, setMode] = useState<NewsletterColorPreviewMode>("light");
  const selected = NEWSLETTER_COLOR_PREVIEW_OPTIONS.find((option) => option.id === mode)
    ?? NEWSLETTER_COLOR_PREVIEW_OPTIONS[0];

  const srcDoc = useMemo(
    () => applyNewsletterColorPreviewMode(ensureNewsletterDarkModeHead(html), mode),
    [html, mode]
  );

  return (
    <div className={className ?? "space-y-3"}>
      <div className="flex flex-wrap gap-2">
        {NEWSLETTER_COLOR_PREVIEW_OPTIONS.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={mode === option.id ? "default" : "outline"}
            onClick={() => setMode(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Alert variant={selected.simulated ? "default" : "default"}>
        <AlertTitle>
          {selected.simulated ? "Simulated client remapping" : "Intended appearance"}
        </AlertTitle>
        <AlertDescription>{selected.hint}</AlertDescription>
      </Alert>
      <div
        className="mx-auto overflow-hidden rounded-md border"
        style={{
          width,
          background: mode === "light" ? "#F5F5F5" : "#1C1B1F",
        }}
      >
        <iframe
          title={`${title} (${selected.label})`}
          srcDoc={srcDoc}
          className="w-full"
          style={{ height, background: mode === "light" ? "#ffffff" : "#1C1B1F" }}
        />
      </div>
    </div>
  );
}
