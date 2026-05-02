<script setup lang="ts">
import { useTemplateRef } from 'vue'

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const slackRef = useTemplateRef<HTMLDivElement>('slackRef')
const notionRef = useTemplateRef<HTMLDivElement>('notionRef')
const telegramRef = useTemplateRef<HTMLDivElement>('telegramRef')
const driveRef = useTemplateRef<HTMLDivElement>('driveRef')
const mailRef = useTemplateRef<HTMLDivElement>('mailRef')
const whatsappRef = useTemplateRef<HTMLDivElement>('whatsappRef')
const goaldenRef = useTemplateRef<HTMLDivElement>('goaldenRef')

const sourceTone = 'border-line bg-white text-ink'
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-[560px] w-full overflow-hidden bg-transparent p-5 md:h-[640px] md:p-8 lg:h-[680px]"
  >
    <div class="absolute inset-x-20 inset-y-12 z-10 flex flex-col justify-between md:inset-x-24 md:inset-y-16 lg:inset-x-28 lg:inset-y-20">
      <div class="flex items-start justify-between gap-4">
        <div ref="slackRef" :class="sourceTone" class="flex max-w-[10rem] items-center gap-3 rounded-lg border px-3 py-2">
          <img src="https://api.iconify.design/logos:slack-icon.svg" alt="" class="h-6 w-6 object-contain" />
          <span class="hidden text-sm font-medium sm:inline">Slack</span>
        </div>
        <div ref="driveRef" :class="sourceTone" class="flex max-w-[10rem] items-center gap-3 rounded-lg border px-3 py-2">
          <img src="https://api.iconify.design/logos:google-drive.svg" alt="" class="h-6 w-6 object-contain" />
          <span class="hidden text-sm font-medium sm:inline">Drive</span>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div ref="notionRef" :class="sourceTone" class="flex max-w-[10rem] items-center gap-3 rounded-lg border px-3 py-2">
          <img src="https://api.iconify.design/logos:notion-icon.svg" alt="" class="h-6 w-6 object-contain" />
          <span class="hidden text-sm font-medium sm:inline">Notion</span>
        </div>
        <div ref="mailRef" :class="sourceTone" class="flex max-w-[10rem] items-center gap-3 rounded-lg border px-3 py-2">
          <img src="https://api.iconify.design/logos:google-gmail.svg" alt="" class="h-6 w-6 object-contain" />
          <span class="hidden text-sm font-medium sm:inline">Gmail</span>
        </div>
      </div>

      <div class="flex items-end justify-between gap-4">
        <div ref="telegramRef" :class="sourceTone" class="flex max-w-[10rem] items-center gap-3 rounded-lg border px-3 py-2">
          <img src="https://api.iconify.design/logos:telegram.svg" alt="" class="h-6 w-6 object-contain" />
          <span class="hidden text-sm font-medium sm:inline">Telegram</span>
        </div>
        <div ref="whatsappRef" :class="sourceTone" class="flex max-w-[10rem] items-center gap-3 rounded-lg border px-3 py-2">
          <img src="https://api.iconify.design/logos:whatsapp-icon.svg" alt="" class="h-6 w-6 object-contain" />
          <span class="hidden text-sm font-medium sm:inline">WhatsApp</span>
        </div>
      </div>
    </div>

    <div class="absolute inset-0 z-20 flex items-center justify-center">
      <div
        ref="goaldenRef"
        class="grid size-24 place-items-center rounded-xl border border-line bg-paper p-4 md:size-28"
      >
        <img src="/goalden-symbol-black.png" alt="Goalden" class="h-14 w-14 object-contain md:h-16 md:w-16" />
      </div>
    </div>

    <AnimatedBeam :container-ref="containerRef" :from-ref="slackRef" :to-ref="goaldenRef" :curvature="-95" :start-x-offset="48" :start-y-offset="22" :end-y-offset="-10" :duration="5.2" />
    <AnimatedBeam :container-ref="containerRef" :from-ref="notionRef" :to-ref="goaldenRef" :start-x-offset="52" :duration="4.8" :delay="0.2" />
    <AnimatedBeam :container-ref="containerRef" :from-ref="telegramRef" :to-ref="goaldenRef" :curvature="95" :start-x-offset="58" :start-y-offset="-22" :end-y-offset="10" :duration="5.5" :delay="0.4" />
    <AnimatedBeam :container-ref="containerRef" :from-ref="driveRef" :to-ref="goaldenRef" :curvature="-95" :start-x-offset="-48" :start-y-offset="22" :end-y-offset="-10" :duration="5.1" :delay="0.1" />
    <AnimatedBeam :container-ref="containerRef" :from-ref="mailRef" :to-ref="goaldenRef" :start-x-offset="-52" :duration="4.7" :delay="0.35" />
    <AnimatedBeam :container-ref="containerRef" :from-ref="whatsappRef" :to-ref="goaldenRef" :curvature="95" :start-x-offset="-58" :start-y-offset="-22" :end-y-offset="10" :duration="5.4" :delay="0.55" />
  </div>
</template>
