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
        bone: '#F7F6F3',
        paper: '#FBFBFA',
        ink: '#111111',
        muted: '#787774',
        line: '#EAEAEA',
        gold: '#956400',
        'gold-soft': '#FBF3DB',
        'green-soft': '#EDF3EC',
        'green-ink': '#346538',
        'blue-soft': '#E1F3FE',
        'blue-ink': '#1F6C9F',
        'red-soft': '#FDEBEC',
        'red-ink': '#9F2F2D'
      },
      fontFamily: {
        sans: ['SF Pro Display', 'Geist Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Newsreader', 'Instrument Serif', 'Georgia', 'serif'],
        mono: ['Geist Mono', 'SF Mono', 'JetBrains Mono', 'monospace']
      },
      boxShadow: {
        flat: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }
    }
  }
}
