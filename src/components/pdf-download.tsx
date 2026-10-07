import { Download } from "lucide-react";
import { buttonClasses, type ButtonVariant } from "@/components/button";

/** A button-styled link that downloads a book's PDF. */
export function PdfDownload({
  pdf,
  title,
  variant = "secondary",
  className,
}: {
  pdf: { href: string };
  title: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <a
      href={pdf.href}
      download
      aria-label={`Download ${title} as a PDF`}
      className={buttonClasses({ variant, className })}
    >
      <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
      Download PDF
    </a>
  );
}
