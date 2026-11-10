// Inert process only. Jobs are separate explicit docker exec calls after permission.
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
setInterval(() => {}, 60_000);
