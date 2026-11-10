/** Connect the packaged feed policy to one private qualification server. */
import assert from 'node:assert/strict'
import { uncensoredUpdateConfig } from '../../scripts/uncensored-update.mjs'

/**
 * Verify the coordinator's production options before redirecting fixture traffic.
 * @param {import('electron-updater').AppUpdater} updater - The fixture-owned updater.
 * @param {string} loopbackUrl - The private listener's base URL.
 * @param {boolean} useMultipleRangeRequest - Override only for differential test controls.
 * @returns {() => Promise<object>} Reader for the packaged source presented to the coordinator.
 */
export function fixtureUpdateFeed(updater, loopbackUrl, useMultipleRangeRequest = false) {
  const target = new URL(loopbackUrl)
  assert.equal(target.protocol, 'http:')
  assert.equal(target.hostname, '127.0.0.1')
  assert.equal(target.href, target.origin + '/')
  assert.ok(target.port)
  const source = { provider: 'generic', url: uncensoredUpdateConfig(process.platform, process.arch).publicUrl }
  const setFeedURL = updater.setFeedURL.bind(updater)
  updater.setFeedURL = options => {
    assert.deepEqual(options, { ...source, useMultipleRangeRequest: false })
    setFeedURL({ ...options, url: target.href, useMultipleRangeRequest })
  }
  return () => Promise.resolve(source)
}
