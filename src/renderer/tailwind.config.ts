import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#6366f1',
        'accent-hover': '#4f46e5',
      },
    },
  },
  plugins: [],
} satisfies Config
