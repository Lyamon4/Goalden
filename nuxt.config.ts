export default defineNuxtConfig({
  compatibilityDate: '2026-05-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Goalden - AI accountability before the feed',
      meta: [
        {
          name: 'description',
          content:
            'Goalden blocks doomscrolling until you report real progress on the work you already promised.'
        },
        { name: 'theme-color', content: '#f7f6f3' },
        { property: 'og:title', content: 'Goalden - AI accountability before the feed' },
        {
          property: 'og:description',
          content:
            'An AI coach that turns your chat commitments into short next steps and unlocks distracting sites only after progress.'
        }
      ],
      link: [{ rel: 'icon', href: '/goalden-symbol-black.png' }]
    }
  }
})
