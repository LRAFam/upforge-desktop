const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { digest, validateUpdateMetadata, validateSigningReceipts } = require('./release-policy.cjs')
const { requiresPublisher, nativeFiles } = require('./sign-hook.cjs')

test('updater accepts exactly the final signed installer bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-policy-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'UpForge-Setup-1.2.3.exe')
  fs.writeFileSync(file, 'fixture representing final signed bytes')
  fs.writeFileSync(file + '.blockmap', 'blockmap fixture')
  const hash = digest(file, 'sha512', 'base64')
  const good = { version: '1.2.3', path: path.basename(file), sha512: hash,
    files: [{ url: path.basename(file), sha512: hash, size: fs.statSync(file).size }] }
  assert.equal(validateUpdateMetadata(good, dir, '1.2.3').length, 3)
  for (const mutation of [
    x => { x.path = '../outside.exe' },
    x => { x.version = '1.2.2' },
    x => { x.sha512 = 'unsigned-build-hash' },
    x => { x.files[0].sha512 = 'unsigned-build-hash' },
    x => { x.files[0].size++ },
    x => { x.files[0].url = 'https://example.com/replacement.exe' },
    x => { x.files.push({ ...x.files[0] }) },
    x => { x.files = [] },
  ]) {
    const data = structuredClone(good)
    mutation(data)
    assert.throws(() => validateUpdateMetadata(data, dir, '1.2.3'))
  }
  fs.appendFileSync(file, 'tampered after signing')
  assert.throws(() => validateUpdateMetadata(good, dir, '1.2.3'))
})

test('NSIS uninstaller must be verified, timestamped, and from the selected publisher', () => {
  const thumbprint = 'A'.repeat(40)
  const receipt = { file: '__uninstaller-nsis-UpForge.exe', signer: thumbprint, timestamped: true, verified: true, sha256: 'b'.repeat(64) }
  validateSigningReceipts([receipt], thumbprint)
  assert.throws(() => validateSigningReceipts([], thumbprint))
  for (const change of [{ timestamped: false }, { verified: false }, { signer: 'C'.repeat(40) }, { file: 'UpForge.exe' }, { sha256: '' }]) {
    assert.throws(() => validateSigningReceipts([{ ...receipt, ...change }], thumbprint))
  }
})

test('publisher policy covers the app, trainer, installer and temporary uninstaller', () => {
  for (const file of ['UpForge.exe', 'upforge-trainer.exe', 'UpForge-Setup-2.14.7.exe', '__uninstaller-nsis-UpForge.exe', 'Uninstall UpForge.exe']) {
    assert.equal(requiresPublisher(file), true, file)
  }
  assert.equal(requiresPublisher('dxcompiler.dll'), false)
})

test('nested native modules are included and filesystem links are rejected', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-native-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'nested'))
  for (const file of ['UpForge.exe', 'nested/parser.node', 'nested/renderer.DLL', 'readme.txt']) fs.writeFileSync(path.join(dir, file), '')
  assert.equal(nativeFiles(dir).length, 3)
  if (process.platform !== 'win32') {
    fs.symlinkSync(path.join(dir, 'UpForge.exe'), path.join(dir, 'link.exe'))
    assert.throws(() => nativeFiles(dir), /Unexpected link/)
  }
})

