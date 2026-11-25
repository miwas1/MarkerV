import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AiCallRecord } from '../src/domain/aiLog.ts'
import { selectAiRoute, type AiTask } from '../src/domain/aiRouting.ts'
import { runCloudFirst, runDeviceFirst, type AiAttempt, type AiRun } from '../src/domain/aiRun.ts'

// Fake models stand in for Gemini Nano and Cloud Gemini, so these tests show which model a
// request can reach under the real routing policy without needing a browser.
const everythingReady = { deviceAvailable: true, allowCloud: true, cloudConfigured: true, online: true }
const fromDevice: AiAttempt = { value: { ok: 'device' }, source: 'device', ms: 4000 }
const fromCloud: AiAttempt = { value: { ok: 'cloud' }, source: 'cloud', ms: 900 }

function harness(
  task: AiTask,
  isSample: boolean,
  state: Partial<typeof everythingReady> = {},
  overrides: Partial<AiRun> = {},
) {
  const calls: string[] = []
  const log: Array<Omit<AiCallRecord, 'id' | 'at'>> = []
  let active = true
  const run: AiRun = {
    task,
    route: selectAiRoute({ task, isSample, ...everythingReady, ...state }),
    fictional: isSample,
    active: () => active,
    device: async () => { calls.push('device'); return fromDevice },
    cloudPreflight: async () => { calls.push('preflight') },
    cloud: async (afterDeviceError) => { calls.push(afterDeviceError ? 'cloud-retry' : 'cloud'); return fromCloud },
    cloudBytes: 1234,
    cloudError: () => new Error('mapped cloud error'),
    record: (entry) => { log.push(entry) },
    ...overrides,
  }
  return { run, calls, log, cancel: () => { active = false } }
}

const failing = (calls: string[], error: Error) => async () => { calls.push('device'); throw error }

test('private student work never reaches the cloud model, even when the device run fails', async () => {
  for (const task of ['transcribe', 'mark', 'draftFeedback', 'followUp'] as const) {
    // Device succeeds: one on-device request and nothing else.
    const ok = harness(task, false)
    const result = await runDeviceFirst(ok.run)
    assert.deepEqual(ok.calls, ['device'], task)
    assert.deepEqual([result.source, result.cloudBytes], ['device', 0])
    assert.deepEqual(ok.log.map((row) => [row.mode, row.source, row.ok, row.cloudBytes]), [['ONLY_ON_DEVICE', 'device', true, 0]])

    // Device throws while cloud AI is enabled, configured and online: still no cloud contact.
    const broken = harness(task, false)
    broken.run.device = failing(broken.calls, new Error('model crashed'))
    await assert.rejects(runDeviceFirst(broken.run), /On-device AI could not complete this request/)
    assert.deepEqual(broken.calls, ['device'], task)
    assert.deepEqual(broken.log.map((row) => [row.source, row.ok, row.cloudBytes]), [['device', false, 0]])

    // A malformed reply keeps its type for the caller's single format retry, and stays local.
    const malformed = harness(task, false)
    malformed.run.device = failing(malformed.calls, new SyntaxError('The AI reply was incomplete'))
    await assert.rejects(runDeviceFirst(malformed.run), SyntaxError)
    assert.deepEqual(malformed.calls, ['device'], task)

    // A reply that claims to come from the cloud is refused rather than shown.
    const misrouted = harness(task, false, {}, { device: async () => ({ ...fromDevice, source: 'cloud' }) })
    await assert.rejects(runDeviceFirst(misrouted.run), /On-device AI could not complete this request/)
    assert.deepEqual(misrouted.calls, [])
    assert.equal(misrouted.log.every((row) => !row.ok && row.cloudBytes === 0), true)

    // No device model: the request is blocked with a reason instead of falling back.
    const unavailable = harness(task, false, { deviceAvailable: false })
    await assert.rejects(runDeviceFirst(unavailable.run), /on-device AI/i)
    assert.deepEqual(unavailable.calls, [], task)
    assert.deepEqual(unavailable.log, [])
  }
})

test('hybrid requests try the device first and use the cloud only as the policy allows', async () => {
  // Rubric drafting with a ready device: local only, so no policy or App Check request is made.
  const local = harness('draftRubric', false)
  await runDeviceFirst(local.run)
  assert.deepEqual(local.calls, ['device'])

  // Fictional sample, device fails: one explicit cloud retry, logged as a fallback.
  const retry = harness('mark', true)
  retry.run.device = failing(retry.calls, new Error('model crashed'))
  const retried = await runDeviceFirst(retry.run)
  assert.deepEqual(retry.calls, ['device', 'preflight', 'cloud-retry'])
  assert.deepEqual([retried.source, retried.cloudBytes], ['cloud', 1234])
  assert.deepEqual(
    retry.log.map((row) => [row.source, row.ok, row.cloudBytes, row.fallback, row.fictional]),
    [['device', false, 0, undefined, true], ['cloud', true, 1234, 'device-error', true]],
  )

  // Fictional sample on a phone: no device attempt, cloud fallback after the policy checks.
  const phone = harness('transcribe', true, { deviceAvailable: false })
  await runDeviceFirst(phone.run)
  assert.deepEqual(phone.calls, ['preflight', 'cloud'])
  assert.equal(phone.log[0].fallback, 'device-unavailable')

  // Cloud-only audit: straight to the cloud, with no fallback note.
  const audit = harness('auditRubric', false)
  await runDeviceFirst(audit.run)
  assert.deepEqual(audit.calls, ['preflight', 'cloud'])
  assert.deepEqual([audit.log[0].mode, audit.log[0].fallback], ['ONLY_IN_CLOUD', undefined])

  // A failed policy check explains itself and nothing is sent.
  const policy = harness('transcribe', true, { deviceAvailable: false }, {
    cloudPreflight: async () => { throw new Error('Cloud AI is switched off in Firebase Remote Config.') },
  })
  await assert.rejects(runDeviceFirst(policy.run), /switched off in Firebase Remote Config/)
  assert.deepEqual(policy.calls, [])
  assert.deepEqual(policy.log, [])

  // A failed cloud request is logged with what was sent and shown as a safe message.
  const outage = harness('transcribe', true, { deviceAvailable: false }, { cloud: async () => { throw new Error('503 backend') } })
  await assert.rejects(runDeviceFirst(outage.run), /mapped cloud error/)
  assert.deepEqual(outage.log.map((row) => [row.source, row.ok, row.cloudBytes]), [['cloud', false, 1234]])

  // Cancelling during the device run stops before any cloud contact and logs nothing.
  const stopped = harness('mark', true)
  stopped.run.device = async () => { stopped.cancel(); throw new Error('aborted') }
  await assert.rejects(runDeviceFirst(stopped.run), /Generation cancelled/)
  assert.deepEqual(stopped.calls, [])
  assert.deepEqual(stopped.log, [])

  // Cancelling during the policy checks stops before the request is sent.
  const late = harness('transcribe', true, { deviceAvailable: false })
  late.run.cloudPreflight = async () => { late.cancel() }
  await assert.rejects(runDeviceFirst(late.run), /Generation cancelled/)
  assert.deepEqual(late.calls, [])
})

test('cloud-first requests fall back to the device and never send without permission', async () => {
  // Cloud allowed: the cloud model writes the brief.
  const cloud = harness('draftMarkingBrief', false)
  const written = await runCloudFirst(cloud.run)
  assert.deepEqual(cloud.calls, ['preflight', 'cloud'])
  assert.deepEqual([written.source, written.cloudBytes], ['cloud', 1234])
  assert.deepEqual([cloud.log[0].mode, cloud.log[0].fallback], ['PREFER_IN_CLOUD', undefined])

  // Cloud request fails: the device takes over and the result reports nothing sent.
  const outage = harness('draftMarkingBrief', false, {}, { cloud: async () => { throw new Error('503 backend') } })
  const recovered = await runCloudFirst(outage.run)
  assert.deepEqual(outage.calls, ['preflight', 'device'])
  assert.deepEqual([recovered.source, recovered.cloudBytes], ['device', 0])
  assert.deepEqual(
    outage.log.map((row) => [row.source, row.ok, row.cloudBytes, row.fallback]),
    [['cloud', false, 1234, undefined], ['device', true, 0, 'cloud-error']],
  )

  // The institution's Remote Config switch is off: nothing is sent and the device takes over.
  const policy = harness('draftMarkingBrief', false, {}, { cloudPreflight: async () => { throw new Error('Cloud AI is switched off in Firebase Remote Config.') } })
  await runCloudFirst(policy.run)
  assert.deepEqual(policy.calls, ['device'])
  assert.deepEqual(policy.log.map((row) => [row.source, row.ok, row.cloudBytes]), [['cloud', false, 0], ['device', true, 0]])

  // The lecturer has cloud AI off, App Check is missing, or the browser is offline: device only.
  for (const state of [{ allowCloud: false }, { cloudConfigured: false }, { online: false }]) {
    const local = harness('draftMarkingBrief', false, state)
    const result = await runCloudFirst(local.run)
    assert.deepEqual(local.calls, ['device'])
    assert.deepEqual([result.cloudBytes, local.log[0].fallback], [0, 'cloud-unavailable'])
  }

  // No device model to fall back to: a failed request is mapped, a failed policy check is shown as it is.
  const noDevice = harness('draftMarkingBrief', false, { deviceAvailable: false }, { cloud: async () => { throw new Error('503 backend') } })
  await assert.rejects(runCloudFirst(noDevice.run), /mapped cloud error/)
  assert.deepEqual(noDevice.calls, ['preflight'])
  const noDevicePolicy = harness('draftMarkingBrief', false, { deviceAvailable: false }, {
    cloudPreflight: async () => { throw new Error('App Check could not verify this browser.') },
  })
  await assert.rejects(runCloudFirst(noDevicePolicy.run), /App Check could not verify this browser/)

  // When the SDK itself falls back to the device, the result still reports nothing sent.
  const sdkFallback = harness('draftMarkingBrief', false, {}, { cloud: async () => fromDevice })
  const viaSdk = await runCloudFirst(sdkFallback.run)
  assert.deepEqual([viaSdk.source, viaSdk.cloudBytes, sdkFallback.log[0].fallback], ['device', 0, 'cloud-error'])

  // A malformed cloud reply goes back to the caller for its format retry, not to the device.
  const malformed = harness('draftMarkingBrief', false, {}, { cloud: async () => { throw new SyntaxError('The AI reply was incomplete') } })
  await assert.rejects(runCloudFirst(malformed.run), SyntaxError)
  assert.deepEqual(malformed.calls, ['preflight'])

  // Neither model available: blocked with a reason.
  const blocked = harness('draftMarkingBrief', false, { deviceAvailable: false, allowCloud: false })
  await assert.rejects(runCloudFirst(blocked.run), /Cloud AI|on-device AI/)
  assert.deepEqual(blocked.calls, [])
})
