const { spawn } = require('node:child_process');
const path = require('node:path');

const projectDir = __dirname;
const expoCli = path.join(projectDir, 'node_modules', 'expo', 'bin', 'cli');
const processes = new Set();
let stopping = null;

function start(command, args) {
  const child = spawn(command, args, {
    cwd: projectDir,
    env: process.env,
    stdio: 'inherit'
  });

  processes.add(child);
  child.once('error', (error) => {
    console.error(`Could not start ${command}:`, error);
    stop(1);
  });
  child.once('exit', (code) => {
    processes.delete(child);
    if (stopping === null && code !== 0) {
      console.error(`${command} exited with code ${code}.`);
      stop(code || 1);
    }
    if (stopping !== null && processes.size === 0) process.exitCode = stopping;
  });
  return child;
}

function stop(exitCode = 0) {
  if (stopping !== null) return;
  stopping = exitCode;
  for (const child of processes) child.kill();
  if (processes.size === 0) process.exitCode = exitCode;
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

const build = start(process.execPath, [
  expoCli,
  'export',
  '--platform',
  'web',
  '--output-dir',
  'dist-web'
]);

build.once('exit', (code) => {
  if (stopping !== null || code !== 0) return;
  start(process.execPath, [path.join(projectDir, 'multi-server.js')]);
  start(process.execPath, [expoCli, 'start', '--lan']);
});
