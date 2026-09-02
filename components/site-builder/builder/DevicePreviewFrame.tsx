"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fitPreviewScale, PREVIEW_DEVICE_PRESETS, type PreviewDevice } from "./preview-device";

const FRAME_DOCUMENT = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      html, body, #site-preview-root { min-height: 100%; margin: 0; }
      body { overflow: auto; }
    </style>
  </head>
  <body><div id="site-preview-root"></div></body>
</html>`;

function copyApplicationStyles(target: Document) {
  document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style').forEach(
    (node) => target.head.appendChild(node.cloneNode(true)),
  );
}

/**
 * A real browser viewport for responsive Preview mode.
 *
 * Shrinking a normal div does not change CSS media queries: Tailwind would
 * still see the dashboard window's width. An iframe gives the server-rendered
 * page its own viewport while a React portal keeps the current unsaved canvas
 * tree interactive and up to date.
 */
export default function DevicePreviewFrame({
  device,
  hostRef,
  onClick,
  children,
}: {
  device: PreviewDevice;
  hostRef: React.RefObject<HTMLDivElement | null>;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const preset = PREVIEW_DEVICE_PRESETS[device];
  const stageRef = useRef<HTMLDivElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const resize = () => {
      setScale(
        fitPreviewScale(stage.clientWidth, stage.clientHeight, preset.width, preset.height),
      );
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [preset.height, preset.width]);

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 items-start justify-center overflow-hidden p-4"
      data-preview-device={device}
    >
      <div
        className="relative shrink-0"
        style={{ width: preset.width * scale, height: preset.height * scale }}
      >
        <iframe
          key={device}
          title={`${preset.label} website preview`}
          srcDoc={FRAME_DOCUMENT}
          onLoad={(event) => {
            const frameDocument = event.currentTarget.contentDocument;
            if (!frameDocument) return;
            copyApplicationStyles(frameDocument);
            setMountNode(frameDocument.getElementById("site-preview-root"));
          }}
          className="absolute left-0 top-0 origin-top-left border-0 bg-white shadow-[0_18px_50px_-30px_rgb(0_0_0_/_0.45)] ring-1 ring-black/10"
          style={{
            width: preset.width,
            height: preset.height,
            transform: `scale(${scale})`,
          }}
        />

        {!mountNode && (
          <div className="absolute inset-0 animate-pulse bg-white/80" aria-label="Loading preview" />
        )}
      </div>

      {mountNode &&
        createPortal(
          <div ref={hostRef} onClick={onClick}>
            {children}
          </div>,
          mountNode,
        )}
    </div>
  );
}
