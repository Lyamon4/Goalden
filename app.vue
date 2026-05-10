<script setup lang="ts">
import {
  PhCheck,
  PhClock,
  PhGoogleChromeLogo,
  PhLockSimple,
  PhShieldCheck,
} from '@phosphor-icons/vue'

const features = [
  {
    eyebrow: 'Collect',
    title: 'It reads the promises you already made',
    body:
      'Goalden looks at selected chats and notes the tasks, dates, and loose commitments that usually stay buried in threads.',
    tone: 'blue'
  },
  {
    eyebrow: 'Break down',
    title: 'Big goals become small next moves',
    body:
      'The agent turns each commitment into 15 to 30 minute steps, so the next action is boringly clear.',
    tone: 'green'
  },
  {
    eyebrow: 'Block',
    title: 'The feed waits for a real update',
    body:
      'Open YouTube, TikTok, Reddit, or Instagram and Goalden asks what moved before it unlocks the page.',
    tone: 'red'
  },
  {
    eyebrow: 'Earn time',
    title: 'Approved progress buys a short break',
    body:
      'Tell the coach what you did. If it counts, you get 15 minutes. When the timer ends, the mirror comes back.',
    tone: 'gold'
  }
]

const steps = [
  'Connect the places where work actually appears: Telegram, WhatsApp, Slack, Notion.',
  'Goalden extracts commitments and drafts small, time-boxed steps.',
  'The browser extension catches distraction sites before the feed loads.',
  'You report progress to the AI coach and earn a limited unlock.'
]

const schoolLogos = [
  { src: '/logos/rfmsh.png', alt: 'RFMSH', title: 'RFMSH' },
  { src: '/logos/nish.png', alt: 'NISH', title: 'NISH' },
  { src: '/logos/ktl.png', alt: 'KTL', title: 'KTL' }
]

const extractionRows = [
  {
    signal: 'Promise',
    example: '“I’ll send the May metrics before tomorrow’s call.”',
    output: 'Task, owner, due date'
  },
  {
    signal: 'Deadline',
    example: '“Can you have the deck ready by Friday morning?”',
    output: 'Calendar pressure and priority'
  },
  {
    signal: 'Stalled thread',
    example: 'Three follow-ups, no reply, one missing number.',
    output: 'Smallest unblock step'
  },
  {
    signal: 'Repeated avoidance',
    example: 'The same report appears in Slack, Notion, and email.',
    output: 'Higher-friction block message'
  }
]

const accountabilityRules = [
  {
    title: 'The block comes with context',
    body:
      'Goalden shows the exact commitment sitting behind the distraction, so the check-in feels specific instead of random.'
  },
  {
    title: 'The coach asks for evidence',
    body:
      'Vague updates do not earn time. Finished sections, sent drafts, and concrete next actions do.'
  },
  {
    title: 'Breaks are earned, then expire',
    body:
      'Approved progress opens a short window. After the timer ends, the extension checks in again instead of trusting yesterday’s motivation.'
  }
]

const faq = [
  {
    question: 'Does Goalden write tasks by hand?',
    answer:
      'No. Connect the sources you want, and Goalden turns existing chats and notes into clear commitments without another manual task dump.'
  },
  {
    question: 'What happens when I try to open a blocked site?',
    answer:
      'The extension replaces the page with a short coaching check-in. You can explain what you finished, attach context, or choose a planned break if you have one available.'
  },
  {
    question: 'Can I choose which chats it reads?',
    answer:
      'Yes. Goalden is permissioned by source and channel. Private chats stay private unless you explicitly connect them.'
  },
  {
    question: 'How is Goalden different from site blockers?',
    answer:
      'Site blockers stop the page. Goalden adds context: the promise, the next step, and a short path to earn a break.'
  },
  {
    question: 'Is this for teams or solo users?',
    answer:
      'Goalden is designed for personal accountability first. You connect your own sources, choose your own blocked sites, and control what the coach can use.'
  }
]

const activeFaq = ref(0)

onMounted(() => {
  const targets = document.querySelectorAll<HTMLElement>('.reveal')
  document.documentElement.classList.add('reveal-enabled')

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.12 }
  )

  targets.forEach(target => {
    const rect = target.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.95) {
      target.classList.add('is-visible')
    }
    observer.observe(target)
  })

  onBeforeUnmount(() => observer.disconnect())
})
</script>

<template>
  <div class="min-h-screen overflow-hidden bg-bone font-sans text-ink">
    <header
      class="fixed left-0 right-0 top-0 z-30 border-b border-[#deded8] bg-[#f7f7f4]"
    >
      <nav class="mx-auto flex h-16 max-w-[1300px] items-center justify-between px-5 lg:px-8">
        <a href="#top" class="flex items-center gap-2.5" aria-label="Goalden home">
          <img src="/goalden-symbol-black.png" alt="" class="h-7 w-7 object-contain" />
          <img src="/goalden-name-black.png" alt="Goalden" class="h-5 w-auto object-contain" />
        </a>

        <div class="hidden items-center gap-8 text-sm text-ink md:flex">
          <a href="#how" class="transition hover:text-ink">How it works</a>
          <a href="#flow" class="transition hover:text-ink">Flow</a>
          <a href="#inside" class="transition hover:text-ink">Inside</a>
          <a href="#pricing" class="transition hover:text-ink">Pricing</a>
          <a href="#privacy" class="transition hover:text-ink">Privacy</a>
          <a href="#faq" class="transition hover:text-ink">FAQ</a>
        </div>

        <a
          href="#waitlist"
          class="hidden rounded-full bg-[#26251e] px-5 py-2 text-sm font-medium text-[#e6e5e0] transition hover:bg-[#34332b] active:scale-[0.98] sm:inline-flex"
        >
          Join waitlist
        </a>
      </nav>
    </header>

    <main id="top">
      <section class="relative mx-auto min-h-[100dvh] max-w-[1300px] px-5 pb-24 pt-32 lg:px-8">
        <div class="reveal min-w-0 max-w-[620px]">
          <h1 class="max-w-full text-[2rem] font-normal leading-[1.12] tracking-[-0.045em] sm:text-[2.25rem]">
            Earn your scroll.
          </h1>
          <p class="mt-1 max-w-2xl text-[1.55rem] leading-[1.18] tracking-[-0.045em] text-[#26251e] sm:text-[2rem]">
            Goalden turns messy chats into tasks before it lets the feed open.
          </p>

          <div class="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="#waitlist"
              class="inline-flex items-center justify-center gap-2 rounded-full bg-[#26251e] px-6 py-3 text-sm font-semibold text-[#e6e5e0] transition hover:bg-[#34332b] active:scale-[0.98]"
            >
              <PhGoogleChromeLogo :size="18" weight="fill" />
              Get Extension
            </a>
            <a
              href="#pricing"
              class="inline-flex items-center justify-center rounded-full border border-[#d8d7d1] bg-[#f0efeb] px-6 py-3 text-sm font-semibold text-[#26251e] transition hover:bg-[#e6e5e0] active:scale-[0.98]"
            >
              See pricing
            </a>
          </div>
        </div>

        <div class="reveal mt-16 min-w-0" style="--delay: 120ms">
          <div class="relative overflow-hidden rounded-[4px] border border-[#d6d1c6] bg-[#d9d2c4] p-6 shadow-[0_28px_90px_rgba(34,31,24,0.16)] sm:p-10 lg:p-12">
            <img
              src="/cursor-landscape.jpg"
              alt=""
              class="absolute inset-0 h-full w-full object-cover opacity-80"
            />
            <div class="absolute inset-0 bg-[#f7f7f4]/15" />
            <div class="relative mx-auto max-w-[1080px] overflow-hidden rounded-[10px] border border-[#d3d2cc] bg-[#f7f7f4]/95 shadow-[0_22px_70px_rgba(35,32,24,0.18)] backdrop-blur-sm">
            <div class="flex h-11 items-center justify-between border-b border-line px-4">
              <div class="flex gap-2">
                <span class="h-2.5 w-2.5 rounded-full bg-[#ddd8ce]" />
                <span class="h-2.5 w-2.5 rounded-full bg-[#ddd8ce]" />
                <span class="h-2.5 w-2.5 rounded-full bg-[#ddd8ce]" />
              </div>
              <p class="font-mono text-xs text-muted">reddit.com blocked by Goalden</p>
            </div>

            <div class="p-5 sm:p-7">
              <div class="rounded-lg border border-line bg-[#f0efeb] p-5 text-[#26251e]">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="font-mono text-xs uppercase tracking-[0.18em] text-red-ink">
                      Progress check
                    </p>
                    <h2 class="mt-3 max-w-md font-serif text-4xl leading-[1] tracking-[-0.04em]">
                      You said the investor update would go out today.
                    </h2>
                  </div>
                  <div class="rounded-md bg-[#26251e] p-3 text-[#e6e5e0]">
                    <PhLockSimple :size="24" weight="bold" />
                  </div>
                </div>

                <div class="mt-6 rounded-lg border border-line bg-[#f7f7f4] p-4">
                  <p class="text-sm text-muted">Goalden found this in Slack yesterday:</p>
                  <p class="mt-2 text-[15px] leading-6">
                    “I’ll send the May metrics and churn notes before tomorrow’s call.”
                  </p>
                </div>

                <label class="mt-5 block text-sm font-semibold" for="progress">
                  What did you finish?
                </label>
                <div
                  id="progress"
                  class="mt-2 min-h-24 rounded-lg border border-line bg-[#f7f7f4] p-4 text-sm leading-6 text-muted"
                >
                  Wrote the churn section, added April numbers, and asked Masha for the missing
                  expansion figure.
                </div>

                <div class="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    class="inline-flex items-center justify-center gap-2 rounded-full bg-[#26251e] px-4 py-3 text-sm font-semibold text-[#e6e5e0] transition active:scale-[0.98]"
                  >
                    Submit progress
                    <PhCheck :size="16" weight="bold" />
                  </button>
                  <button
                    class="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-[#f7f7f4] px-4 py-3 text-sm font-semibold text-[#26251e] transition active:scale-[0.98]"
                  >
                    Ask for a smaller step
                  </button>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-line p-4">
                  <p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">
                    Break earned
                  </p>
                  <p class="mt-2 flex items-center gap-2 text-lg font-semibold">
                    <PhClock :size="20" weight="bold" />
                    15:00
                  </p>
                </div>
                <div class="rounded-lg border border-line p-4">
                  <p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">
                    Next step
                  </p>
                  <p class="mt-2 text-sm leading-5">Send draft before opening the feed again.</p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>

      <section class="mx-auto max-w-[1300px] px-5 pb-20 lg:px-8">
        <div class="reveal border-y border-line py-9">
          <p class="text-center font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Trusted by students at
          </p>
          <div class="relative mt-8 h-24 overflow-hidden">
            <LogoLoop
              :logos="schoolLogos"
              :speed="70"
              direction="left"
              :logo-height="52"
              :gap="54"
              :pause-on-hover="true"
              :scale-on-hover="true"
              :fade-out="true"
              fade-out-color="#F7F7F4"
              aria-label="Student school logos"
            />
          </div>
        </div>
      </section>

      <section id="how" class="border-y border-line bg-paper py-24">
        <div class="mx-auto max-w-[1300px] px-5 lg:px-8">
          <div class="reveal max-w-3xl">
            <h2 class="font-serif text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl">
              It does not ask you to become a task manager.
            </h2>
            <p class="mt-6 text-lg leading-8 text-muted">
              Most productivity tools start with a blank box. Goalden starts with the receipts:
              the messages where you already said yes.
            </p>
          </div>

          <div class="mt-14 grid gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-4">
            <div
              v-for="(step, index) in steps"
              :key="step"
              class="reveal bg-[#f0efeb] p-6 text-[#26251e]"
              :style="{ '--delay': `${index * 80}ms` }"
            >
              <p class="font-mono text-xs text-muted">0{{ index + 1 }}</p>
              <p class="mt-8 text-lg leading-7">{{ step }}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="inside" class="mx-auto max-w-[1300px] px-5 py-24 lg:px-8">
        <div class="grid gap-6 lg:grid-cols-12">
          <article
            v-for="(feature, index) in features"
            :key="feature.title"
            class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-7 text-[#26251e] lg:p-9"
            :class="[
              index === 0 ? 'lg:col-span-7' : '',
              index === 1 ? 'lg:col-span-5' : '',
              index === 2 ? 'lg:col-span-5' : '',
              index === 3 ? 'lg:col-span-7' : ''
            ]"
            :style="{ '--delay': `${index * 70}ms` }"
          >
            <p
              class="inline-flex rounded-full bg-[#26251e] px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-[#e6e5e0]"
            >
              {{ feature.eyebrow }}
            </p>
            <h3 class="mt-8 max-w-xl font-serif text-4xl leading-[1] tracking-[-0.04em]">
              {{ feature.title }}
            </h3>
            <p class="mt-5 max-w-xl leading-7 text-muted">{{ feature.body }}</p>
          </article>
        </div>
      </section>

      <section id="flow" class="border-y border-line bg-paper py-24">
        <div class="mx-auto max-w-[1300px] px-5 lg:px-8">
          <div class="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div class="reveal">
              <h2 class="font-serif text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl">
                Your obligations are already written down. Just badly.
              </h2>
              <p class="mt-6 text-lg leading-8 text-muted">
                Goalden watches the places where work gets promised casually, pulls the useful
                parts into one accountability layer, and uses that context when a distraction site
                opens.
              </p>

              <div class="mt-8 grid gap-3 border-y border-line py-5">
                <div class="flex gap-4">
                  <span class="font-mono text-sm text-gold">01</span>
                  <p class="text-sm leading-6 text-muted">
                    Read only the sources you connect: Slack, Telegram, WhatsApp, Notion, email,
                    and docs.
                  </p>
                </div>
                <div class="flex gap-4">
                  <span class="font-mono text-sm text-gold">02</span>
                  <p class="text-sm leading-6 text-muted">
                    Extract commitments, deadlines, blockers, and repeated “I’ll do it later”
                    patterns.
                  </p>
                </div>
                <div class="flex gap-4">
                  <span class="font-mono text-sm text-gold">03</span>
                  <p class="text-sm leading-6 text-muted">
                    Turn that into a specific prompt when the browser tries to open a feed.
                  </p>
                </div>
              </div>
            </div>

            <div class="reveal lg:w-[112%] lg:translate-x-8 xl:w-[118%] xl:translate-x-10" style="--delay: 120ms">
              <IntegrationBeam />
            </div>
          </div>

          <div class="mt-10 overflow-hidden rounded-[10px] border border-line bg-[#f0efeb] text-[#26251e]">
            <div class="grid border-b border-line bg-paper px-5 py-4 font-mono text-xs uppercase tracking-[0.16em] text-muted md:grid-cols-[0.8fr_1.4fr_1fr]">
              <span>Signal</span>
              <span class="hidden md:block">Example</span>
              <span class="hidden md:block">What Goalden creates</span>
            </div>
            <div
              v-for="(row, index) in extractionRows"
              :key="row.signal"
              class="reveal grid gap-3 border-b border-line px-5 py-5 last:border-b-0 md:grid-cols-[0.8fr_1.4fr_1fr] md:items-center"
              :style="{ '--delay': `${index * 70}ms` }"
            >
              <p class="font-semibold">{{ row.signal }}</p>
              <p class="text-sm leading-6 text-muted">{{ row.example }}</p>
              <p class="text-sm font-medium text-ink">{{ row.output }}</p>
            </div>
          </div>

          <div class="mt-6 grid gap-4 lg:grid-cols-3">
            <article
              v-for="(rule, index) in accountabilityRules"
              :key="rule.title"
              class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e]"
              :style="{ '--delay': `${index * 80}ms` }"
            >
              <h3 class="text-lg font-semibold tracking-[-0.02em]">{{ rule.title }}</h3>
              <p class="mt-3 text-sm leading-6 text-muted">{{ rule.body }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="mx-auto max-w-[1300px] px-5 py-24 lg:px-8">
        <div class="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div class="reveal lg:sticky lg:top-24">
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Inside Goalden
            </p>
            <h2 class="mt-4 font-serif text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl">
              One loop from promise to earned break.
            </h2>
            <p class="mt-6 text-lg leading-8 text-muted">
              Goalden connects your commitments, AI coach, browser extension, and break timer
              into one simple flow: finish something real, then open the feed.
            </p>
          </div>

          <div class="grid gap-4">
            <div class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e] lg:p-8">
              <div class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p class="font-mono text-xs uppercase tracking-[0.18em] text-blue-ink">
                    Task inbox
                  </p>
                  <h3 class="mt-4 font-serif text-4xl leading-[1] tracking-[-0.04em]">
                    Review what the agent found before it becomes a rule.
                  </h3>
                </div>
                <div class="rounded-full border border-line bg-[#26251e] px-3 py-2 font-mono text-xs text-[#e6e5e0]">
                  12 found
                </div>
              </div>
              <div class="mt-7 grid gap-3">
                <div class="rounded-lg border border-line bg-[#f7f7f4] p-4">
                  <p class="text-sm font-semibold">Investor update</p>
                  <p class="mt-1 text-sm leading-6 text-muted">
                    Due tomorrow. Missing churn notes and expansion number.
                  </p>
                </div>
                <div class="rounded-lg border border-line bg-[#f7f7f4] p-4">
                  <p class="text-sm font-semibold">Design feedback for landing</p>
                  <p class="mt-1 text-sm leading-6 text-muted">
                    You promised to send comments after the morning call.
                  </p>
                </div>
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e]" style="--delay: 80ms">
                <p class="font-mono text-xs uppercase tracking-[0.18em] text-red-ink">
                  Extension
                </p>
                <h3 class="mt-4 text-xl font-semibold tracking-[-0.02em]">Context-aware block</h3>
                <p class="mt-3 text-sm leading-6 text-muted">
                  YouTube, TikTok, Reddit, and Instagram are intercepted with a message tied to
                  the task you keep postponing.
                </p>
              </div>

              <div class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e]" style="--delay: 160ms">
                <p class="font-mono text-xs uppercase tracking-[0.18em] text-green-ink">
                  Coach
                </p>
                <h3 class="mt-4 text-xl font-semibold tracking-[-0.02em]">Progress check</h3>
                <p class="mt-3 text-sm leading-6 text-muted">
                  The coach accepts concrete progress, rejects vague updates, and can suggest a
                  smaller step when the task is too big.
                </p>
              </div>

              <div class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e] md:col-span-2" style="--delay: 240ms">
                <p class="font-mono text-xs uppercase tracking-[0.18em] text-gold">
                  Break timer
                </p>
                <div class="mt-5 grid gap-4 md:grid-cols-[0.7fr_1.3fr] md:items-center">
                  <div>
                    <p class="font-mono text-5xl tracking-[-0.06em]">15:00</p>
                    <p class="mt-2 text-sm text-muted">unlocked after approved progress</p>
                  </div>
                  <p class="text-sm leading-6 text-muted">
                    Breaks stay short and clear. You get room to decompress without losing the
                    rest of the day to the feed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="privacy" class="mx-auto max-w-[1300px] px-5 py-24 lg:px-8">
        <div class="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-8 text-[#26251e] lg:p-10">
            <div class="mb-8 inline-flex rounded-md bg-[#26251e] p-3 text-[#e6e5e0]">
              <PhShieldCheck :size="28" weight="bold" />
            </div>
            <h2 class="font-serif text-5xl leading-[0.98] tracking-[-0.045em]">
              Your chats stay under your control.
            </h2>
          </div>

          <div class="reveal space-y-5 text-lg leading-8 text-muted" style="--delay: 90ms">
            <p>
              You choose which spaces Goalden can read. Extracted commitments stay visible before
              they affect your blocks, and you can remove a source whenever you want.
            </p>
            <p>
              When Goalden mentions a promise, it shows where that promise came from. The coaching
              stays direct, but the context stays visible.
            </p>
            <div class="grid gap-3 pt-2 sm:grid-cols-3">
              <div class="rounded-lg border border-line bg-[#f0efeb] p-4 text-sm text-[#26251e]">
                Source controls
              </div>
              <div class="rounded-lg border border-line bg-[#f0efeb] p-4 text-sm text-[#26251e]">
                Review queue
              </div>
              <div class="rounded-lg border border-line bg-[#f0efeb] p-4 text-sm text-[#26251e]">
                Delete anytime
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" class="border-y border-line bg-paper py-24">
        <div class="mx-auto max-w-[1300px] px-5 lg:px-8">
          <div class="reveal max-w-3xl">
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Pricing</p>
            <h2 class="mt-4 font-serif text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl">
              Start free. Pay when Goalden becomes part of your day.
            </h2>
          </div>

          <div class="mt-12 grid gap-4 lg:grid-cols-3">
            <article class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e] lg:p-8">
              <p class="font-mono text-xs uppercase tracking-[0.18em] text-green-ink">Beta</p>
              <h3 class="mt-5 text-2xl font-semibold tracking-[-0.03em]">Free extension</h3>
              <p class="mt-3 text-sm leading-6 text-muted">
                Browser blocking, progress check-ins, and a local timer while the first cohort tests the loop.
              </p>
              <p class="mt-8 font-mono text-4xl tracking-[-0.06em]">$0</p>
            </article>

            <article class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e] lg:p-8" style="--delay: 80ms">
              <p class="font-mono text-xs uppercase tracking-[0.18em] text-blue-ink">Personal</p>
              <h3 class="mt-5 text-2xl font-semibold tracking-[-0.03em]">Goalden Coach</h3>
              <p class="mt-3 text-sm leading-6 text-muted">
                AI review, commitment extraction, Slack and Notion sources, and smarter unlock decisions.
              </p>
              <p class="mt-8 font-mono text-4xl tracking-[-0.06em]">Soon</p>
            </article>

            <article class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-6 text-[#26251e] lg:p-8" style="--delay: 160ms">
              <p class="font-mono text-xs uppercase tracking-[0.18em] text-gold">Students</p>
              <h3 class="mt-5 text-2xl font-semibold tracking-[-0.03em]">Study groups</h3>
              <p class="mt-3 text-sm leading-6 text-muted">
                Shared accountability settings for classmates, project teams, and exam-season focus blocks.
              </p>
              <p class="mt-8 font-mono text-4xl tracking-[-0.06em]">Invite</p>
            </article>
          </div>
        </div>
      </section>

      <section id="waitlist" class="border-y border-line bg-[#f7f7f4] py-24 text-ink">
        <div class="mx-auto grid max-w-[1300px] gap-10 px-5 lg:grid-cols-[1fr_0.88fr] lg:px-8">
          <div class="reveal">
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Early access
            </p>
            <h2 class="mt-4 max-w-3xl font-serif text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl">
              Get Goalden before your next scroll spiral.
            </h2>
          </div>
          <form
            action="https://formsubmit.co/wifiskeleton300@gmail.com"
            method="POST"
            class="reveal rounded-[10px] border border-line bg-[#f0efeb] p-5 text-[#26251e] lg:p-7"
            style="--delay: 100ms"
          >
            <input type="hidden" name="_subject" value="New Goalden waitlist signup" />
            <input type="hidden" name="_template" value="table" />
            <input type="hidden" name="_captcha" value="false" />
            <input type="hidden" name="source" value="Goalden landing waitlist" />
            <label class="block text-sm font-semibold" for="email">Work email</label>
            <div class="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="email"
                name="email"
                type="email"
                required
                autocomplete="email"
                placeholder="you@company.com"
                class="min-h-12 flex-1 rounded-full border border-line bg-[#f7f7f4] px-4 text-ink outline-none transition placeholder:text-muted focus:border-ink"
              />
              <button
                type="submit"
                class="rounded-full bg-[#26251e] px-5 py-3 text-sm font-semibold text-[#e6e5e0] transition hover:bg-[#34332b] active:scale-[0.98]"
              >
                Join waitlist
              </button>
            </div>
            <p class="mt-4 text-sm leading-6 text-muted">
              Early access starts with the integrations people ask for most: Slack, Telegram,
              WhatsApp, Notion, and the browser extension.
            </p>
          </form>
        </div>
      </section>

      <section id="faq" class="mx-auto max-w-4xl px-5 py-24">
        <div class="reveal text-center">
          <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Questions</p>
          <h2 class="mt-4 font-serif text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl">
            Before you connect your chats.
          </h2>
        </div>

        <div class="reveal mt-12 border-t border-line" style="--delay: 100ms">
          <div
            v-for="(item, index) in faq"
            :key="item.question"
            class="group border-b border-line transition-colors duration-300"
            :class="activeFaq === index ? 'bg-[#f0efeb]' : 'hover:bg-[#f0efeb]/70'"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-6 px-3 py-6 text-left sm:px-5"
              :aria-expanded="activeFaq === index"
              @click="activeFaq = activeFaq === index ? -1 : index"
            >
              <span
                class="text-lg font-semibold tracking-[-0.02em] transition-colors duration-300"
                :class="activeFaq === index ? 'text-ink' : 'text-ink/85'"
              >
                {{ item.question }}
              </span>
              <span
                class="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-[#f0efeb] font-mono text-xl leading-none text-muted transition duration-300"
                :class="activeFaq === index ? 'rotate-45 text-ink shadow-flat' : 'group-hover:text-ink'"
              >
                +
              </span>
            </button>
            <div
              class="grid overflow-hidden px-3 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-5"
              :class="activeFaq === index ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
            >
              <div
                class="min-h-0 pr-12 text-base leading-7 text-muted transition-[opacity,transform,padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                :class="activeFaq === index ? 'pb-6 opacity-100 translate-y-0' : 'pb-0 opacity-0 -translate-y-1'"
              >
                {{ item.answer }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-line bg-paper">
      <div class="mx-auto grid max-w-[1300px] gap-10 px-5 py-12 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <div class="flex items-center gap-3">
            <img src="/goalden-symbol-black.png" alt="" class="h-8 w-8 object-contain" />
            <img src="/goalden-name-black.png" alt="Goalden" class="h-6 w-auto object-contain" />
          </div>
          <p class="mt-5 max-w-sm text-sm leading-6 text-muted">
            AI accountability for students and builders who want the feed to wait until real work moves.
          </p>
        </div>

        <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Product</p>
            <div class="mt-4 grid gap-3 text-sm text-muted">
              <a href="#how" class="transition hover:text-ink">How it works</a>
              <a href="#inside" class="transition hover:text-ink">Inside Goalden</a>
              <a href="#pricing" class="transition hover:text-ink">Pricing</a>
              <a href="#waitlist" class="transition hover:text-ink">Get extension</a>
            </div>
          </div>

          <div>
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Legal</p>
            <div class="mt-4 grid gap-3 text-sm text-muted">
              <a href="/legal/privacy.html" target="_blank" rel="noreferrer" class="transition hover:text-ink">Privacy</a>
              <a href="/legal/security.html" target="_blank" rel="noreferrer" class="transition hover:text-ink">Security</a>
              <a href="/legal/terms.html" target="_blank" rel="noreferrer" class="transition hover:text-ink">Terms</a>
              <a href="/legal/data-controls.html" target="_blank" rel="noreferrer" class="transition hover:text-ink">Data controls</a>
            </div>
          </div>

          <div>
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Company</p>
            <div class="mt-4 grid gap-3 text-sm text-muted">
              <a href="#waitlist" class="transition hover:text-ink">Early access</a>
              <a href="#faq" class="transition hover:text-ink">FAQ</a>
              <span>2026 Goalden</span>
            </div>
          </div>

          <div>
            <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Contact</p>
            <div class="mt-4 grid gap-3 text-sm text-muted">
              <a href="mailto:wifiskeleton300@gmail.com" class="transition hover:text-ink">
                Gmail
              </a>
              <a
                href="https://www.linkedin.com/in/alim-bupeshev-7b19b03b5/"
                target="_blank"
                rel="noreferrer"
                class="transition hover:text-ink"
              >
                LinkedIn
              </a>
              <a
                href="https://www.instagram.com/lyam.dev/"
                target="_blank"
                rel="noreferrer"
                class="transition hover:text-ink"
              >
                Instagram
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
