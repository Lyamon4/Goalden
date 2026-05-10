import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './app.vue',
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue'
  ],
  theme: {
    extend: {
      colors: {
        bone: '#F7F7F4',
        paper: '#F7F7F4',
        ink: '#26251E',
        muted: '#6F6C63',
        line: '#DEDED8',
        gold: '#26251E',
        'gold-soft': '#F0EFEB',
        'green-soft': '#F0EFEB',
        'green-ink': '#26251E',
        'blue-soft': '#F0EFEB',
        'blue-ink': '#26251E',
        'red-soft': '#F0EFEB',
        'red-ink': '#26251E'
      },
      fontFamily: {
        sans: ['Product Sans', 'SF Pro Display', 'Geist Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Product Sans', 'SF Pro Display', 'Geist Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['Product Sans', 'Geist Mono', 'SF Mono', 'JetBrains Mono', 'monospace']
      },
      boxShadow: {
        flat: '0 18px 50px rgba(33, 31, 24, 0.08)'
      }
    }
  }
}
