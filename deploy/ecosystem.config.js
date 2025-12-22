// PM2 Ecosystem Config for cPanel
// Run: pm2 start ecosystem.config.js --env production
// Docs: https://pm2.keymetrics.io/docs/usage/ecosystem-file/

module.exports = {
  apps: [
    {
      name: 'rise-api',
      script: './rise-local-lead-creation/api/dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DB_HOST: 'localhost',
        DB_USER: process.env.DB_USER || 'apex2600_riselocal',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        DB_NAME: process.env.DB_NAME || 'apex2600_riselocal',
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
    },
  ],

  // Deploy configuration
  deploy: {
    production: {
      user: 'apex2600',
      host: 'acme.zonedock.com',
      port: 22,
      ref: 'origin/main',
      repo: 'https://github.com/JSXSTEWART/rise-local-lead-maker.git',
      path: '/home/apex2600/rise-lead-api',
      'post-deploy':
        'npm install --omit=dev && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying to production"',
    },
  },
};
