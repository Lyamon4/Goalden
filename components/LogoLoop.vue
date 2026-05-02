<template>
  <div
    ref="containerRef"
    :class="rootClasses"
    :style="containerStyle"
    role="region"
    :aria-label="ariaLabel"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <template v-if="fadeOut">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[clamp(24px,8%,120px)] bg-[linear-gradient(to_right,var(--logoloop-fadeColor,var(--logoloop-fadeColorAuto))_0%,rgba(0,0,0,0)_100%)]"
      />
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[clamp(24px,8%,120px)] bg-[linear-gradient(to_left,var(--logoloop-fadeColor,var(--logoloop-fadeColorAuto))_0%,rgba(0,0,0,0)_100%)]"
      />
    </template>

    <div ref="trackRef" class="flex w-max select-none will-change-transform motion-reduce:transform-none">
      <ul
        v-for="copyIndex in copyCount"
        :key="`copy-${copyIndex - 1}`"
        class="flex items-center"
        role="list"
        :aria-hidden="copyIndex > 1"
        :ref="el => setSequenceRef(el, copyIndex)"
      >
        <li
          v-for="(item, itemIndex) in logos"
          :key="`${copyIndex - 1}-${itemIndex}`"
          :class="[
            'mr-[var(--logoloop-gap)] flex-none text-[length:var(--logoloop-logoHeight)] leading-none',
            scaleOnHover && 'group/item overflow-visible'
          ]"
          role="listitem"
        >
          <a
            v-if="item.href"
            :href="item.href"
            :aria-label="getItemAriaLabel(item) || 'logo link'"
            class="inline-flex items-center rounded no-underline transition-opacity duration-200 ease-linear hover:opacity-80 focus-visible:outline focus-visible:outline-current focus-visible:outline-offset-2"
            target="_blank"
            rel="noreferrer noopener"
          >
            <span
              v-if="isNodeItem(item)"
              :class="nodeClasses"
              v-html="item.node"
            />
            <img
              v-else
              :class="imageClasses"
              :src="item.src"
              :srcset="item.srcSet"
              :sizes="item.sizes"
              :width="item.width"
              :height="item.height"
              :alt="item.alt ?? ''"
              :title="item.title"
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          </a>

          <template v-else>
            <span
              v-if="isNodeItem(item)"
              :class="nodeClasses"
              v-html="item.node"
            />
            <img
              v-else
              :class="imageClasses"
              :src="item.src"
              :srcset="item.srcSet"
              :sizes="item.sizes"
              :width="item.width"
              :height="item.height"
              :alt="item.alt ?? ''"
              :title="item.title"
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch, type CSSProperties } from 'vue'

export type LogoItemNode = {
  node: string
  href?: string
  title?: string
  ariaLabel?: string
}

export type LogoItemImage = {
  src: string
  alt?: string
  href?: string
  title?: string
  srcSet?: string
  sizes?: string
  width?: number
  height?: number
}

export type LogoItem = LogoItemNode | LogoItemImage

interface LogoLoopProps {
  logos: LogoItem[]
  speed?: number
  direction?: 'left' | 'right'
  width?: number | string
  logoHeight?: number
  gap?: number
  pauseOnHover?: boolean
  fadeOut?: boolean
  fadeOutColor?: string
  scaleOnHover?: boolean
  ariaLabel?: string
  className?: string
  style?: CSSProperties
}

const animationConfig = {
  smoothTau: 0.25,
  minCopies: 2,
  copyHeadroom: 2
} as const

const props = withDefaults(defineProps<LogoLoopProps>(), {
  speed: 120,
  direction: 'left',
  width: '100%',
  logoHeight: 60,
  gap: 32,
  pauseOnHover: true,
  fadeOut: false,
  fadeOutColor: undefined,
  scaleOnHover: false,
  ariaLabel: 'Partner logos',
  className: '',
  style: () => ({})
})

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const trackRef = useTemplateRef<HTMLDivElement>('trackRef')
const seqRef = ref<HTMLUListElement | null>(null)
const seqWidth = ref(0)
const copyCount = ref(animationConfig.minCopies)
const isHovered = ref(false)
const offsetRef = ref(0)
const velocityRef = ref(0)

let rafRef: number | null = null
let lastTimestampRef: number | null = null
let resizeObserver: ResizeObserver | null = null
let cleanupResize: (() => void) | undefined
let cleanupImages: (() => void) | undefined
let cleanupAnimation: (() => void) | undefined

const targetVelocity = computed(() => {
  const magnitude = Math.abs(props.speed)
  const directionMultiplier = props.direction === 'left' ? 1 : -1
  const speedMultiplier = props.speed < 0 ? -1 : 1
  return magnitude * directionMultiplier * speedMultiplier
})

const containerStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  '--logoloop-gap': `${props.gap}px`,
  '--logoloop-logoHeight': `${props.logoHeight}px`,
  ...(props.fadeOutColor ? { '--logoloop-fadeColor': props.fadeOutColor } : {}),
  ...props.style
}))

const rootClasses = computed(() => [
  'relative overflow-x-hidden',
  '[--logoloop-gap:32px]',
  '[--logoloop-logoHeight:28px]',
  '[--logoloop-fadeColorAuto:#ffffff]',
  props.scaleOnHover ? 'py-[calc(var(--logoloop-logoHeight)*0.1)]' : '',
  props.className
].filter(Boolean))

const imageClasses = computed(() => [
  'block h-[var(--logoloop-logoHeight)] w-auto object-contain',
  'pointer-events-none [-webkit-user-drag:none] [image-rendering:-webkit-optimize-contrast]',
  'motion-reduce:transition-none',
  props.scaleOnHover ? 'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/item:scale-110' : ''
].filter(Boolean))

const nodeClasses = computed(() => [
  'inline-flex items-center text-[length:var(--logoloop-logoHeight)] leading-none motion-reduce:transition-none',
  props.scaleOnHover ? 'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/item:scale-110' : ''
].filter(Boolean))

const isNodeItem = (item: LogoItem): item is LogoItemNode => 'node' in item

const getItemAriaLabel = (item: LogoItem): string | undefined => {
  if (isNodeItem(item)) return item.ariaLabel ?? item.title
  return item.alt ?? item.title
}

const setSequenceRef = (el: Element | null, copyIndex: number) => {
  if (copyIndex === 1) seqRef.value = el as HTMLUListElement | null
}

const handleMouseEnter = () => {
  if (props.pauseOnHover) isHovered.value = true
}

const handleMouseLeave = () => {
  if (props.pauseOnHover) isHovered.value = false
}

const stopAnimationLoop = () => {
  if (rafRef !== null) {
    cancelAnimationFrame(rafRef)
    rafRef = null
  }
  lastTimestampRef = null
}

const startAnimationLoop = () => {
  const track = trackRef.value
  if (!track) return undefined

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (seqWidth.value > 0) {
    offsetRef.value = ((offsetRef.value % seqWidth.value) + seqWidth.value) % seqWidth.value
    track.style.transform = `translate3d(${-offsetRef.value}px, 0, 0)`
  }

  if (prefersReduced) {
    track.style.transform = 'translate3d(0, 0, 0)'
    return () => {
      lastTimestampRef = null
    }
  }

  const animate = (timestamp: number) => {
    if (lastTimestampRef === null) lastTimestampRef = timestamp

    const deltaTime = Math.max(0, timestamp - lastTimestampRef) / 1000
    lastTimestampRef = timestamp

    const target = props.pauseOnHover && isHovered.value ? 0 : targetVelocity.value
    const easingFactor = 1 - Math.exp(-deltaTime / animationConfig.smoothTau)
    velocityRef.value += (target - velocityRef.value) * easingFactor

    if (seqWidth.value > 0) {
      let nextOffset = offsetRef.value + velocityRef.value * deltaTime
      nextOffset = ((nextOffset % seqWidth.value) + seqWidth.value) % seqWidth.value
      offsetRef.value = nextOffset
      track.style.transform = `translate3d(${-offsetRef.value}px, 0, 0)`
    }

    rafRef = requestAnimationFrame(animate)
  }

  rafRef = requestAnimationFrame(animate)
  return stopAnimationLoop
}

const updateDimensions = async () => {
  await nextTick()

  const containerWidth = containerRef.value?.clientWidth ?? 0
  const sequenceWidth = seqRef.value?.getBoundingClientRect?.()?.width ?? 0

  if (sequenceWidth > 0) {
    seqWidth.value = Math.ceil(sequenceWidth)
    const copiesNeeded = Math.ceil(containerWidth / sequenceWidth) + animationConfig.copyHeadroom
    copyCount.value = Math.max(animationConfig.minCopies, copiesNeeded)

    cleanupAnimation?.()
    cleanupAnimation = startAnimationLoop()
  }
}

const setupResizeObserver = () => {
  if (!window.ResizeObserver) {
    const handleResize = () => updateDimensions()
    window.addEventListener('resize', handleResize)
    updateDimensions()
    return () => window.removeEventListener('resize', handleResize)
  }

  resizeObserver = new ResizeObserver(updateDimensions)

  if (containerRef.value) resizeObserver.observe(containerRef.value)
  if (seqRef.value) resizeObserver.observe(seqRef.value)

  updateDimensions()

  return () => {
    resizeObserver?.disconnect()
    resizeObserver = null
  }
}

const setupImageLoader = () => {
  const images = seqRef.value?.querySelectorAll('img') ?? []

  if (images.length === 0) {
    updateDimensions()
    return undefined
  }

  let remainingImages = images.length
  const handleImageLoad = () => {
    remainingImages -= 1
    if (remainingImages === 0) updateDimensions()
  }

  images.forEach(img => {
    if (img.complete) {
      handleImageLoad()
    } else {
      img.addEventListener('load', handleImageLoad, { once: true })
      img.addEventListener('error', handleImageLoad, { once: true })
    }
  })

  return () => {
    images.forEach(img => {
      img.removeEventListener('load', handleImageLoad)
      img.removeEventListener('error', handleImageLoad)
    })
  }
}

const cleanup = () => {
  cleanupResize?.()
  cleanupImages?.()
  cleanupAnimation?.()
}

onMounted(async () => {
  await nextTick()
  window.setTimeout(() => {
    cleanupResize = setupResizeObserver()
    cleanupImages = setupImageLoader()
  }, 10)
})

onUnmounted(() => {
  cleanup()
})

watch(
  [() => props.logos, () => props.gap, () => props.logoHeight],
  async () => {
    await nextTick()
    cleanupImages?.()
    cleanupImages = setupImageLoader()
  },
  { deep: true }
)
</script>
