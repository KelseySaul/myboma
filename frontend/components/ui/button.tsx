import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-violet-600/25 focus-visible:border-violet-600 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        // Primary — Signature Royal Purple Gradient
        default:
          "bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 text-white border-transparent shadow-xs shadow-violet-700/20 hover:from-violet-800 hover:via-purple-700 hover:to-fuchsia-700 active:brightness-95",

        // Outlined — Crisp White / Hairline Neutral Border
        outline:
          "bg-white dark:bg-[#181922] text-[#161426] dark:text-slate-200 border-[#D5D2E3] dark:border-white/12 shadow-2xs hover:bg-[#F8F7FC] dark:hover:bg-white/5 hover:border-violet-300 dark:hover:border-violet-400/35",

        // Secondary — Soft Lavender-Neutral Pill
        secondary:
          "bg-violet-50/90 dark:bg-violet-500/15 text-violet-900 dark:text-violet-200 border-violet-200/60 dark:border-violet-500/20 hover:bg-violet-100/90 dark:hover:bg-violet-500/25",

        // Ghost — Minimal Transparent
        ghost:
          "bg-transparent border-transparent text-[#5D5A73] dark:text-slate-400 hover:bg-violet-600/[0.06] dark:hover:bg-white/8 hover:text-[#161426] dark:hover:text-slate-100",

        // Destructive — Crisp Red
        destructive:
          "bg-rose-600 dark:bg-rose-600 text-white border-rose-600 shadow-2xs hover:bg-rose-700 dark:hover:bg-rose-700 focus-visible:ring-rose-500/30",

        // Success — Royal Violet Gradient
        success:
          "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white border-transparent shadow-2xs hover:from-indigo-700 hover:via-violet-700 hover:to-purple-700 focus-visible:ring-violet-500/30",

        // Indigo / Brand
        indigo:
          "bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-transparent shadow-2xs hover:from-indigo-700 hover:to-violet-700 focus-visible:ring-indigo-500/30",

        // Link — Minimal Text
        link: "bg-transparent border-transparent text-violet-700 dark:text-violet-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-3.5",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 rounded-lg px-4 text-sm font-semibold",
        icon: "size-9 rounded-lg",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10 rounded-lg",
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
