<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watchEffect } from 'vue'

interface AnimatedBeamProps {
  class?: string
  containerRef?: HTMLElement | null
  fromRef?: HTMLElement | null
  toRef?: HTMLElement | null
  curvature?: number
  reverse?: boolean
  pathColor?: string
  pathWidth?: number
  pathOpacity?: number
  gradientStartColor?: string
  gradientStopColor?: string
  delay?: number
  duration?: number
  startXOffset?: number
  startYOffset?: number
  endXOffset?: number
  endYOffset?: number
}

const props = withDefaults(defineProps<AnimatedBeamProps>(), {
  class: '',
  curvature: 0,
  reverse: false,
  pathColor: '#d8d2c4',
  pathWidth: 2,
  pathOpacity: 0.36,
  gradientStartColor: '#956400',
  gradientStopColor: '#111111',
  delay: 0,
  duration: 5,
  startXOffset: 0,
  startYOffset: 0,
  endXOffset: 0,
  endYOffset: 0
})

const id = `beam-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const pathD = ref('')
const svgDimensions = ref({ width: 0, height: 0 })
const isVertical = ref(false)
const isRightToLeft = ref(false)
const isBottomToTop = ref(false)

let resizeObserver: ResizeObserver | undefined
let frameId = 0

const x1 = computed(() => {
  const direction = props.reverse ? !isRightToLeft.value : isRightToLeft.value
  return direction ? '90%; -10%;' : '10%; 110%;'
})

const x2 = computed(() => {
  const direction = props.reverse ? !isRightToLeft.value : isRightToLeft.value
  return direction ? '100%; 0%;' : '0%; 100%;'
})

const y1 = computed(() => {
  const direction = props.reverse ? !isBottomToTop.value : isBottomToTop.value
  return direction ? '90%; -10%;' : '10%; 110%;'
})

const y2 = computed(() => {
  const direction = props.reverse ? !isBottomToTop.value : isBottomToTop.value
  return direction ? '100%; 0%;' : '0%; 100%;'
})

const svgClass = computed(() =>
  ['pointer-events-none absolute left-0 top-0 z-0 transform-gpu', props.class]
    .filter(Boolean)
    .join(' ')
)

function scheduleUpdate() {
  cancelAnimationFrame(frameId)
  frameId = requestAnimationFrame(updatePath)
}

function updatePath() {
  if (!props.containerRef || !props.fromRef || !props.toRef) {
    return
  }

  const containerRect = props.containerRef.getBoundingClientRect()
  const rectA = props.fromRef.getBoundingClientRect()
  const rectB = props.toRef.getBoundingClientRect()

  svgDimensions.value = {
    width: containerRect.width,
    height: containerRect.height
  }

  const startX =
    rectA.left - containerRect.left + rectA.width / 2 + props.startXOffset
  const startY =
    rectA.top - containerRect.top + rectA.height / 2 + props.startYOffset
  const endX = rectB.left - containerRect.left + rectB.width / 2 + props.endXOffset
  const endY = rectB.top - containerRect.top + rectB.height / 2 + props.endYOffset

  isVertical.value = Math.abs(endY - startY) > Math.abs(endX - startX)
  isRightToLeft.value = endX < startX
  isBottomToTop.value = endY < startY

  const controlY = startY - props.curvature
  pathD.value = `M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`
}

onMounted(async () => {
  await nextTick()
  scheduleUpdate()

  watchEffect(() => {
    if (!props.containerRef) {
      return
    }

    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(props.containerRef)
    scheduleUpdate()
  })

  window.addEventListener('resize', scheduleUpdate, { passive: true })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleUpdate)
  cancelAnimationFrame(frameId)
})
</script>

<template>
  <svg
    fill="none"
    :width="svgDimensions.width"
    :height="svgDimensions.height"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${svgDimensions.width} ${svgDimensions.height}`"
    :class="svgClass"
  >
    <path
      :d="pathD"
      :stroke="pathColor"
      :stroke-width="pathWidth"
      :stroke-opacity="pathOpacity"
      stroke-linecap="round"
    />
    <path
      :d="pathD"
      :stroke-width="pathWidth"
      :stroke="`url(#${id})`"
      stroke-opacity="1"
      stroke-linecap="round"
    />
    <defs>
      <linearGradient
        :id="id"
        gradientUnits="userSpaceOnUse"
        x1="0%"
        x2="0%"
        y1="0%"
        y2="0%"
      >
        <stop :stop-color="gradientStartColor" stop-opacity="0" />
        <stop :stop-color="gradientStartColor" />
        <stop offset="32.5%" :stop-color="gradientStopColor" />
        <stop offset="100%" :stop-color="gradientStopColor" stop-opacity="0" />
        <animate
          v-if="!isVertical"
          attributeName="x1"
          :values="x1"
          :dur="`${duration}s`"
          :begin="`${delay}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite"
        />
        <animate
          v-if="!isVertical"
          attributeName="x2"
          :values="x2"
          :dur="`${duration}s`"
          :begin="`${delay}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite"
        />
        <animate
          v-if="isVertical"
          attributeName="y1"
          :values="y1"
          :dur="`${duration}s`"
          :begin="`${delay}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite"
        />
        <animate
          v-if="isVertical"
          attributeName="y2"
          :values="y2"
          :dur="`${duration}s`"
          :begin="`${delay}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite"
        />
      </linearGradient>
    </defs>
  </svg>
</template>
