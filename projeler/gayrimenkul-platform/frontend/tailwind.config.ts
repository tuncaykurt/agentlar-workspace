import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Surface hierarchy */
        surface: {
          DEFAULT: "var(--surface)",
          "container-low": "var(--surface-container-low)",
          container: "var(--surface-container)",
          "container-high": "var(--surface-container-high)",
          "container-highest": "var(--surface-container-highest)",
        },
        "on-surface": {
          DEFAULT: "var(--on-surface)",
          variant: "var(--on-surface-variant)",
        },

        /* Primary */
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          container: "var(--primary-container)",
        },
        "on-primary": {
          DEFAULT: "var(--on-primary)",
          container: "var(--on-primary-container)",
        },

        /* Secondary */
        secondary: {
          DEFAULT: "var(--secondary)",
          container: "var(--secondary-container)",
        },
        "on-secondary-container": "var(--on-secondary-container)",

        /* Tertiary */
        tertiary: {
          DEFAULT: "var(--tertiary)",
          container: "var(--tertiary-container)",
        },
        "on-tertiary-container": "var(--on-tertiary-container)",

        /* Error */
        error: {
          DEFAULT: "var(--error)",
          container: "var(--error-container)",
        },
        "on-error-container": "var(--on-error-container)",

        /* Outline */
        outline: {
          DEFAULT: "var(--outline)",
          variant: "var(--outline-variant)",
        },

        /* Sidebar */
        sidebar: {
          DEFAULT: "var(--sidebar-bg)",
          text: "var(--sidebar-text)",
          active: "var(--sidebar-active)",
          border: "var(--sidebar-border)",
          hover: "var(--sidebar-hover)",
          "on-active": "var(--sidebar-on-active)",
        },

        /* Legacy */
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      boxShadow: {
        "ambient": "0 20px 40px var(--shadow-color)",
        "card": "0 1px 3px var(--shadow-color)",
      },
      borderRadius: {
        "card": "0.75rem",
      },
      transitionTimingFunction: {
        "design": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
