import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9.5 w-full min-w-0 rounded-lg border border-[#D5D2E3] dark:border-white/12 bg-white dark:bg-[#161722] px-3 py-1.5 text-sm text-[#161426] dark:text-slate-100 placeholder:text-[#8A86A1] transition-all outline-none hover:border-violet-300 dark:hover:border-white/20 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-semibold file:text-slate-700 focus-visible:border-violet-600 dark:focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-600/15 dark:focus-visible:ring-violet-400/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#F8F7FC] dark:disabled:bg-white/5 disabled:opacity-60 aria-invalid:border-rose-500 aria-invalid:ring-2 aria-invalid:ring-rose-500/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
