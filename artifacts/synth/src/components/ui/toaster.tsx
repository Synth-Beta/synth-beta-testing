import { useToast } from "@/hooks/use-toast"
import { useAccountType } from "@/hooks/useAccountType"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  const { isAdmin, loading } = useAccountType()

  // Only show toasts to admin users
  // During loading, hide toasts (prevents non-admins from briefly seeing toasts)
  // After loading, show toasts only if user is confirmed admin
  // Toasts are queued in useToast() state, so admin users will see them once loading completes
  if (loading || !isAdmin()) {
    return null
  }

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
