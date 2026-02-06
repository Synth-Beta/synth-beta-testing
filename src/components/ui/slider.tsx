import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  trackClassName?: string
  rangeClassName?: string
  thumbClassName?: string
  /**
   * Explicit sizing to avoid iOS/WebView rendering the thumb/track as an oval.
   * Keep these numeric so we can derive corner radius precisely.
   */
  trackHeightPx?: number
  trackCornerRadiusPx?: number
  thumbSizePx?: number
  thumbCornerRadiusPx?: number
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      trackClassName,
      rangeClassName,
      thumbClassName,
      trackHeightPx = 8,
      trackCornerRadiusPx,
      thumbSizePx = 20,
      thumbCornerRadiusPx,
      ...props
    },
    ref
  ) => {
    const resolvedTrackCornerRadius = trackCornerRadiusPx ?? trackHeightPx / 2
    const resolvedThumbCornerRadius = thumbCornerRadiusPx ?? thumbSizePx / 2

    return (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track
      style={{
        height: trackHeightPx,
        borderRadius: resolvedTrackCornerRadius,
      }}
      className={cn(
        "relative h-2 w-full grow overflow-hidden rounded-full bg-secondary",
        trackClassName
      )}
    >
      <SliderPrimitive.Range
        style={{ borderRadius: resolvedTrackCornerRadius }}
        className={cn("absolute h-full bg-primary", rangeClassName)}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      // iOS Safari/WebView can occasionally render the thumb as an oval when
      // it ends up in a scaled/rounded transform context. Force a square box.
      style={{
        width: thumbSizePx,
        height: thumbSizePx,
        aspectRatio: "1 / 1",
        borderRadius: resolvedThumbCornerRadius,
      }}
      className={cn(
        "block shrink-0 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        thumbClassName
      )}
    />
  </SliderPrimitive.Root>
    )
  }
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
