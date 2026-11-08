/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        skyrim: {
          bg: '#090a0f',
          surface: '#0f1117',
          plate: '#141721',
          plateHover: '#1a1e2b',
          stone: '#0c0e14',
          border: '#2e3346',
          borderLight: '#434b63',
          borderDark: '#1c1f2b',
          iron: '#3d3428',
          ironBorder: '#4a3f31',
          gold: '#c5a059',
          goldLight: '#e5c687',
          goldDark: '#8c7447',
          forge: '#e0631b',
          forgeLight: '#f59e0b',
          forgeDark: '#993d0a',
          rune: '#73a5c6',
          frost: '#548b9c',
          frostDark: '#355b66',
          silver: '#d1d5db',
          parchment: '#d1d5db',
          parchmentMuted: '#a8b0bf',
          parchmentDark: '#626877',
          moss: '#2e8540',
          mossLight: '#4ade80',
          mossDark: '#1a5327',
          daedric: '#991b1b',
          daedricLight: '#ef4444',
          daedricDark: '#5c1010',
        }
      },
      fontFamily: {
        nordic: ['Cinzel', 'Trajan Pro', 'Georgia', 'serif'],
        serif: ['Cinzel', 'Trajan Pro', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '2px',
        full: '2px', // strictly straight edges (no pill badges)
      },
      boxShadow: {
        'skyrim-gold': '0 0 15px rgba(197, 160, 89, 0.25)',
        'skyrim-forge': '0 0 20px rgba(224, 99, 27, 0.25), inset 0 0 15px rgba(224, 99, 27, 0.08)',
        'skyrim-frost': '0 0 20px rgba(115, 165, 198, 0.25), inset 0 0 15px rgba(84, 139, 156, 0.08)',
        'skyrim-plate': 'inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 0 rgba(0, 0, 0, 0.8), 0 4px 20px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        emberFlicker: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '0.9' },
        },
        frostMist: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '0.85' },
        },
        questBanner: {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
      },
      animation: {
        'ember-flicker': 'emberFlicker 3s ease-in-out infinite',
        'frost-mist': 'frostMist 4s ease-in-out infinite',
        'quest-in': 'questBanner 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    },
  },
  plugins: [],
};
