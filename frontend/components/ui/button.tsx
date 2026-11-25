import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-emerald-700/25 focus-visible:border-emerald-700 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        // Primary — Signature Deep Emerald (single primary brand accent)
        default:
          "bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-600 shadow-2xs hover:bg-emerald-800 dark:hover:bg-emerald-500 active:bg-emerald-900",

        // Outlined — Crisp White / Hairline Neutral Border
        outline:
          "bg-white dark:bg-[#1A1D21] text-[#1C2B33] dark:text-slate-200 border-[#D0D5DD] dark:border-white/12 shadow-2xs hover:bg-[#F7F8FA] dark:hover:bg-white/5 hover:border-[#98A2B3] dark:hover:border-white/20",

        // Secondary — Calm Meta Neutral Pill
        secondary:
          "bg-[#E4E6EB]/75 dark:bg-white/10 text-[#1C2B33] dark:text-slate-100 border-transparent hover:bg-[#E4E6EB] dark:hover:bg-white/15",

        // Ghost — Minimal Transparent
        ghost:
          "bg-transparent border-transparent text-[#5F6C7B] dark:text-slate-400 hover:bg-[#1C2B33]/[0.05] dark:hover:bg-white/8 hover:text-[#1C2B33] dark:hover:text-slate-100",

        // Destructive — Crisp Red
        destructive:
          "bg-rose-600 dark:bg-rose-600 text-white border-rose-600 shadow-2xs hover:bg-rose-700 dark:hover:bg-rose-700 focus-visible:ring-rose-500/30",

        // Success — Crisp Emerald
        success:
          "bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-700 focus-visible:ring-emerald-500/30",

        // Indigo / Brand
        indigo:
          "bg-indigo-600 text-white border-indigo-600 shadow-2xs hover:bg-indigo-700 focus-visible:ring-indigo-500/30",

        // Link — Minimal Text
        link: "bg-transparent border-transparent text-emerald-700 dark:text-emerald-400 underline-offset-4 hover:underline",
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
