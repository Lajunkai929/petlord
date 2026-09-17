import { Image, Skeleton } from "@petlord/ui";
import { MagnifyingGlassPlus } from "@phosphor-icons/react";
import { cloneElement, createContext, useCallback, useContext, useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { Artifact } from "@petlord/schema";

type RegisterImage = (src: string, pixelated: boolean, nativePixel?: Artifact["nativePixel"]) => () => void;
const PreviewImageRegistry = createContext<RegisterImage | undefined>(undefined);
function renderPreviewImage(node: ReactElement, pixelated: boolean, nativePixel?: Artifact["nativePixel"]) {
  const image = node as ReactElement<{ style?: CSSProperties; className?: string }>;
  const scale = nativePixel && typeof window !== "undefined"
    ? Math.max(1, Math.min(12, Math.floor(Math.min((window.innerWidth - 96) / nativePixel.width, (window.innerHeight - 160) / nativePixel.height))))
    : 1;
  const nativeSize: CSSProperties = pixelated ? {
    width: nativePixel ? nativePixel.width * scale : "min(70vw, 576px)",
    height: nativePixel ? nativePixel.height * scale : "min(70vh, 576px)",
    maxWidth: "calc(100vw - 96px)", maxHeight: "calc(100vh - 160px)",
  } : {};
  return cloneElement(image, { className: [image.props.className, pixelated ? "checkerboard" : undefined].filter(Boolean).join(" "), style: { ...image.props.style, ...nativeSize, imageRendering: pixelated ? "pixelated" : "auto", objectFit: "contain" } });
}

export function PreviewableImage({ src, alt, className, nativePixel, pixelated = false }: {
  src?: string;
  alt: string;
  className?: string;
  nativePixel?: Artifact["nativePixel"];
  pixelated?: boolean;
}) {
  const register = useContext(PreviewImageRegistry);
  const native = Boolean(nativePixel || pixelated);
  useEffect(() => src ? register?.(src, native, nativePixel) : undefined, [src, native, nativePixel, register]);
  if (!src) return <span className="previewable-image-empty" aria-label={alt} />;
  return (
    <span className="previewable-image-boundary" onClick={event => event.stopPropagation()}>
      <Image
        rootClassName={["previewable-image", className].filter(Boolean).join(" ")}
        width="100%"
        height="100%"
        styles={{ root: { display: "block", minWidth: 0, minHeight: 0 }, image: { display: "block", width: "100%", height: "100%", objectFit: "contain", imageRendering: native ? "pixelated" : "auto" } }}
        src={src}
        alt={alt}
        draggable={false}
        placeholder={<Skeleton.Image active />}
        preview={{ cover: <span className="previewable-image-mask"><MagnifyingGlassPlus size={16} />预览</span>, imageRender: node => renderPreviewImage(node, native, nativePixel) }}
      />
    </span>
  );
}

export function PreviewableImageGroup({ children }: { children: ReactNode }) {
  // A group renders its own portal; individual Image preview styles do not reach that portal.
  const entries = useRef(new Map<symbol, { src: string; pixelated: boolean; nativePixel?: Artifact["nativePixel"] }>());
  const register = useCallback<RegisterImage>((src, pixelated, nativePixel) => {
    const id = Symbol(src); entries.current.set(id, { src, pixelated, nativePixel });
    return () => { entries.current.delete(id); };
  }, []);
  return <PreviewImageRegistry.Provider value={register}><Image.PreviewGroup preview={{ imageRender: (node, { image }) => { const native = [...entries.current.values()].find(entry => entry.src === image.url && entry.pixelated); return renderPreviewImage(node, Boolean(native), native?.nativePixel); } }}>{children}</Image.PreviewGroup></PreviewImageRegistry.Provider>;
}
