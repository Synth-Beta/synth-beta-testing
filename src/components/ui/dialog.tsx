import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[9999] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    style={{
      backgroundColor: 'var(--overlay-50, rgba(14, 14, 14, 0.5))',
      ...props.style
    }}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideCloseButton?: boolean }
>(({ className, children, hideCloseButton = false, style, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-[9999] grid gap-4 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg overflow-hidden flex flex-col",
        className
      )}
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'calc(100vw - 40px)',
        maxWidth: 'var(--size-popup-width, calc(100vw - 40px))',
        maxHeight: 'calc(100vh - 40px)',
        backgroundColor: 'var(--neutral-50)',
        border: '1px solid var(--neutral-200)',
        borderRadius: 'var(--radius-corner, 10px)',
        boxShadow: '0 4px 12px 0 var(--shadow-color)',
        padding: 0,
        ...style
      }}
      {...props}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: 'calc(100vh - 40px)',
        overflow: 'hidden'
      }}>
        {children}
      </div>
      {!hideCloseButton && (
        <DialogPrimitive.Close 
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          style={{
            zIndex: 10,
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--neutral-50)',
            border: '1px solid var(--neutral-200)',
            borderRadius: 'var(--radius-corner, 10px)',
            color: 'var(--neutral-900)'
          }}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5",
      className
    )}
    style={{
      padding: 'var(--spacing-grouped, 24px)',
      paddingBottom: 'var(--spacing-small, 12px)',
      flexShrink: 0,
      ...props.style
    }}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    style={{
      padding: 'var(--spacing-grouped, 24px)',
      paddingTop: 'var(--spacing-small, 12px)',
      flexShrink: 0,
      ...props.style
    }}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "leading-none tracking-tight",
      className
    )}
    style={{
      fontFamily: 'var(--font-family)',
      fontSize: 'var(--typography-h2-size, 24px)',
      fontWeight: 'var(--typography-h2-weight, 700)',
      lineHeight: 'var(--typography-h2-line-height, 1.3)',
      color: 'var(--neutral-900)',
      ...style
    }}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex-1 overflow-y-auto overflow-x-hidden", className)}
    style={{
      padding: '0 var(--spacing-grouped, 24px)',
      WebkitOverflowScrolling: 'touch',
      ...props.style
    }}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
}
