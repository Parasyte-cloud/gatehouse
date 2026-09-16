import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GATEHOUSE_HOME,
  buildEmbedOrigins,
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
    const policy = classifyGatehouseTarget(url, { embedOrigins: new Set() })
    assert.equal(policy.kind, 'blocked', url)
  }
})

test('home remains internal', () => {
  const policy = classifyGatehouseTarget(GATEHOUSE_HOME, {
    embedOrigins: new Set()
  })
  assert.equal(policy.kind, 'home')
})

test('unknown HTTPS sites default to external launch', () => {
  const policy = classifyGatehouseTarget('https://example.com/path', {
    embedOrigins: new Set(['https://gatehouse.parasyte.cloud'])
  })
  assert.equal(policy.kind, 'external')
  assert.equal(policy.secure, true)
})

test('only exact user-approved origins are embedded', () => {
  const origins = buildEmbedOrigins(
    ['https://admin.example.com', ' https://preview.example.com '],
    'https://gatehouse.parasyte.cloud'
  )
  assert.equal(
    classifyGatehouseTarget('https://admin.example.com/users', { embedOrigins: origins }).kind,
    'embed'
  )
  assert.equal(
    classifyGatehouseTarget('https://evil.admin.example.com/', { embedOrigins: origins }).kind,
    'external'
  )
  assert.equal(
    classifyGatehouseTarget('https://gatehouse.parasyte.cloud/', { embedOrigins: origins }).kind,
    'embed'
  )
})

test('private network destinations are blocked regardless of trust', () => {
  const policy = classifyGatehouseTarget('https://192.168.1.1/', {
    embedOrigins: new Set(['https://192.168.1.1'])
  })
  assert.equal(policy.kind, 'blocked')
})

test('HTTP is never embedded unless explicitly allowed', () => {
  const policy = classifyGatehouseTarget('http://example.com/', {
    embedOrigins: new Set(['http://example.com']),
    allowHttp: false
  })
  assert.equal(policy.kind, 'external')
  assert.equal(policy.secure, false)
})

test('search template is configurable but always falls back safely', () => {
  assert.equal(
    buildSearchUrl('parasyte', 'https://duckduckgo.com/?q=%s'),
    'https://duckduckgo.com/?q=parasyte'
  )
  assert.equal(buildSearchUrl('x', 'not a template'), 'https://www.google.com/search?q=x')
  assert.equal(buildSearchUrl('x', 'javascript:alert(%s)'), 'https://www.google.com/search?q=x')
})

test('allowSameOrigin is only granted for a user-approved origin also marked storage-trusted', () => {
  const embedOrigins = buildEmbedOrigins(['https://admin.example.com'])
  const storageTrustedOrigins = buildStorageTrustedOrigins(['https://admin.example.com'])

  const trusted = classifyGatehouseTarget('https://admin.example.com/users', {
    embedOrigins,
    storageTrustedOrigins
  })
  assert.equal(trusted.kind, 'embed')
  assert.equal(trusted.allowSameOrigin, true)

  const untrustedEmbed = classifyGatehouseTarget('https://admin.example.com/users', { embedOrigins })
  assert.equal(untrustedEmbed.allowSameOrigin, false)

  // Marking an origin storage-trusted without also embedding it must be a no-op.
  const notEmbedded = classifyGatehouseTarget('https://preview.example.com/', {
    embedOrigins: new Set(),
    storageTrustedOrigins: buildStorageTrustedOrigins(['https://preview.example.com'])
  })
  assert.equal(notEmbedded.kind, 'external')
  assert.equal(notEmbedded.allowSameOrigin, false)
})
