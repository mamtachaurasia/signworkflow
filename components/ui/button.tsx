"use client";

import * as React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white shadow-sm hover:bg-brand-500 focus-visible:ring-brand-500/35",
        brand: "bg-brand text-white shadow-sm hover:bg-brand-light focus-visible:ring-brand/30",
        secondary: "bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-200 focus-visible:ring-slate-300",
        outline:
          "border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50 focus-visible:ring-brand-500/20",
        outlineBrand:
          "border border-brand/20 bg-white text-brand shadow-sm hover:bg-brand/5 hover:text-brand focus-visible:ring-brand/20",
        ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-slate-300",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-500 focus-visible:ring-rose-500/30",
        warning:
          "bg-amber-600 text-white shadow-sm hover:bg-amber-500 focus-visible:ring-amber-500/30",
        dark: "bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus-visible:ring-slate-500/30",
        inverse:
          "border border-white/15 bg-white/5 text-white/90 shadow-sm hover:bg-white/10 hover:text-white focus-visible:ring-white/20 focus-visible:ring-offset-slate-950",
        link: "h-auto px-0 py-0 text-brand-600 underline-offset-4 hover:underline focus-visible:ring-brand-500/20",
      },
      size: {
        xs: "h-7 rounded-md px-2 text-xs",
        sm: "h-9 rounded-md px-3 text-sm",
        default: "h-10 rounded-md px-4 py-2",
        lg: "h-11 rounded-lg px-6 text-sm",
        icon: "h-10 w-10 rounded-md p-0",
        "icon-xs": "h-7 w-7 rounded-md p-0",
        "icon-sm": "h-9 w-9 rounded-md p-0",
        "icon-lg": "h-11 w-11 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  inverted?: boolean;
}

function extractText(children: ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child).trim();
      }

      if (React.isValidElement<{ children?: ReactNode }>(child)) {
        return extractText(child.props.children);
      }

      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isPrimitiveContent(content: ReactNode): content is string | number {
  return typeof content === "string" || typeof content === "number";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    asChild = false,
    className,
    variant,
    size,
    leadingIcon,
    trailingIcon,
    loading = false,
    label,
    icon,
    inverted = false,
    disabled,
    children,
    title,
    "aria-label": ariaLabel,
    ...props
  },
  ref
) {
  const resolvedVariant: ButtonVariant = variant ?? (inverted ? "outline" : "default");
  const resolvedLeadingIcon = leadingIcon ?? icon;
  const contentChildren = label ?? children;
  const childText = extractText(contentChildren);
  const iconOnly =
    size?.startsWith("icon") ||
    (!childText && Boolean(resolvedLeadingIcon || trailingIcon));
  const resolvedSize: ButtonSize = size ?? (iconOnly ? "icon" : "default");
  const resolvedTitle = title ?? (typeof label === "string" ? label : undefined);
  const resolvedAriaLabel =
    ariaLabel ?? resolvedTitle ?? (iconOnly ? "Button" : undefined);

  if (asChild) {
    return (
      <Slot
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
        aria-label={resolvedAriaLabel}
        aria-disabled={disabled || loading || undefined}
        title={resolvedTitle}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
      disabled={disabled || loading}
      aria-label={resolvedAriaLabel}
      title={resolvedTitle}
      {...props}
    >
      {resolvedLeadingIcon ? (
        <span data-slot="button-icon" className="shrink-0">
          {resolvedLeadingIcon}
        </span>
      ) : null}
      {contentChildren
        ? isPrimitiveContent(contentChildren)
          ? (
            <span data-slot="button-label" className="truncate animate-none!">
              {contentChildren}
            </span>
          )
          : contentChildren
        : null}
      {trailingIcon ? (
        <span data-slot="button-trailing-icon" className="shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
});

export { Button, buttonVariants };
