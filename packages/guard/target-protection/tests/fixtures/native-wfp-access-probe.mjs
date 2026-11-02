/** Manual WFP access check: empty dynamic sublayer only, no traffic filters or persistent objects. @module */
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

if (process.platform !== 'win32') throw new Error('This characterization requires Windows.')
const require = createRequire(new URL('../../package.json', import.meta.url))
const sdkRequire = createRequire(require.resolve('@microsoft/mxc-sdk/package.json'))
const koffi = sdkRequire('koffi')
const Guid = koffi.struct('DSHU_PROBE_GUID', { data1: 'uint32_t', data2: 'uint16_t', data3: 'uint16_t', data4: koffi.array('uint8_t', 8) })
const Display = koffi.struct('DSHU_PROBE_DISPLAY', { name: 'str16', description: 'str16' })
const Blob = koffi.struct('DSHU_PROBE_BLOB', { size: 'uint32_t', data: 'void *' })
const Session = koffi.struct('DSHU_PROBE_SESSION', { key: Guid, display: Display, flags: 'uint32_t', timeout: 'uint32_t',
  pid: 'uint32_t', sid: 'void *', username: 'str16', kernelMode: 'int32_t' })
const Layer = koffi.struct('DSHU_PROBE_SUBLAYER', { key: Guid, display: Display, flags: 'uint32_t',
  providerKey: 'void *', providerData: Blob, weight: 'uint16_t' })
const api = koffi.load(join(process.env.SystemRoot, 'System32', 'fwpuclnt.dll'))
const open = api.func('FwpmEngineOpen0', 'uint32_t', ['void *', 'uint32_t', 'void *', koffi.pointer(Session), koffi.out(koffi.pointer('void *'))])
const add = api.func('FwpmSubLayerAdd0', 'uint32_t', ['void *', koffi.pointer(Layer), 'void *'])
const close = api.func('uint32_t __stdcall FwpmEngineClose0(void *)')
const bytes = randomBytes(16)
const key = { data1: bytes.readUInt32LE(0), data2: bytes.readUInt16LE(4), data3: bytes.readUInt16LE(6), data4: [...bytes.subarray(8)] }
const output = [null], report = {}
report.open = open(null, 10, null, { key, display: { name: 'DSHU isolated access probe', description: 'Empty dynamic sublayer; no filters' },
  flags: 1, timeout: 1000, pid: 0, sid: null, username: null, kernelMode: 0 }, output)
if (report.open === 0) {
  try {
    report.add = add(output[0], { key, display: { name: 'DSHU access probe', description: 'No traffic filters' },
      flags: 0, providerKey: null, providerData: { size: 0, data: null }, weight: 256 }, null)
  } finally { report.close = close(output[0]) }
}
console.log(JSON.stringify(report))
if (report.open !== 0 || report.close !== 0) process.exitCode = 1
