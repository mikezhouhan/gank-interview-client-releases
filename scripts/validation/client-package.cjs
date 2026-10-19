'use strict';

// Release-repository validation only. No installer is published or executed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

function configure(pkg, product, platform, arch) {
  assert.ok(['GankInterview', 'Desktophelper'].includes(product), 'Unsupported validation product');
  assert.ok((platform === 'darwin' && ['arm64', 'x64'].includes(arch)) || (platform === 'win32' && arch === 'x64'), 'Unsupported validation host');
  const result = structuredClone(pkg);
  result.name = product === 'Desktophelper' ? 'Desktophelper' : 'gankinterview';
  result.build.productName = product;
  result.build.mac.icon = `assets/icons/mac/${product === 'Desktophelper' ? 'blank' : 'icon'}.icns`;
  result.build.win.icon = `assets/icons/win/${product === 'Desktophelper' ? 'blank' : 'icon'}.ico`;
  result.build.mac.target = [{ target: 'dmg', arch: [arch] }, { target: 'zip', arch: [arch] }];
  // Full packaging and update-signing hooks run; no production certificate is used.
  result.build.mac.identity = null;
  result.build.mac.notarize = false;
  result.build.publish = [{ provider: 'generic', url: 'https://validation.invalid/updates/' }];
  return result;
}

function validateEnvironment(env, cwd) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Only run in a disposable GitHub runner');
  assert.equal(env.GITHUB_REPOSITORY, 'mikezhouhan/gank-interview-client-releases');
  assert.match(env.GITHUB_REF || '', /^refs\/heads\/codex\/release-validation-/);
  assert.match(env.SOURCE_SHA || '', /^[a-f0-9]{40}$/);
  assert.ok(env.RUNNER_TEMP && env.GITHUB_WORKSPACE, 'Missing runner directories');
  assert.equal(path.resolve(cwd), path.resolve(env.GITHUB_WORKSPACE, 'client'));
  assert.ok(['GankInterview', 'Desktophelper'].includes(env.VALIDATION_PRODUCT));
}

function run(executable, args, options = {}) {
  const child = spawnSync(executable, args, { stdio: 'inherit', ...options });
  if (child.error) throw child.error;
  if (child.status !== 0 && options.encoding) {
    process.stderr.write(String(child.stderr || '').slice(-12000));
    process.stderr.write(String(child.stdout || '').slice(-3000));
  }
  assert.equal(child.status, 0, `${path.basename(executable)} failed (${child.status ?? child.signal})`);
  return child;
}

function findArchives(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return findArchives(file);
    return entry.isFile() && entry.name === 'app.asar' ? [file] : [];
  });
}

async function main(mode) {
  const root = process.cwd();
  validateEnvironment(process.env, root);
  const output = path.join(process.env.RUNNER_TEMP, 'client-package-validation');
  const keyFile = path.join(output, 'test-update-key.pem');
  if (mode === 'cleanup') { fs.rmSync(keyFile, { force: true }); return; }
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(source, process.env.SOURCE_SHA, 'Candidate source changed');
  const packageFile = path.join(root, 'package.json');
  const product = process.env.VALIDATION_PRODUCT;
  let pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  fs.mkdirSync(output, { recursive: true });
  const reportFile = path.join(output, 'report.json');
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {
    source, product, version: pkg.version, platform: process.platform, arch: process.arch,
    electron: '29.4.6', published: false, platformSigned: false, notarized: false,
    customElectronValidated: false, ephemeralTestIssuer: true, stages: {},
  };
  try {
    if (mode === 'prepare') {
      pkg = configure(pkg, product, process.platform, process.arch);
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
      fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
      const trust = { schema: 1, publicKey: Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64') };
      fs.writeFileSync(path.join(root, 'build/update-trust.json'), JSON.stringify(trust));
      fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
    } else if (mode === 'build') {
      const env = { ...process.env, GANK_UPDATE_SIGNING_KEY: fs.readFileSync(keyFile, 'utf8'),
        RELEASE_TAG: `v${pkg.version}`, RELEASE_PRODUCT: product };
      run(process.execPath, ['scripts/release-preflight.cjs', '--check-signing-key'], { env });
      // Fixed commands only; Windows npm is a cmd shim.
      run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', process.platform === 'darwin' ? 'package-mac' : 'package-win', '--', '--publish=never'],
        { env, shell: process.platform === 'win32' });
    } else if (mode === 'verify') {
      const requireClient = createRequire(packageFile);
      const builderRequire = createRequire(requireClient.resolve('app-builder-lib'));
      const asar = builderRequire('@electron/asar');
      const archives = findArchives(path.join(root, 'release'));
      assert.equal(archives.length, 1, 'Expected exactly one packaged application');
      const archive = archives[0], resources = path.dirname(archive);
      const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
      assert.equal(packed.version, pkg.version);
      assert.equal(packed.name, pkg.name);
      const hardening = requireClient('./scripts/harden-packaged-app.cjs');
      hardening.verifyUnpackedFiles(resources);
      hardening.verifyPackagedHelpers(resources, process.platform);
      if (process.platform === 'darwin') {
        const app = path.dirname(path.dirname(resources));
        assert.equal(path.basename(app), `${product}.app`);
        hardening.verifyMacAsarIntegrity(app);
        const plist = builderRequire('plist');
        const info = plist.parse(fs.readFileSync(path.join(app, 'Contents/Info.plist'), 'utf8'));
        assert.equal(info.CFBundleShortVersionString, pkg.version);
      } else assert.ok(fs.existsSync(path.join(path.dirname(resources), `${product}.exe`)));
      const { readNativeCore } = requireClient('./scripts/native-core-artifacts.cjs');
      readNativeCore(path.join(archive + '.unpacked', 'out/main/native'), `${process.platform}-${process.arch}`);
      const { verifyArtifact, readJson, artifactName, channelFor, PROOF_SUFFIX } = requireClient('./scripts/update-artifact-signing.cjs');
      const trust = await readJson(path.join(root, 'build/update-trust.json'));
      const identity = { product, channel: channelFor(product), version: pkg.version, platform: process.platform, arch: process.arch };
      const extensions = process.platform === 'darwin' ? ['.dmg', '.zip'] : ['.exe'];
      report.artifacts = [];
      for (const extension of extensions) {
        const name = artifactName(identity, extension), artifact = path.join(root, 'release', name);
        const proof = await readJson(artifact + PROOF_SUFFIX);
        const payload = await verifyArtifact(artifact, proof, trust, identity);
        report.artifacts.push({ name, bytes: payload.size, sha512: payload.sha512, signatureVerified: true });
      }
      const feedName = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
      const { parseUpdateInfo, resolveFiles } = requireClient('electron-updater/out/providers/Provider');
      const feed = parseUpdateInfo(fs.readFileSync(path.join(root, 'release', feedName), 'utf8'), feedName, new URL('https://validation.invalid/updates/'));
      assert.equal(feed.version, pkg.version);
      const files = resolveFiles(feed, new URL('https://validation.invalid/updates/'));
      for (const artifact of report.artifacts) {
        const file = files.find(value => value.url.pathname.endsWith('/' + artifact.name));
        assert.ok(file, `Missing ${artifact.name} in update feed`);
        assert.equal(file.info.sha512, artifact.sha512);
        await verifyArtifact(path.join(root, 'release', artifact.name), file.info.gankSignature, trust, identity);
      }
      report.updateFeedVerified = true;
      // Run the actual packaged native module and sandbox bridge with synthetic
      // local services. Never launch the product main, audio devices or hooks.
      const probe = run(process.execPath, ['scripts/test-packaged-dependencies.cjs', archive], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const result = JSON.parse(probe.stdout.trim());
      assert.equal(result.rustProtocol, requireClient('./native/gank-core/protocol.json'));
      assert.ok(Object.values(result).every(value => value === true || value === 'not-applicable' || value === result.rustProtocol));
      report.packagedChecks = result;
      run(process.execPath, ['scripts/test-mobile-signalling.cjs', '--production-root', archive],
        { env: { ...process.env, GANK_SIGNALLING_CLOSE_ROUNDS: '10' } });
      report.mobileSignalling = true;
    } else throw new Error('Expected prepare, build, verify or cleanup');
    report.stages[mode] = 'passed';
  } catch (error) {
    report.stages[mode] = 'failed';
    throw error;
  } finally {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### ${product} / ${process.platform}-${process.arch}\n\nSource: \`${source}\`\n\n${mode}: **${report.stages[mode]}**. Validation only; no release, production signature or notarization.\n\n`);
  }
}

if (require.main === module) main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { configure, validateEnvironment, findArchives, run };
