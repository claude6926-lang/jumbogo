// Backwards-compatible entry point; all local launchers share the same HTTPS origin.
process.argv.push('--dev');
await import('./demo-server.mjs');
