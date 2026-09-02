import { Image, Skeleton } from "antd";
import { MagnifyingGlassPlus } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function PreviewableImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) return <span className="previewable-image-empty" aria-label={alt} />;
  return (
    <span className="previewable-image-boundary" onClick={(event) => event.stopPropagation()}>
      <Image
        rootClassName={["previewable-image", className].filter(Boolean).join(" ")}
        src={src}
        alt={alt}
        placeholder={<Skeleton.Image active />}
        preview={{ cover: <span className="previewable-image-mask"><MagnifyingGlassPlus size={16} />预览</span> }}
      />
    </span>
  );
}

export function PreviewableImageGroup({ children }: { children: ReactNode }) {
  return <Image.PreviewGroup>{children}</Image.PreviewGroup>;
}
