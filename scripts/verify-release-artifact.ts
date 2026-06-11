import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageName = 'open-xmen';
const expectedPackagePluginEntry = packageName;

const requiredPackagedFiles = [
  'package.json',
  'README.md',
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

const allowedTopLevelFiles = new Set(['package.json', 'README.md']);
const forbiddenPackagedPathPattern = /(^|\/)\.env(\.|$|\/)|secret|credential|token|private[-_]?key|node_modules|__pycache__|\.pyc$|\.opencode\/|\.cerebro\/|\.claude\/|\.omx\/|\.sisyphus\//i;
const expectedResolvedCommands = ['cerebro-index', 'cerebro-plan', 'cerebro-start-work', 'cerebro-ultrawork'];
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
    const installedSkill = path.join(opencodeConfigDir, 'skills', 'opx-frontend-design', 'SKILL.md');
    if (!existsSync(installedSkill)) fail(`Default install did not install the global skill at ${installedSkill}`);
    if (!readFileSync(installedSkill, 'utf8').includes('name: opx-frontend-design')) fail('Installed skill SKILL.md missing namespaced name frontmatter');
    if (existsSync(path.join(opencodeConfigDir, 'open-xmen.json'))) fail('Non-interactive default install should not write a model preset');
    verifyResolvedOpenCodeRuntime(defaultProjectDir, isolatedOpenCodeEnv);
    run('node', [cliPath, 'doctor', '--dir', defaultProjectDir], { cwd: packageDir, env: isolatedOpenCodeEnv });

    console.log('Running model preset + MCP smoke (anthropic / performance / semble)...');
    run('node', [cliPath, 'install', '--provider', 'anthropic', '--focus', 'performance', '--mcp', 'semble', '--no-deps'], { cwd: defaultProjectDir, env: isolatedOpenCodeEnv });
    const presetFile = path.join(opencodeConfigDir, 'open-xmen.json');
    if (!existsSync(presetFile)) fail('Preset install did not write open-xmen.json');
    const preset = JSON.parse(readFileSync(presetFile, 'utf8'));
    if (!Array.isArray(preset.providers) || !preset.providers.includes('anthropic') || preset.focus !== 'performance') {
      fail(`open-xmen.json preset content incorrect: ${JSON.stringify(preset)}`);
    }
    if (!Array.isArray(preset.mcp_servers) || !preset.mcp_servers.includes('semble')) {
      fail(`open-xmen.json mcp_servers incorrect: ${JSON.stringify(preset)}`);
    }
    const modelsOut = run('node', [cliPath, 'models'], { cwd: defaultProjectDir, env: isolatedOpenCodeEnv });
    if (!modelsOut.includes('anthropic/claude-opus-4-8')) fail(`models did not reflect the anthropic preset:\n${modelsOut}`);
    if (modelsOut.includes('"workers": "openai')) fail('anthropic-only preset should not select an OpenAI worker model');
    const resolvedWithMcp = JSON.parse(run('opencode', ['debug', 'config'], { cwd: defaultProjectDir, env: isolatedOpenCodeEnv }));
    if (!isRecord(resolvedWithMcp.mcp) || !isRecord((resolvedWithMcp.mcp as Record<string, JsonValue>).semble)) {
      fail('enabled semble MCP server was not registered in the resolved OpenCode config');
    }

    console.log('Running installed CLI plugin-only smoke install...');
    run('node', [cliPath, 'install', '--dir', projectDir, '--no-deps'], { cwd: packageDir });

    const opencodeConfig = readJsonc(path.join(projectDir, 'opencode.jsonc'));
    if (!isRecord(opencodeConfig) || !Array.isArray(opencodeConfig.plugin) || !opencodeConfig.plugin.includes(expectedPackagePluginEntry)) {
      fail(`Installed opencode.jsonc does not include package plugin entry ${expectedPackagePluginEntry}`);
    }
    if (opencodeConfig.default_agent !== 'cerebro') fail('Project-local install should set default_agent to cerebro');
    if (existsSync(path.join(projectDir, '.opencode'))) fail('Plugin-only install unexpectedly wrote .opencode/');
    if (existsSync(path.join(projectDir, '.cerebro'))) fail('Plugin-only install unexpectedly wrote .cerebro/');
    if (existsSync(path.join(projectDir, 'AGENTS.md'))) fail('Plugin-only install unexpectedly wrote AGENTS.md');
    if (!existsSync(path.join(projectDir, 'opencode.jsonc'))) fail('Plugin-only install should write a project opencode.jsonc');
    verifyResolvedOpenCodeRuntime(projectDir, isolatedOpenCodeEnv);

    // No `doctor` here for the project-local + --no-deps smoke with a warmed cache;
    // the default-install doctor path above covers the user-config flow.

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
      if (commandNames.length !== 4) throw new Error(\`Expected 4 commands, got \${commandNames.length}\`);
      if (!commandNames.includes('cerebro-plan') || !commandNames.includes('cerebro-ultrawork')) throw new Error('Missing preserved command registrations');
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
    if ('default_agent' in globalConfig) fail('Global install should not force default_agent');
    const globalSkill = path.join(globalConfigRoot, 'opencode', 'skills', 'opx-frontend-design', 'SKILL.md');
    if (!existsSync(globalSkill)) fail(`Global install did not install the skill at ${globalSkill}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
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
