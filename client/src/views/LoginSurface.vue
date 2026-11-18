<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { accountApi } from '../api'

const props = defineProps({ sessionId: { type: String, required: true }, platform: { type: String, required: true } })
const frame = ref('')
const zoom = ref(false)
const input = ref('')
const notice = ref('')
const controller = new AbortController()
let frameTimer
let inputTimer
let pointer
let image
let lastPoint
let startPoint
let dragging = false
let queued = []
let pending = Promise.resolve()

async function refresh() {
  try {
    const blob = await accountApi.getLoginPreview(props.sessionId, controller.signal)
    if (controller.signal.aborted) return
    const next = URL.createObjectURL(blob)
    const previous = frame.value
    frame.value = next
    if (previous) URL.revokeObjectURL(previous)
  } catch {
    // A platform navigation can interrupt a frame. Keep the previous frame until the next one arrives.
  }
  if (!controller.signal.aborted) frameTimer = setTimeout(refresh, 550)
}

function transmit(events) {
  pending = pending.then(async () => {
    if (controller.signal.aborted) return
    try {
      await accountApi.sendLoginInputs(props.sessionId, events)
      notice.value = ''
    } catch (error) {
      notice.value = error.response?.data?.message || '操作未送达，请重试。'
    }
  })
}

function flush() {
  clearTimeout(inputTimer)
  inputTimer = undefined
  if (!queued.length) return
  transmit(queued)
  queued = []
}

function pointFrom(event) {
  const box = image.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
    y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
  }
}

function addPoint(type, point) {
  lastPoint = point
  queued.push({ type, ...point })
  if (type !== 'move' || queued.length >= 80) flush()
  else if (inputTimer === undefined) inputTimer = setTimeout(flush, 75)
}

function pointerDown(event) {
  if (pointer !== undefined || event.button !== 0) return
  event.preventDefault()
  image = event.currentTarget
  image.focus({ preventScroll: true })
  pointer = event.pointerId
  image.setPointerCapture(pointer)
  startPoint = pointFrom(event)
  dragging = false
}

function pointerMove(event) {
  if (event.pointerId !== pointer) return
  const point = pointFrom(event)
  if (!dragging) {
    const box = image.getBoundingClientRect()
    if (Math.hypot((point.x - startPoint.x) * box.width, (point.y - startPoint.y) * box.height) < 4) return
    dragging = true
    addPoint('down', startPoint)
  }
  addPoint('move', point)
}

function pointerUp(event) {
  if (event.pointerId !== pointer) return
  const id = pointer
  pointer = undefined
  if (dragging) addPoint('up', event.type === 'pointerup' ? pointFrom(event) : lastPoint)
  else if (event.type === 'pointerup') addPoint('click', startPoint)
  dragging = false
  if (image.hasPointerCapture(id)) image.releasePointerCapture(id)
}

function sendText(value) {
  if (!value) return
  if (value.length > 256) {
    notice.value = '每次最多输入 256 个字符。'
    return
  }
  flush()
  transmit([{ type: 'text', text: value }])
}

function sendKey(key) {
  flush()
  transmit([{ type: 'key', key }])
}

function keyboard(event) {
  if (event.isComposing || event.altKey) return
  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 'a') {
      event.preventDefault()
      sendKey('Control+A')
    }
    return
  }
  if (['Backspace', 'Delete', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    sendKey(event.key)
  } else if (event.key.length === 1) {
    event.preventDefault()
    sendText(event.key)
  }
}

function submitText() {
  sendText(input.value)
  input.value = ''
}

onMounted(refresh)
onBeforeUnmount(() => {
  controller.abort()
  clearTimeout(frameTimer)
  clearTimeout(inputTimer)
  if (frame.value) URL.revokeObjectURL(frame.value)
})
</script>

<template>
  <div class="login-surface">
    <div class="login-controls">
      <p>用手机扫码。遇到验证，可点击画面、拖动滑块或填写验证码。</p>
      <el-button size="small" :disabled="!frame" @click="zoom = !zoom">{{ zoom ? '适应窗口' : '放大画面' }}</el-button>
    </div>
    <div class="login-frame" :class="{ zoom }">
      <img v-if="frame" :src="frame" :alt="`${platform}实时登录画面`" width="980" height="760"
        tabindex="0" draggable="false" @pointerdown="pointerDown" @pointermove="pointerMove"
        @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp"
        @keydown="keyboard" @paste.prevent="sendText($event.clipboardData?.getData('text/plain'))">
      <p v-else class="frame-loading" role="status">正在加载登录画面…</p>
    </div>
    <form v-if="frame" class="login-controls" @submit.prevent="submitText">
      <label for="remote-login-text">验证码</label>
      <input id="remote-login-text" v-model="input" type="text" maxlength="256" autocomplete="off"
        placeholder="先点击画面中的输入框">
      <el-button native-type="submit" size="small" :disabled="!input">输入到登录页</el-button>
      <el-button size="small" @click="sendKey('Backspace')">退格</el-button>
      <el-button size="small" @click="sendKey('Tab')">下一项</el-button>
      <el-button size="small" @click="sendKey('Enter')">回车</el-button>
    </form>
    <small v-if="notice" role="status">{{ notice }}</small>
  </div>
</template>

<style scoped>
.login-surface { display: grid; gap: 10px; text-align: left; }
.login-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.login-controls p { flex: 1 1 280px; margin: 0; }
.login-controls input { flex: 1 1 160px; min-width: 0; padding: 7px 9px; border: 1px solid #cbd5e1; border-radius: 5px; }
.login-controls .el-button { margin: 0; }
.login-frame { max-height: 62vh; overflow: auto; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; }
.login-frame img { display: block; width: 100%; height: auto; touch-action: none; cursor: crosshair; user-select: none; }
.login-frame.zoom img { width: 980px; max-width: none; }
.frame-loading { text-align: center; padding: 24px; }
</style>
