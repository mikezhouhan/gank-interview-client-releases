'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configure, validateEnvironment, findArchives, run } = require('./client-package.cjs');

const pkg = { name: 'gankinterview', version: '2.4.1', build: {
  productName: 'GankInterview', mac: { identity: 'Developer ID Application', notarize: true }, win: {},
  afterPack: 'scripts/harden-packaged-app.cjs', artifactBuildCompleted: 'scripts/sign-update-artifact.cjs',
} };
for (const product of ['GankInterview', 'Desktophelper']) for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64']]) {
  test(`${product} ${platform}-${arch} keeps real build hooks and isolates release identity`, () => {
    const value = configure(pkg, product, platform, arch);
    assert.equal(value.version, pkg.version);
    assert.equal(value.build.productName, product);
    assert.equal(value.build.afterPack, pkg.build.afterPack);
    assert.equal(value.build.artifactBuildCompleted, pkg.build.artifactBuildCompleted);
    assert.deepEqual(value.build.mac.target, [{ target: 'dmg', arch: [arch] }, { target: 'zip', arch: [arch] }]);
    assert.equal(value.build.mac.identity, null);
    assert.equal(value.build.mac.notarize, false);
    assert.match(value.build.publish[0].url, /^https:\/\/validation\.invalid\//);
    assert.equal(pkg.build.mac.notarize, true);
  });
}
test('rejects unrecognized channels, hosts and production execution', () => {
  assert.throws(() => configure(pkg, 'other', 'darwin', 'arm64'));
  assert.throws(() => configure(pkg, 'Desktophelper', 'win32', 'arm64'));
  const workspace = path.join(os.tmpdir(), 'validation-workspace');
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'mikezhouhan/gank-interview-client-releases',
    GITHUB_REF: 'refs/heads/codex/release-validation-test', SOURCE_SHA: 'a'.repeat(40), RUNNER_TEMP: os.tmpdir(),
    GITHUB_WORKSPACE: workspace, VALIDATION_PRODUCT: 'Desktophelper' };
  validateEnvironment(env, path.join(workspace, 'client'));
  for (const override of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/main' }, { SOURCE_SHA: 'dev' }, { GITHUB_REPOSITORY: 'another/repo' }])
    assert.throws(() => validateEnvironment({ ...env, ...override }, path.join(workspace, 'client')));
  assert.throws(() => validateEnvironment(env, workspace));
});
test('archive discovery finds actual files without following directory symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-archives-'));
  try {
    fs.mkdirSync(path.join(root, 'app', 'resources'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'resources', 'app.asar'), 'fixture');
    fs.writeFileSync(path.join(root, 'installer.exe'), 'fixture');
    fs.symlinkSync(path.join(root, 'app'), path.join(root, 'linked-app'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(findArchives(root), [path.join(root, 'app', 'resources', 'app.asar')]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('child failures remain failures', () => {
  assert.throws(() => run(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'ignore' }), /failed \(7\)/);
});
