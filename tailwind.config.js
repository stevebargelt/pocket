/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/index.html", "./src/client/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      colors: {
        ink: {
          bg: "#111418",
          surface: "#1a1f26",
          border: "#2a313b",
          muted: "#6b7686",
          text: "#c9d3e0",
          bright: "#f0f4fa",
        },
        accent: {
          DEFAULT: "#e2b714",
          dim: "#8a7320",
        },
        err: "#ca4754",
      },
    },
  },
  plugins: [],
};
