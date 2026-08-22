"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 text-black" />,
        info: <InfoIcon className="size-5 text-black" />,
        warning: <TriangleAlertIcon className="size-5 text-black" />,
        error: <OctagonXIcon className="size-5 text-black" />,
        loading: <Loader2Icon className="size-5 animate-spin text-black" />,
      }}
      style={
        {
          "--normal-bg": "#e5e7eb",
          "--normal-text": "#111827",
          "--normal-border": "#d1d5db",
          "--error-bg": "#e5e7eb",
          "--error-text": "#111827",
          "--error-border": "#d1d5db",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
