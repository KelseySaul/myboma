import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white border-slate-900 dark:bg-slate-50 dark:text-slate-900",
        secondary:
          "bg-slate-100 text-slate-800 border-slate-200/60 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
        outline:
          "bg-transparent border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300",
        success:
          "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
        warning:
          "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
        destructive:
          "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
        info:
          "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60",
        purple:
          "bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60",
        indigo:
          "bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60",
        neutral:
          "bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
        ghost:
          "bg-transparent border-transparent hover:bg-slate-100 text-slate-600 dark:text-slate-400",
        link: "text-slate-900 underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
