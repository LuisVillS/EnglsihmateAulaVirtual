/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        em: {
          primary: "var(--em-primary)",
          secondary: "var(--em-secondary)",
          accent: "var(--em-accent)",
          bg: "var(--em-bg)",
          surface: "var(--em-surface)",
          border: "var(--em-border)",
          text: "var(--em-text)",
          muted: "var(--em-text-muted)",
          danger: "var(--em-danger)",
          success: "var(--em-success)",
        },
      },
      borderRadius: {
        em: "var(--em-radius)",
      },
      boxShadow: {
        em: "var(--em-shadow)",
      },
    },
  },
};
