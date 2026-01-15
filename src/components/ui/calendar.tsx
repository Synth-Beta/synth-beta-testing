import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "",
        nav: "space-x-1 flex items-center",
        nav_button: "h-7 w-7 bg-transparent p-0",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "rounded-md w-9",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center p-0 relative focus-within:relative focus-within:z-20",
        day: "h-9 w-9 p-0 aria-selected:opacity-100",
        day_range_end: "day-range-end",
        day_selected: "",
        day_today: "",
        day_outside: "day-outside",
        day_disabled: "",
        day_range_middle: "",
        day_hidden: "invisible",
        ...classNames,
      }}
      styles={{
        caption_label: {
          fontFamily: "var(--font-family)",
          fontSize: "var(--typography-meta-size, 16px)",
          fontWeight: "var(--typography-meta-weight, 500)",
          lineHeight: "var(--typography-meta-line-height, 1.5)",
          color: "var(--neutral-900)",
        },
        nav_button: {
          backgroundColor: "transparent",
          border: "none",
          boxShadow: "none",
          outline: "none",
          color: "var(--neutral-900)",
        },
        head_cell: {
          fontFamily: "var(--font-family)",
          fontSize: "var(--typography-meta-size, 16px)",
          fontWeight: "var(--typography-meta-weight, 500)",
          lineHeight: "var(--typography-meta-line-height, 1.5)",
          color: "var(--neutral-600)",
        },
        day: {
          fontFamily: "var(--font-family)",
          fontSize: "var(--typography-meta-size, 16px)",
          fontWeight: "var(--typography-meta-weight, 500)",
          lineHeight: "var(--typography-meta-line-height, 1.5)",
          color: "var(--neutral-900)",
          backgroundColor: "transparent",
          border: "none",
        },
      }}
      modifiersStyles={{
        selected: {
          backgroundColor: "var(--brand-pink-500)",
          color: "var(--neutral-50)",
        },
        today: {
          backgroundColor: "var(--brand-pink-500)",
          color: "var(--neutral-50)",
        },
        disabled: {
          color: "var(--neutral-400)",
        },
        outside: {
          color: "var(--neutral-400)",
        },
      }}
      components={{
        IconLeft: ({ ..._props }) => (
          <ChevronLeft size={16} style={{ color: "var(--neutral-900)" }} />
        ),
        IconRight: ({ ..._props }) => (
          <ChevronRight size={16} style={{ color: "var(--neutral-900)" }} />
        ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
