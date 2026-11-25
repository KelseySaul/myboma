import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto rounded-xl border border-[#1C2B33]/[0.09] bg-white shadow-[0_1px_2px_rgba(28,43,51,0.05)] dark:border-white/[0.08] dark:bg-[#1A1D21] max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:shadow-none"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm text-[#1C2B33] dark:text-slate-200", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-[#1C2B33]/[0.08] dark:[&_tr]:border-white/[0.08] bg-[#F7F8FA] dark:bg-[#20242A]", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0 divide-y divide-[#1C2B33]/[0.06] dark:divide-white/[0.06]", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-[#1C2B33]/[0.08] dark:border-white/[0.08] bg-[#F7F8FA] dark:bg-[#20242A] font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-[#221844]/[0.06] dark:border-white/[0.06] transition-colors duration-100 hover:bg-[#F8F7FC] dark:hover:bg-white/[0.03] data-[state=selected]:bg-violet-50/70 dark:data-[state=selected]:bg-violet-950/30",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-4 text-left align-middle font-semibold text-[11px] uppercase tracking-[0.04em] text-[#5F6C7B] dark:text-slate-400 whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle text-[13px] text-[#1C2B33] dark:text-slate-200 whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-xs text-slate-500", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
