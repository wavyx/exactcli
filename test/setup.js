// Tests model an INTERACTIVE terminal by default: human-readable output and
// human-readable (thrown-with-message) errors. Tests that exercise piped /
// machine behavior opt in explicitly by setting `process.stdout.isTTY = false`
// (success -> JSON). This keeps the large body of `rejects.toThrow(/message/)`
// error-path assertions valid while piped errors emit JSON instead.
beforeEach(() => {
  process.stdout.isTTY = true
})

// Restore to the original (undefined) between tests so a test that flips to
// piped without restoring can't leak its setting into the next file/test.
afterEach(() => {
  process.stdout.isTTY = undefined
})
