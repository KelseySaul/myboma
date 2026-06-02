import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold whitespace-nowrap transition-all duration-200 outline-none select-none will-change-transform backdrop-blur-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:border-ring/60 active:not-aria-[haspopup]:scale-[0.97] active:not-aria-[haspopup]:shadow-none disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — dark frosted glass
        default:
          "bg-zinc-900/90 dark:bg-white/10 text-white dark:text-zinc-100 border-zinc-700/50 dark:border-white/15 shadow-[0_2px_14px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-zinc-900 dark:hover:bg-white/20 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.1)] active:translate-y-0",

        // Outlined — light frosted glass
        outline:
          "bg-white/60 dark:bg-white/5 text-zinc-700 dark:text-zinc-200 border-white/80 dark:border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white/90 dark:hover:bg-white/10 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.09),inset_0_1px_0_rgba(255,255,255,1)] aria-expanded:bg-white/90 aria-expanded:text-foreground",

        // Secondary — mid-tone frosted glass
        secondary:
          "bg-zinc-100/70 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-200 border-zinc-200/80 dark:border-zinc-700/50 shadow-[0_2px_10px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-zinc-100/90 dark:hover:bg-zinc-700/60 hover:-translate-y-0.5 hover:shadow-[0_5px_18px_rgba(0,0,0,0.08)] aria-expanded:bg-zinc-100/90",

        // Ghost — ultra-transparent glass, gains frost on hover
        ghost:
          "bg-transparent border-transparent text-zinc-600 dark:text-zinc-400 shadow-none hover:bg-white/50 dark:hover:bg-white/8 hover:border-white/60 dark:hover:border-white/10 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:text-zinc-800 dark:hover:text-zinc-200 aria-expanded:bg-white/50 aria-expanded:text-foreground active:translate-y-0",

        // Destructive — rose frosted glass
        destructive:
          "bg-rose-50/80 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/40 shadow-[0_2px_10px_rgba(225,29,72,0.08),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-rose-100/80 dark:hover:bg-rose-900/40 hover:-translate-y-0.5 hover:shadow-[0_5px_18px_rgba(225,29,72,0.14)] focus-visible:ring-rose-500/30",

        // Link — no glass, just text
        link: "bg-transparent border-transparent text-primary underline-offset-4 shadow-none hover:underline hover:-translate-y-0.5 active:translate-y-0",
      },
      size: {
        default:
          "h-9 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-xl px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-xl px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-xl [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-xl",
        "icon-lg": "size-11",
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
