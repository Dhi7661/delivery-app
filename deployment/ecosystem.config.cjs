/**
 * PlukIt Production PM2 Process Manager Configuration (F21)
 * Manages zero-downtime cluster reloads, automatic crash restarts, and log rotation.
 * Usage:
 *   pm2 start deployment/ecosystem.config.cjs
 *   pm2 reload deployment/ecosystem.config.cjs --update-env
 *   pm2 status
 */

module.exports = {
  apps: [
    {
      name: 'plukit-server',
      cwd: './server',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: './logs/pm2-server-error.log',
      out_file: './logs/pm2-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'plukit-client',
      cwd: './client',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-client-error.log',
      out_file: './logs/pm2-client-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
