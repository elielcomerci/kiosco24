import type { CSSProperties } from "react";
import {
  APP_NAME,
  BRAND_ICON_SRC,
  BRAND_WORDMARK_BLUE_SRC,
  BRAND_WORDMARK_WHITE_SRC,
} from "@/lib/brand";

const LOGO_SPECS = {
  icon: {
    src: BRAND_ICON_SRC,
    width: 512,
    height: 512,
  },
  wordmark: {
    blue: {
      src: BRAND_WORDMARK_BLUE_SRC,
      width: 512,
      height: 161,
    },
    white: {
      src: BRAND_WORDMARK_WHITE_SRC,
      width: 512,
      height: 161,
    },
  },
} as const;

type BrandLogoProps = {
  tone?: "blue" | "white";
  kind?: "icon" | "wordmark";
  width?: number;
  height?: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
};

export default function BrandLogo({
  tone = "blue",
  kind = "wordmark",
  width,
  height,
  alt = APP_NAME,
  className,
  style,
}: BrandLogoProps) {
  const spec =
    kind === "icon"
      ? LOGO_SPECS.icon
      : tone === "white"
        ? LOGO_SPECS.wordmark.white
        : LOGO_SPECS.wordmark.blue;
  const resolvedWidth = width ?? (kind === "icon" ? 56 : 164);
  const resolvedHeight = height ?? Math.round((resolvedWidth * spec.height) / spec.width);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spec.src}
      alt={alt}
      width={resolvedWidth}
      height={resolvedHeight}
      className={className}
      style={{
        display: "block",
        width: resolvedWidth,
        height: height ?? "auto",
        ...style,
      }}
    />
  );
}
