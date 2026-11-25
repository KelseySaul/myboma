import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[#0F172A]/55 backdrop-blur-[2px] duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const

/**
 * Every popup in the app. On phones it is a bottom sheet (full width, rounded top, scrolls
 * inside, clears the home indicator); from `sm` up it is a centred modal. The phone layout
 * uses `max-sm:` variants so call sites can keep their own unprefixed widths and radii
 * without breaking the sheet.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  showHandle = true,
  size = "md",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** The small grab bar shown at the top of the phone bottom sheet. */
  showHandle?: boolean
  size?: keyof typeof SIZES
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Centred modal (sm and up) — Meta/Stripe architectural elevation
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto overscroll-contain rounded-xl border border-[#1C2B33]/[0.10] bg-white p-6 text-sm text-[#1C2B33] shadow-[0_20px_50px_rgba(15,23,42,0.22),0_0_0_1px_rgba(15,23,42,0.04)] outline-none max-h-[88vh] dark:border-white/[0.10] dark:bg-[#1A1D21] dark:text-slate-100",
          SIZES[size],
          "duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
          // Bottom sheet (phones)
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-h-[92dvh] max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pt-7 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10",
          className
        )}
        {...props}
      >
        {showHandle && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-1/2 z-20 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700"
          />
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2.5 right-2.5 z-20 h-11 w-11 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
                size="icon-lg"
              />
            }
          >
            <XIcon className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 pr-10", className)}
      {...props}
    />
  )
}

/** Action row. Sticks to the bottom of long popups so the buttons stay reachable. */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 -mx-6 -mb-6 mt-2 flex flex-col-reverse gap-2 border-t border-[#1C2B33]/[0.08] bg-[#F7F8FA] px-6 py-3.5 sm:flex-row sm:justify-end sm:gap-2.5 sm:rounded-b-xl max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-[#16191D]",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" size="sm" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-lg leading-snug font-semibold tracking-tight text-zinc-950 dark:text-white",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm leading-6 text-zinc-500 dark:text-zinc-400 *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-zinc-950",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
