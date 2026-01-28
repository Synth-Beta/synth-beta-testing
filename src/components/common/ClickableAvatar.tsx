import React, { useMemo, useState } from "react"

import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { FullScreenImageModal } from "@/components/modals/FullScreenImageModal"

export interface ClickableAvatarProps {
  src: string
  alt: string
  className?: string
  imageClassName?: string
}

export const ClickableAvatar: React.FC<ClickableAvatarProps> = ({
  src,
  alt,
  className,
  imageClassName,
}) => {
  const [open, setOpen] = useState(false)
  const isClickable = useMemo(() => !!src, [src])

  return (
    <>
      <Avatar
        className={cn(className)}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={() => {
          if (isClickable) setOpen(true)
        }}
        onKeyDown={(e) => {
          if (!isClickable) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <AvatarImage src={src} alt={alt} className={cn(imageClassName)} clickable={false} />
      </Avatar>

      {isClickable && (
        <FullScreenImageModal open={open} onOpenChange={setOpen} src={src} alt={alt} />
      )}
    </>
  )
}

