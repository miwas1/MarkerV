import assert from 'node:assert/strict'
import test from 'node:test'
import { isDemoPath, isProtectedWorkspacePath, resolvePostAuthPath } from '../src/domain/authGuard.ts'

test('isProtectedWorkspacePath gates /workspace and its children while keeping demo and public routes open', () => {
  assert.equal(isProtectedWorkspacePath('/workspace'), true)
  assert.equal(isProtectedWorkspacePath('/workspace/rubric'), true)
  assert.equal(isProtectedWorkspacePath('/workspace/scripts/123'), true)
  assert.equal(isProtectedWorkspacePath('/workspace/links'), true)

  assert.equal(isProtectedWorkspacePath('/'), false)
  assert.equal(isProtectedWorkspacePath('/sample'), false)
  assert.equal(isProtectedWorkspacePath('/sample/scripts/fictional-processes-01'), false)
  assert.equal(isProtectedWorkspacePath('/demo'), false)
  assert.equal(isProtectedWorkspacePath('/practice'), false)
  assert.equal(isProtectedWorkspacePath('/inspector'), false)
  assert.equal(isProtectedWorkspacePath('/settings'), false)
  assert.equal(isProtectedWorkspacePath('/submit/abc123'), false)
  assert.equal(isProtectedWorkspacePath('/login'), false)
  assert.equal(isProtectedWorkspacePath('/signup'), false)
})

test('isDemoPath recognises /sample and /demo routes', () => {
  assert.equal(isDemoPath('/sample'), true)
  assert.equal(isDemoPath('/sample/class'), true)
  assert.equal(isDemoPath('/demo'), true)
  assert.equal(isDemoPath('/demo/rubric'), true)
  assert.equal(isDemoPath('/workspace'), false)
})

test('resolvePostAuthPath allows safe internal redirects and blocks open redirects or auth loops', () => {
  assert.equal(resolvePostAuthPath('/workspace/rubric'), '/workspace/rubric')
  assert.equal(resolvePostAuthPath('/workspace/capture?input=text'), '/workspace/capture?input=text')
  assert.equal(resolvePostAuthPath(undefined), '/workspace')
  assert.equal(resolvePostAuthPath(''), '/workspace')
  assert.equal(resolvePostAuthPath('/login'), '/workspace')
  assert.equal(resolvePostAuthPath('/signup?next=1'), '/workspace')
  assert.equal(resolvePostAuthPath('https://evil.example/phish'), '/workspace')
  assert.equal(resolvePostAuthPath('//evil.example/phish'), '/workspace')
  assert.equal(resolvePostAuthPath('/\\evil.example'), '/workspace')
})
