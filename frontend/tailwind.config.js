/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#F6F3EC',
        ink: '#1F2421',
        navy: '#22406B',
        // amber ko object bana diya: DEFAULT tumhara purana rang hai, aur
        // bg-amber-50 / text-amber-700 jaisi classes ab bhi kaam karengi
        amber: {
          DEFAULT: '#C68A2E',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        maroon: '#7A2E3B',
        forest: '#2F5D4C',
        line: '#D8D2C4',

        // Burgundy + Rose Gold theme: har purple-* class ab isse chalegi
        purple: {
          50: '#FBF1F4',
          100: '#F6E3E8',
          200: '#EDCBD3',
          300: '#D7A1A9', // Rose Gold (accent)
          400: '#B96A82',
          500: '#A3516F',
          600: '#8C3F61', // Rich Wine (primary)
          700: '#733250',
          800: '#5A2740',
          900: '#351C2B', // Deep Burgundy (sidebar)
        },

        // ADMIN THEME: yahin se rang badlo, pages ko chhoone ki zaroorat nahi.
        // brand = Dusty Lavender (accent, sidebar, buttons)
        brand: {
          50: '#F6F3F8',
          100: '#ECE7F1',
          200: '#DAD1E4',
          300: '#C4B6D3',
          400: '#AD9BC1',
          500: '#9783AD',
          600: '#836F9B',
          700: '#6E5B85', // main accent
          800: '#594A6C',
          900: '#443954', // sidebar
        },
        // canvas = Champagne (page background, borders)
        canvas: {
          50: '#FCF9F3',
          100: '#F7F0E3', // page background
          200: '#EDE2CE',
          300: '#E0D0B3',
          400: '#CDB994',
          500: '#B39E75',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}