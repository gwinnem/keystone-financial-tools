import { exec } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { main, type Io } from './run.ts';

const execute = promisify(exec);

// The entry point of the package scripts (`node src/cli.ts <command>`; Node 22.18+ runs TypeScript by stripping the types). It only
// connects `main` to the file system; `__tests__/cli.test.ts` runs it as a child process, and `main` is unit-tested with a fake `Io`.
const io: Io = {
  readText: (path) => readFile(path, 'utf8'),
  writeText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  },
  exists: (path) =>
    access(path).then(
      () => true,
      () => false
    ),
  // One command line through the shell, so `npm` is found as `npm.cmd` on Windows too. The commands and arguments are fixed in `run.ts`, they
  // hold no spaces or shell characters.
  run: async (command, args, cwd) => (await execute([command, ...args].join(' '), { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout,
  // The report is the output of the command.
  // eslint-disable-next-line no-console
  log: (line) => console.log(line),
};

// packages/budgets/src -> the repository root.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

process.exitCode = await main(process.argv.slice(2), io, repositoryRoot);
