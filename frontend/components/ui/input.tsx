import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9.5 w-full min-w-0 rounded-lg border border-[#D0D5DD] dark:border-white/12 bg-white dark:bg-[#16191D] px-3 py-1.5 text-sm text-[#1C2B33] dark:text-slate-100 placeholder:text-[#8A94A6] transition-all outline-none hover:border-[#98A2B3] dark:hover:border-white/20 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-semibold file:text-slate-700 focus-visible:border-emerald-700 dark:focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-700/15 dark:focus-visible:ring-emerald-500/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#F7F8FA] dark:disabled:bg-white/5 disabled:opacity-60 aria-invalid:border-rose-500 aria-invalid:ring-2 aria-invalid:ring-rose-500/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
