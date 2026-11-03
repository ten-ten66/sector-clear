module.exports = {
  apps: [{
    name:        'sector-clear',
    script:      './server/server.js',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT:     3001,
    },
    error_file: '/var/log/sector-clear-error.log',
    out_file:   '/var/log/sector-clear-out.log',
  }],
};
