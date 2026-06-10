import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeAssetPaths } from '../src/runtime/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageName = 'open-xmen';
const expectedPackagePluginEntry = packageName;

const requiredPackagedFiles = [
  'package.json',
  'README.md',
  'AGENTS.md',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/cli.js',
  'dist/cli.d.ts',
  'dist/runtime/index.js',
  'dist/runtime/index.d.ts',
  'dist/runtime/generated-assets.js',
  'dist/runtime/generated-assets.d.ts',
  'dist/runtime/definitions.js',
  'dist/runtime/definitions.d.ts',
];

const allowedTopLevelFiles = new Set(['package.json', 'README.md', 'AGENTS.md']);
const forbiddenPackagedPathPattern = /(^|\/)\.env(\.|$|\/)|secret|credential|token|private[-_]?key|node_modules|__pycache__|\.pyc$|\.opencode\/|\.cerebro\/|\.claude\/|\.omx\/|\.sisyphus\//i;
const requiredModelSlots = [
  ['orchestrator', 'openai/gpt-5.5', 'CEREBRO_MODEL_ORCHESTRATOR'],
  ['conductor', 'openai/gpt-5.5', 'CEREBRO_MODEL_CONDUCTOR'],
  ['planner', 'openai/gpt-5.5', 'CEREBRO_MODEL_PLANNER'],
  ['design', 'openai/gpt-5.5', 'CEREBRO_MODEL_DESIGN'],
  ['analyst', 'openai/gpt-5.4', 'CEREBRO_MODEL_ANALYST'],
  ['workers', 'openai/gpt-5.5', 'CEREBRO_MODEL_WORKERS'],
  ['fast', 'openai/gpt-5.4-mini-fast', 'CEREBRO_MODEL_FAST'],
  ['image', 'openai/gpt-image-2', 'CEREBRO_MODEL_IMAGE'],
];
const expectedResolvedCommands = ['cerebro-doctor', 'cerebro-index', 'cerebro-plan', 'cerebro-start-work', 'to-me-my-x-men'];
const expectedResolvedAgents = [
  'cerebro',
  'legion',
  'cypher',
  'professor-x',
  'wolverine',
  'jean-grey',
  'storm',
  'cyclops',
  'forge',
  'nightcrawler',
  'sage',
  'beast',
  'emma-frost',
];

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function fail(message: string): never {
  throw new Error(message);
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
    fail(`Command failed: ${command} ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
  }

  return result.stdout.trim();
}

function parsePackJson(output: string) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    fail(`Could not locate npm pack JSON output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1)) as Array<{
    filename?: string;
    files?: Array<{ path: string }>;
  }>;
}

function packArtifact() {
  console.log('Packing npm artifact...');
  const output = run('npm', ['pack', '--json', '--ignore-scripts']);
  const parsed = parsePackJson(output);
  const tarball = parsed[0]?.filename;
  if (!tarball) fail(`npm pack did not return a tarball filename:\n${output}`);

  const packagedFiles = new Set((parsed[0]?.files ?? []).map((file) => file.path));
  for (const requiredFile of requiredPackagedFiles) {
    if (!packagedFiles.has(requiredFile)) {
      fail(`npm pack artifact is missing required file: ${requiredFile}`);
    }
  }
  for (const packagedFile of packagedFiles) {
    if (forbiddenPackagedPathPattern.test(packagedFile)) fail(`npm pack artifact includes forbidden path: ${packagedFile}`);
    if (!allowedTopLevelFiles.has(packagedFile) && !packagedFile.startsWith('dist/')) {
      fail(`npm pack artifact includes unexpected non-dist file: ${packagedFile}`);
    }
    const sourcePath = path.join(repoRoot, packagedFile);
    if (existsSync(sourcePath) && lstatSync(sourcePath).isSymbolicLink()) fail(`npm pack artifact includes symlink: ${packagedFile}`);
  }

  return path.join(repoRoot, tarball);
}

function readJsonc(file: string): JsonValue {
  const text = readFileSync(file, 'utf8')
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (match, comment) => (comment ? '' : match))
    .replace(/\\"|"(?:\\"|[^"])*"|(,)(\s*[}\]])/g, (match, comma, closing) => (comma ? closing : match));
  return JSON.parse(text) as JsonValue;
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function verifyResolvedOpenCodeRuntime(projectDir: string, env: NodeJS.ProcessEnv) {
  const output = run('opencode', ['debug', 'config'], { cwd: projectDir, env });
  const config = JSON.parse(output) as JsonValue;
  if (!isRecord(config)) fail('opencode debug config did not return a JSON object');

  const command = config.command;
  if (!isRecord(command)) fail('resolved OpenCode config is missing command registrations');
  for (const name of expectedResolvedCommands) {
    if (!isRecord(command[name])) fail(`resolved OpenCode config missing command ${name}`);
  }

  const agent = config.agent;
  if (!isRecord(agent)) fail('resolved OpenCode config is missing agent registrations');
  for (const name of expectedResolvedAgents) {
    if (!isRecord(agent[name])) fail(`resolved OpenCode config missing agent ${name}`);
  }
}

function verifyFreshInstall(tarballPath: string) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'open-xmen-release-'));

  try {
    console.log('Installing packed artifact into clean temp package...');
    const packageDir = path.join(tempRoot, 'package');
    const projectDir = path.join(tempRoot, 'project');
    const defaultProjectDir = path.join(tempRoot, 'project-default');
    const opencodeConfigRoot = path.join(tempRoot, 'opencode-config');
    const opencodeConfigDir = path.join(tempRoot, 'opencode-config-dir');
    const opencodeCacheRoot = path.join(tempRoot, 'opencode-cache');
    const tarballTarget = path.join(tempRoot, path.basename(tarballPath));
    copyFileSync(tarballPath, tarballTarget);
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(defaultProjectDir, { recursive: true });

    run('npm', ['init', '-y'], { cwd: packageDir });
    run('npm', ['install', '--ignore-scripts', tarballTarget], { cwd: packageDir });

    const cliPath = path.join(packageDir, 'node_modules', packageName, 'dist', 'cli.js');
    if (!existsSync(cliPath)) fail(`Installed CLI is missing: ${cliPath}`);

    console.log('Running installed CLI default smoke install with cache warm-up...');
    const isolatedOpenCodeEnv = {
      ...process.env,
      OPENCODE_CONFIG_DIR: opencodeConfigDir,
      XDG_CONFIG_HOME: opencodeConfigRoot,
      XDG_CACHE_HOME: opencodeCacheRoot,
      OPEN_XMEN_SEED_OPENCODE_CACHE: '1',
    };
    run('node', [cliPath, 'install'], { cwd: defaultProjectDir, env: isolatedOpenCodeEnv });
    const defaultOpencodeConfig = readJsonc(path.join(opencodeConfigDir, 'opencode.jsonc'));
    if (!isRecord(defaultOpencodeConfig) || !Array.isArray(defaultOpencodeConfig.plugin) || !defaultOpencodeConfig.plugin.includes(expectedPackagePluginEntry)) {
      fail(`Default opencode.jsonc does not include package plugin entry ${expectedPackagePluginEntry}`);
    }
    if (existsSync(path.join(defaultProjectDir, 'opencode.jsonc'))) fail('Default install unexpectedly wrote project opencode.jsonc');
    if (existsSync(path.join(defaultProjectDir, '.opencode'))) fail('Default install unexpectedly wrote .opencode/');
    if (existsSync(path.join(defaultProjectDir, '.cerebro'))) fail('Default install unexpectedly wrote .cerebro/');
    verifyResolvedOpenCodeRuntime(defaultProjectDir, isolatedOpenCodeEnv);
    run('node', [cliPath, 'doctor', '--dir', defaultProjectDir], { cwd: packageDir, env: isolatedOpenCodeEnv });

    console.log('Running installed CLI plugin-only smoke install...');
    run('node', [cliPath, 'install', '--dir', projectDir, '--no-deps'], { cwd: packageDir });

    const opencodeConfig = readJsonc(path.join(projectDir, 'opencode.jsonc'));
    if (!isRecord(opencodeConfig) || !Array.isArray(opencodeConfig.plugin) || !opencodeConfig.plugin.includes(expectedPackagePluginEntry)) {
      fail(`Installed opencode.jsonc does not include package plugin entry ${expectedPackagePluginEntry}`);
    }
    if (existsSync(path.join(projectDir, '.opencode'))) fail('Plugin-only install unexpectedly wrote .opencode/');
    if (existsSync(path.join(projectDir, '.cerebro'))) fail('Plugin-only install unexpectedly wrote .cerebro/');
    if (existsSync(path.join(projectDir, 'AGENTS.md'))) fail('Plugin-only install unexpectedly wrote AGENTS.md');
    verifyResolvedOpenCodeRuntime(projectDir, isolatedOpenCodeEnv);

    // Do not run `doctor` for this project-local + --no-deps smoke with a warmed
    // cache; the default-install doctor path above covers the user-config flow
    // and the runtime-files doctor path below covers managed project files.

    console.log('Running installed CLI runtime-files smoke install...');
    const runtimeProjectDir = path.join(tempRoot, 'project-runtime');
    mkdirSync(runtimeProjectDir, { recursive: true });
    run('node', [cliPath, 'install', '--dir', runtimeProjectDir, '--with-runtime-files', '--no-deps'], { cwd: packageDir, env: isolatedOpenCodeEnv });

    const runtimeOpencodeConfig = readJsonc(path.join(runtimeProjectDir, 'opencode.jsonc'));
    if (!isRecord(runtimeOpencodeConfig) || !Array.isArray(runtimeOpencodeConfig.plugin) || !runtimeOpencodeConfig.plugin.includes(expectedPackagePluginEntry)) {
      fail(`Runtime-files opencode.jsonc does not include package plugin entry ${expectedPackagePluginEntry}`);
    }

    for (const installedFile of runtimeAssetPaths()) {
      if (!existsSync(path.join(runtimeProjectDir, installedFile))) {
        fail(`Smoke install missing ${installedFile}`);
      }
    }
    for (const runtimeDir of ['.cerebro/plans', '.cerebro/notepads', '.cerebro/team-runs', '.cerebro/pending-todos']) {
      if (!existsSync(path.join(runtimeProjectDir, runtimeDir))) {
        fail(`Smoke install missing runtime directory ${runtimeDir}`);
      }
    }
    if (existsSync(path.join(runtimeProjectDir, '.opencode/plugins/open-xmen.ts'))) {
      fail('Smoke install copied repo-local plugin bridge into installed project');
    }
    verifyInstalledRuntime(runtimeProjectDir);

    console.log('Running installed plugin config smoke test...');
    run('node', ['--input-type=module', '-e', `
      import plugin from './node_modules/${packageName}/dist/index.js';
      const hooks = await plugin({
        worktree: process.cwd(),
        directory: process.cwd(),
        client: {},
        project: {},
        experimental_workspace: { register() {} },
        serverUrl: new URL('http://127.0.0.1'),
        $: undefined,
      });
      const config = { plugin: ['${packageName}'] };
      await hooks.config?.(config);
      const commandNames = Object.keys(config.command ?? {}).sort();
      const agentNames = Object.keys(config.agent ?? {}).sort();
      if (commandNames.length !== 5) throw new Error(\`Expected 5 commands, got \${commandNames.length}\`);
      if (!commandNames.includes('cerebro-plan') || !commandNames.includes('to-me-my-x-men')) throw new Error('Missing preserved command registrations');
      if (agentNames.length !== 13) throw new Error(\`Expected 13 agents, got \${agentNames.length}\`);
      if (!config.agent?.cerebro) throw new Error('Missing cerebro agent registration');
      if ('default_agent' in config) throw new Error('Plugin config hook should not force default_agent');
      const output = {
        parts: [{
          id: 'prt_smoke',
          sessionID: 'ses_smoke',
          messageID: 'msg_smoke',
          type: 'text',
          text: 'Plan this work: smoke',
        }],
      };
      await hooks['command.execute.before']?.({ command: 'cerebro-plan', sessionID: 'ses_smoke', arguments: 'smoke' }, output);
      if (output.parts.length !== 1) throw new Error('Command hook should not inject extra parts with plugin-owned IDs');
      if (output.parts[0].id !== 'prt_smoke') throw new Error('Command hook should preserve OpenCode-generated part IDs');
      if (!output.parts[0].text.includes('Cerebro OpenCode runtime is active.')) throw new Error('Command hook did not prepend Cerebro runtime prelude');
    `], { cwd: packageDir });

    console.log('Running installed doctor for runtime-files install...');
    run('node', [cliPath, 'doctor', '--dir', runtimeProjectDir], { cwd: packageDir, env: isolatedOpenCodeEnv });

    console.log('Running installed global install smoke test...');
    const globalConfigRoot = path.join(tempRoot, 'global-config');
    mkdirSync(globalConfigRoot, { recursive: true });
    run('node', [cliPath, 'install', '--global', '--no-deps'], {
      cwd: packageDir,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: globalConfigRoot,
      },
    });
    const globalConfig = readJsonc(path.join(globalConfigRoot, 'opencode', 'opencode.jsonc'));
    if (!isRecord(globalConfig) || !Array.isArray(globalConfig.plugin) || !globalConfig.plugin.includes(expectedPackagePluginEntry)) {
      fail(`Global opencode.jsonc does not include package plugin entry ${expectedPackagePluginEntry}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function verifyInstalledRuntime(projectDir: string) {
  const routing = readFileSync(path.join(projectDir, '.cerebro/opencode/model-routing.md'), 'utf8');
  for (const [slot, model, env] of requiredModelSlots) {
    if (!routing.includes(`\`${slot}\``)) fail(`Model routing missing slot ${slot}`);
    if (!routing.includes(model)) fail(`Model routing missing default model ${model}`);
    if (!routing.includes(env)) fail(`Model routing missing env override ${env}`);
  }

  const identity = readFileSync(path.join(projectDir, '.cerebro/cerebro-identity.md'), 'utf8');
  for (const toolName of ['cerebro_agent_task', 'cerebro_collect_result', 'cerebro_dispatch_agent']) {
    if (!identity.includes(toolName)) fail(`Cerebro identity missing tool ${toolName}`);
  }

  for (const file of ['cerebro.md', 'cyclops.md', 'wolverine.md', 'storm.md']) {
    const text = readFileSync(path.join(projectDir, '.opencode/agents', file), 'utf8');
    if (!text.includes('model_fallbacks:')) fail(`${file} missing model_fallbacks`);
    if (!text.includes('permission:')) fail(`${file} missing permission frontmatter`);
  }
}

function main() {
  const tarballPath = packArtifact();
  try {
    verifyFreshInstall(tarballPath);
  } finally {
    rmSync(tarballPath, { force: true });
  }
  console.log('Release artifact verification passed.');
}

main();
