// Minimal test harness for vsse without external deps
// Node ESM script
import { SSEClient } from '../src/index.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('PASS:', msg)
    passed++
  }
}

// Provide minimal window/timers and EventSource/fetch mocks
const listenersMap = new Map()
const added = []

const windowMock = {
  addEventListener(type, fn) {
    if (!listenersMap.has(type)) listenersMap.set(type, new Set())
    listenersMap.get(type).add(fn)
    added.push({ type, fn })
  },
  removeEventListener(type, fn) {
    if (listenersMap.has(type)) listenersMap.get(type).delete(fn)
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
}

// Expose globally
globalThis.window = windowMock

class MockEventSource {
  constructor(url, opts) {
    this.url = url
    this.withCredentials = !!(opts && opts.withCredentials)
    this.handlers = new Map()
    this.closed = false
  }
  addEventListener(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type).add(fn)
  }
  close() {
    this.closed = true
  }
  dispatch(type, data) {
    const hs = this.handlers.get(type)
    if (hs) {
      for (const h of hs) {
        try { h({ type, data }) } catch {}
      }
    }
  }
}

// Make EventSource visible to vsse code (it calls new EventSource(...))
globalThis.EventSource = MockEventSource

// Mock fetch
globalThis.fetch = async function(url, init) {
  return { ok: true, status: 200, statusText: 'OK' }
}

async function testIdleDoesNotCloseWhenActive() {
  const client = new SSEClient({ url: 'mock://sse', idleTimeout: 50 })
  const { unsubscribe } = await client.postAndListen('/api/x', {}, () => {})
  // connect lazily
  await new Promise(r => setTimeout(r, 0))
  assert(client.es instanceof MockEventSource, 'EventSource created when listener exists')
  await new Promise(r => setTimeout(r, 80))
  assert(client.es && !client.es.closed, 'Not closed by idle while listener exists')
  unsubscribe()
  await new Promise(r => setTimeout(r, 60))
  assert(!client.es, 'Closed by idle after no listeners')
}

async function testEventTypeFallback() {
  const client = new SSEClient({ url: 'mock://sse', eventName: 'notify', idleTimeout: 500 })
  let got
  await client.postAndListen('/api/x', {}, (msg) => { got = msg }, { requestId: 'r1' })
  await new Promise(r => setTimeout(r, 0))
  // find instance EventSource and dispatch a notify event without data.event
  client.es.dispatch('open')
  client.es.dispatch('notify', JSON.stringify({ requestId: 'r1', payload: { x: 1 } }))
  await new Promise(r => setTimeout(r, 0))
  assert(got && got.event === 'notify' && got.payload && got.payload.x === 1, 'Fallback to ev.type when data.event missing')
}

async function testDestroyRemovesListeners() {
  const before = added.length
  const client = new SSEClient({ url: 'mock://sse' })
  client.destroy()
  // after destroy, removing again should not throw and listeners should be gone
  for (const { type, fn } of added.slice(before)) {
    assert(!listenersMap.get(type) || !listenersMap.get(type).has(fn), 'Listener removed on destroy')
  }
}

async function testConnectWithoutListeners() {
  const client = new SSEClient({ url: 'mock://sse', idleTimeout: 500 })
  // connect() should establish connection even without listeners
  const result = client.connect()
  assert(result === true, 'connect() returns true when url is provided')
  await new Promise(r => setTimeout(r, 10))
  assert(client.es instanceof MockEventSource, 'connect() creates EventSource without listeners')
  assert(client.es.url === 'mock://sse', 'connect() uses correct url')
  client.close()
}

async function testConnectWithoutUrl() {
  const client = new SSEClient({ idleTimeout: 500 })
  const result = client.connect()
  assert(result === false, 'connect() returns false when url is missing')
  assert(!client.es, 'connect() does not create EventSource without url')
}

async function testConnectIdempotent() {
  const client = new SSEClient({ url: 'mock://sse' })
  const result1 = client.connect()
  const es1 = client.es
  const result2 = client.connect()
  const es2 = client.es
  assert(result1 === true && result2 === true, 'connect() returns true on repeated calls')
  assert(es1 === es2, 'connect() does not create duplicate connections')
  client.close()
}

;(async () => {
  try {
    await testIdleDoesNotCloseWhenActive()
    await testEventTypeFallback()
    await testDestroyRemovesListeners()
    await testConnectWithoutListeners()
    await testConnectWithoutUrl()
    await testConnectIdempotent()
  } catch (e) {
    console.error('Unexpected error in tests:', e)
    failed++
  }
  console.log(`Tests finished. Passed=${passed} Failed=${failed}`)
  if (failed > 0) process.exit(1)
})()
