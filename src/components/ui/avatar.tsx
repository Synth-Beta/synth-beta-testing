import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"
import synthPlaceholderAvatar from "@src/assets/Synth_Placeholder.png"
import { ClickableImage } from "@/components/modals/FullScreenImageModal"

// Single source of truth for placeholder avatars (used for users, artists, venues, etc.)
const SYNTH_PLACEHOLDER_AVATAR_SRC = synthPlaceholderAvatar

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    clickable?: boolean; // If true, clicking the avatar opens full screen modal
  }
>(({ className, clickable, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & {
    clickable?: boolean; // If true, clicking the image opens full screen modal (default: true for non-placeholder images)
  }
>(({ className, alt, onError, src, clickable = true, ...props }, ref) => {
  const imageSrc = src || SYNTH_PLACEHOLDER_AVATAR_SRC;
  const isPlaceholder = !src || imageSrc === SYNTH_PLACEHOLDER_AVATAR_SRC;
  
  const avatarImage = (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      alt={alt || "User profile picture"}
      src={imageSrc}
      onError={(e) => {
        // Ensure any missing/broken avatar shows Synth placeholder.
        const img = e.currentTarget as HTMLImageElement
        if (img?.src && img.src.endsWith(SYNTH_PLACEHOLDER_AVATAR_SRC)) {
          onError?.(e)
          return
        }
        img.src = SYNTH_PLACEHOLDER_AVATAR_SRC
        onError?.(e)
      }}
      {...props}
    />
  );

  // If clickable and not placeholder, wrap in ClickableImage
  if (clickable && !isPlaceholder) {
    return (
      <ClickableImage imageUrl={imageSrc} alt={alt || "User profile picture"}>
        {avatarImage}
      </ClickableImage>
    );
  }

  return avatarImage;
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
