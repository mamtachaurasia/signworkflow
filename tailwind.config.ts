import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        primary: {
          DEFAULT: "oklch(var(--primary) / <alpha-value>)",
          foreground: "oklch(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "oklch(var(--popover))",
          foreground: "oklch(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "oklch(var(--card))",
          foreground: "oklch(var(--card-foreground))",
        },
        chart: {
          1: "oklch(var(--chart-1))",
          2: "oklch(var(--chart-2))",
          3: "oklch(var(--chart-3))",
          4: "oklch(var(--chart-4))",
          5: "oklch(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "oklch(var(--sidebar))",
          foreground: "oklch(var(--sidebar-foreground))",
          primary: "oklch(var(--sidebar-primary))",
          "primary-foreground": "oklch(var(--sidebar-primary-foreground))",
          accent: "oklch(var(--sidebar-accent))",
          "accent-foreground": "oklch(var(--sidebar-accent-foreground))",
          border: "oklch(var(--sidebar-border))",
          ring: "oklch(var(--sidebar-ring))",
        },
        navy: {
          DEFAULT: "oklch(0.24 0.068 251)",
          light: "oklch(0.32 0.068 251)",
          dark: "oklch(0.18 0.065 251)",
        },
        brand: {
          50: "oklch(0.97 0.03 264)",
          100: "oklch(0.94 0.05 264)",
          200: "oklch(0.89 0.08 264)",
          300: "oklch(0.82 0.12 264)",
          400: "oklch(0.74 0.15 264)",
          500: "oklch(0.65 0.18 264)",
          600: "oklch(0.54 0.22 264)",
          700: "oklch(0.47 0.19 264)",
          800: "oklch(0.4 0.15 264)",
          900: "oklch(0.33 0.11 264)",
          DEFAULT: "oklch(0.54 0.22 264)",
          light: "oklch(0.65 0.18 264)",
        },
        state: {
          300: "oklch(var(--state-300))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15,45,79,0.08), 0 1px 2px -1px rgba(15,45,79,0.04)",
        "card-hover": "0 4px 12px 0 rgba(15,45,79,0.12), 0 2px 4px -2px rgba(15,45,79,0.06)",
        xs: "0 1px 2px 0 rgba(0,0,0,0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-in": "slide-in 0.3s ease-out forwards",
      },
      cursor: {
        fieldpicked:
          'url(data:image/svg+xml,%3Csvg%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220.5%200.05%201%201.5%22%20xml%3Aspace%3D%22preserve%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22m.545%201.302-.07-.062a.3.3%200%200%201-.079-.114L.295.848A.05.05%200%200%201%20.32.787.1.1%200%200%201%20.357.779a.09.09%200%200%201%20.078.047l.092.185A.12.12%200%200%200%20.576.913V.325C.576.283.61.251.651.251s.075.034.075.075v.4a.075.075%200%201%201%20.15%200v.025a.075.075%200%201%201%20.15%200v.016a.075.075%200%201%201%20.15%200v.405a.16.16%200%200%201-.029.094%22%20fill%3D%22%23fff%22%20stroke%3D%22%23455A64%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-miterlimit%3D%2210%22%20stroke-width%3D%22.016%22%2F%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23455A64%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-miterlimit%3D%2210%22%20d%3D%22M.509.184.474.149M.651.125V.074m.141.109L.827.148M.85.325h.016m-.5%200h.016%22%20stroke-width%3D%22.016%22%2F%3E%3Cpath%20fill%3D%22%23fff%22%20stroke%3D%22%23455A64%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-miterlimit%3D%2210%22%20d%3D%22M.525%201.525v-.15h.65v.15%22%20stroke-width%3D%22.016%22%2F%3E%3C%2Fsvg%3E), pointer',
      },
    },
  },
  plugins: [],
} satisfies Config;
