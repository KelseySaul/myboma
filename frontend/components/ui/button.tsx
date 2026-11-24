import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-slate-950/20 focus-visible:border-slate-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        // Primary — Deep Slate Solid
        default:
          "bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 border-slate-900 dark:border-slate-50 shadow-sm hover:bg-slate-800 dark:hover:bg-slate-200 active:bg-slate-950",

        // Outlined — Crisp White / Slate Border
        outline:
          "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700",

        // Secondary — Soft Slate Neutral
        secondary:
          "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-transparent hover:bg-slate-200/80 dark:hover:bg-slate-700 shadow-xs",

        // Ghost — Minimal Transparent
        ghost:
          "bg-transparent border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100",

        // Destructive — Crisp Red
        destructive:
          "bg-rose-600 dark:bg-rose-600 text-white border-rose-600 shadow-xs hover:bg-rose-700 dark:hover:bg-rose-700 focus-visible:ring-rose-500/30",

        // Success — Crisp Emerald
        success:
          "bg-emerald-600 text-white border-emerald-600 shadow-xs hover:bg-emerald-700 focus-visible:ring-emerald-500/30",

        // Indigo / Brand
        indigo:
          "bg-indigo-600 text-white border-indigo-600 shadow-xs hover:bg-indigo-700 focus-visible:ring-indigo-500/30",

        // Link — Minimal Text
        link: "bg-transparent border-transparent text-slate-900 dark:text-slate-100 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-3.5",
        xs: "h-6.5 gap-1 rounded-lg px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 rounded-xl px-5 text-sm font-bold",
        icon: "size-9 rounded-xl",
        "icon-xs": "size-6.5 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
