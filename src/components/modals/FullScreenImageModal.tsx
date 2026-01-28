import React, { useEffect, useState } from "react"
import { X } from "lucide-react"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import synthPlaceholderAvatar from "@src/assets/Synth_Placeholder.png"

export interface FullScreenImageModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  src: string
  alt?: string
}

/**
 * Back-compat helper used by `AvatarImage` (and potentially other call sites).
 * Makes any child node clickable to open a full-screen image modal.
 */
interface ClickableImageProps {
  imageUrl: string | null | undefined
  alt?: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export const ClickableImage: React.FC<ClickableImageProps> = ({
  imageUrl,
  alt,
  children,
  className,
  onClick,
}) => {
  const [open, setOpen] = useState(false)
  const isClickable = !!imageUrl && imageUrl !== synthPlaceholderAvatar

  return (
    <>
      <div
        className={className}
        style={{ cursor: isClickable ? "pointer" : "default" }}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (onClick) onClick()
          else if (isClickable) setOpen(true)
        }}
        onKeyDown={(e) => {
          if (!isClickable) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }
        }}
        aria-label={isClickable ? `View ${alt || "image"} in full screen` : undefined}
      >
        {children}
      </div>
      {isClickable && imageUrl && (
        <FullScreenImageModal open={open} onOpenChange={setOpen} src={imageUrl} alt={alt} />
      )}
    </>
  )
}

export const FullScreenImageModal: React.FC<FullScreenImageModalProps> = ({
  open,
  onOpenChange,
  src,
  alt,
}) => {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="fixed inset-0 p-0 border-0 rounded-none"
        style={{
          left: 0,
          top: 0,
          transform: "none",
          width: "100vw",
          height: "100vh",
          maxWidth: "100vw",
          maxHeight: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.9)",
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
          padding: 0,
        }}
      >
        <div className="px-[20px] py-[20px] h-full flex items-center justify-center">
          <div className="relative">
            <img
              src={src}
              alt={alt || ""}
              className="max-h-[calc(100vh-40px)] max-w-[calc(100vw-40px)] w-auto h-auto object-contain"
              draggable={false}
            />
            <button
              type="button"
              aria-label="Close image"
              onClick={() => onOpenChange(false)}
              className="absolute -top-[6px] right-0 translate-y-[-100%] h-11 w-11 rounded-full bg-white flex items-center justify-center text-neutral-900"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default FullScreenImageModal
