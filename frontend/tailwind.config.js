/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 7px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.32, 0.72, 0, 1)",
        "out-ios": "cubic-bezier(0.25, 0.1, 0.25, 1)",
        gel: "cubic-bezier(0.34, 1.42, 0.5, 1)",
        settle: "cubic-bezier(0.22, 1.28, 0.36, 1)",
      },
      transitionDuration: {
        fast: "180ms",
        base: "280ms",
        slow: "420ms",
      },
      keyframes: {
        // No blur. Apple moves content, it does not defocus it - a blur
        // ramp on entry is a web flourish, and an expensive one.
        "ios-rise": {
          "0%": { opacity: "0", transform: "translate3d(0, 8px, 0) scale(0.985)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "ios-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
        "ios-fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "ios-scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "ios-pop": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "ios-scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.96)" },
        },
        "ios-sheet-up": {
          from: { opacity: "0", transform: "translate3d(0, 100%, 0)" },
          to: { opacity: "1", transform: "none" },
        },
        "ios-sheet-down": {
          from: { opacity: "1", transform: "none" },
          to: { opacity: "0", transform: "translate3d(0, 100%, 0)" },
        },
        "ios-slide-left": {
          from: { opacity: "0", transform: "translate3d(18px, 0, 0)" },
          to: { opacity: "1", transform: "none" },
        },
        "ios-drawer-in": {
          "0%": { transform: "translate3d(-100%, 0, 0)", opacity: "0.6" },
          "100%": { transform: "none", opacity: "1" },
        },
      },
      animation: {
        rise: "ios-rise var(--duration-settle) cubic-bezier(0.22, 1.28, 0.36, 1) both",
        pop: "ios-pop var(--duration-base) cubic-bezier(0.34, 1.42, 0.5, 1) both",
        fade: "ios-fade var(--duration-fast) cubic-bezier(0.25, 0.1, 0.25, 1) both",
        "fade-out": "ios-fade-out var(--duration-fast) cubic-bezier(0.25, 0.1, 0.25, 1) both",
        "scale-in": "ios-scale-in var(--duration-base) cubic-bezier(0.34, 1.42, 0.5, 1) both",
        "scale-out": "ios-scale-out var(--duration-fast) cubic-bezier(0.25, 0.1, 0.25, 1) both",
        "sheet-up": "ios-sheet-up var(--duration-slow) cubic-bezier(0.22, 1.28, 0.36, 1) both",
        "sheet-down": "ios-sheet-down var(--duration-base) cubic-bezier(0.32, 0.72, 0, 1) both",
        "slide-left": "ios-slide-left var(--duration-base) cubic-bezier(0.32, 0.72, 0, 1) both",
        "drawer-in": "ios-drawer-in var(--duration-base) cubic-bezier(0.32, 0.72, 0, 1) both",
      },
      boxShadow: {
        /* iOS shadows are soft and low-contrast rather than dark and tight */
        ios: "0 1px 2px rgba(0,0,0,0.04), 0 4px 10px rgba(0,0,0,0.05)",
        "ios-lg": "0 2px 6px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.10)",
        "ios-modal": "0 8px 40px rgba(0,0,0,0.18)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
