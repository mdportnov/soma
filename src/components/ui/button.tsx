import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "press bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "press bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "press border bg-card hover:bg-muted",
        ghost: "press hover:bg-muted",
        destructive: "press bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Text, not a control: a link underlines, it does not give under the pointer.
        link: "text-primary underline-offset-4 transition-colors hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
        iconSm: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /**
   * React 19 passes refs as a plain prop, but `ButtonHTMLAttributes` does not
   * declare one — spelled out here so callers can drive focus (e.g. a
   * confirmation dialog putting the caret on Cancel).
   */
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { buttonVariants };
