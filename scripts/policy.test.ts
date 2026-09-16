import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GATEHOUSE_HOME,
  buildSearchUrl,
  buildStorageTrustedOrigins,
  classifyGatehouseTarget,
  isPrivateNetworkHost,
  resolveGatehouseInput,
  safeWebUrl
} from '../src/lib/policy.ts'

test('search text resolves to an HTTPS Google search URL', () => {
  assert.equal(
    resolveGatehouseInput('gatehouse launch checklist'),
    'https://www.google.com/search?q=gatehouse%20launch%20checklist'
  )
})

test('bare host is promoted to HTTPS', () => {
  assert.equal(resolveGatehouseInput('example.com'), 'https://example.com/')
})

test('credentials in URLs are rejected', () => {
  assert.equal(safeWebUrl('https://user:secret@example.com/'), null)
})

test('private and local network hosts are detected', () => {
  for (const host of [
    'localhost',
    'service.local',
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.5',
    '169.254.10.1',
    '::1',
    'fd00::1'
  ]) {
    assert.equal(isPrivateNetworkHost(host), true, host)
  }
  assert.equal(isPrivateNetworkHost('example.com'), false)
  assert.equal(isPrivateNetworkHost('fc-example.com'), false)
  assert.equal(isPrivateNetworkHost('8.8.8.8'), false)
})

test('IPv4-in-IPv6 encodings of private addresses are still blocked', () => {
  for (const host of [
    '::ffff:192.168.1.1',
    '::ffff:c0a8:101',
    '::ffff:127.0.0.1',
    '::192.168.1.1',
    '64:ff9b::10.0.0.5',
    '64:ff9b::192.168.1.1'
  ]) {
    assert.equal(isPrivateNetworkHost(host), true, host)
  }
  assert.equal(isPrivateNetworkHost('2001:db8::c0a8:101'), false)
})

test('bracketed IPv4-mapped IPv6 addresses are blocked end-to-end via the URL parser', () => {
  for (const url of [
    'http://[::ffff:192.168.1.1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::192.168.1.1]/',
    'http://[64:ff9b::10.0.0.5]/'
  ]) {
    const policy = classifyGatehouseTarget(url)
    assert.equal(policy.kind, 'blocked', url)
  }
})

test('home remains internal', () => {
  const policy = classifyGatehouseTarget(GATEHOUSE_HOME)
  assert.equal(policy.kind, 'home')
})

test('unknown HTTPS sites embed directly - there is no allow-to-embed gate', () => {
  const policy = classifyGatehouseTarget('https://example.com/path')
  assert.equal(policy.kind, 'embed')
  assert.equal(policy.secure, true)
  assert.equal(policy.allowSameOrigin, false)
})

test('every secure, non-private destination embeds regardless of any trust list', () => {
  assert.equal(classifyGatehouseTarget('https://example.com/path').kind, 'embed')
  assert.equal(classifyGatehouseTarget('https://evil.example.com/').kind, 'embed')
  assert.equal(classifyGatehouseTarget('https://gatehouse.parasyte.cloud/').kind, 'embed')
})

test('private network destinations are blocked regardless of trust', () => {
  const policy = classifyGatehouseTarget('https://192.168.1.1/', {
    storageTrustedOrigins: buildStorageTrustedOrigins(['https://192.168.1.1'])
  })
  assert.equal(policy.kind, 'blocked')
})

test('HTTP is never embedded by default, but can be explicitly allowed', () => {
  const blocked = classifyGatehouseTarget('http://example.com/', { allowHttp: false })
  assert.equal(blocked.kind, 'external')
  assert.equal(blocked.secure, false)

  const allowed = classifyGatehouseTarget('http://example.com/', { allowHttp: true })
  assert.equal(allowed.kind, 'embed')
})

test('search template is configurable but always falls back safely', () => {
  assert.equal(
    buildSearchUrl('parasyte', 'https://duckduckgo.com/?q=%s'),
    'https://duckduckgo.com/?q=parasyte'
  )
  assert.equal(buildSearchUrl('x', 'not a template'), 'https://www.google.com/search?q=x')
  assert.equal(buildSearchUrl('x', 'javascript:alert(%s)'), 'https://www.google.com/search?q=x')
})

test('allowSameOrigin is granted only for an origin explicitly marked storage-trusted', () => {
  const storageTrustedOrigins = buildStorageTrustedOrigins(['https://admin.example.com'])

  const trusted = classifyGatehouseTarget('https://admin.example.com/users', { storageTrustedOrigins })
  assert.equal(trusted.kind, 'embed')
  assert.equal(trusted.allowSameOrigin, true)

  const untrusted = classifyGatehouseTarget('https://other.example.com/', { storageTrustedOrigins })
  assert.equal(untrusted.kind, 'embed')
  assert.equal(untrusted.allowSameOrigin, false)
})
