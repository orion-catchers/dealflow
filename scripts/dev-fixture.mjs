import { spawn } from 'node:child_process';
if (process.env.NODE_ENV === 'production') throw new Error('Development adapters are forbidden in production');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', '127.0.0.1'], { stdio: 'inherit', env: { ...process.env, DEALFLOW_ADAPTER: 'development' } });
child.on('exit', code => process.exit(code ?? 1));
