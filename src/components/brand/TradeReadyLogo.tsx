import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * TradeReady AI logo.
 *
 * Renders the official logo from /public/tradeready-ai-logo-transparent.png
 * (the same artwork, but with the white background stripped to
 * transparency so no stray white square shows on dark / video
 * surfaces).
 *
 * Variants:
 *   - "full"        -> the full wordmark (mark + "TradeReady AI" +
 *                      tagline). For places with room for the whole
 *                      logo (e.g. the auth shell).
 *   - "workspace"   -> the full wordmark at a smaller size, for
 *                      headers and the workspace sidebar.
 *   - "mark"        -> the mark + wordmark only (tightly cropped to the
 *                      chart + "TradeReady AI" line; the tagline is
 *                      not shown). For the small mobile topbar.
 *
 * Tone:
 *   - "default"     -> light surface. Image shown with its native
 *                      colors over the parent's background.
 *   - "inverted"    -> on a dark / video surface. Because the white
 *                      has been stripped, we do NOT need a white
 *                      card anymore; the logo just renders directly
 *                      over the dark background. (Previously we wrapped
 *                      the image in a white pill, which produced the
 *                      large white square the user complained about.)
 */
interface TradeReadyLogoProps {
  className?: string;
  variant?: "full" | "workspace" | "mark";
  tone?: "default" | "inverted";
  alt?: string;
  /** Explicit rendered width (in pixels). Height is derived from the
   *  source's aspect ratio. */
  width?: number;
}

/** The transparent-logo PNG's bounding box is ~977 x 836, so the
 *  visible artwork is wider than it is tall. */
const LOGO_ASPECT = 977 / 836;

const SOURCE = "/tradeready-ai-logo-transparent.png";

export function TradeReadyLogo({
  className,
  variant = "full",
  tone = "default",
  alt = "TradeReady AI",
  width,
}: TradeReadyLogoProps) {
  // Default rendered width per variant. Each value was chosen so the
  // logo reads cleanly at the most common usage sites:
  //   - full:        auth shell (largest)           -> 150px
  //   - workspace:   home navbar / sidebar / footer ->  96px
  //   - mark:        mobile topbar (smallest)       ->  28px
  const defaultWidth =
    variant === "mark"
      ? 28
      : variant === "workspace"
        ? 96
        : 150;

  const renderedWidth = width ?? defaultWidth;
  const renderedHeight = Math.round(renderedWidth / LOGO_ASPECT);

  // The transparent PNG already includes all the artwork padding, so
  // object-contain keeps the wordmark centered in the box.
  const img = (
    <Image
      src={SOURCE}
      alt={alt}
      width={977}
      height={836}
      priority
      className="h-full w-full object-contain"
    />
  );

  const wrapperBase = cn("inline-flex shrink-0", className);

  // The transparent-background PNG renders cleanly over any surface, so
  // we do not add a white plate in either tone. The only difference
  // between "default" and "inverted" is which PNG / size is used --
  // the wrappers themselves are identical.
  return (
    <span
      className={wrapperBase}
      style={{ width: renderedWidth, height: renderedHeight }}
    >
      {img}
    </span>
  );
}
