// Run explicitly with the target environment loaded; never on request startup.
export {};
process.env.DATABASE_MIGRATE='true';
process.env.DEMO_MODE='false';
for(const moduleName of ['db','auth-store','customer-details','driver-store','wallet-store','wallet-payments','password-reset','admin-store','maps','notifications','cms-store','job-board-store']){
  await import(`../src/lib/server/${moduleName}.ts`);
}
await import('../src/lib/server/beam-wallet');
await import('../src/lib/server/company-store');
await import('../src/lib/server/premium-payments');
await import('../src/lib/server/booking-extras');
await import('../src/lib/server/payment-email');
console.log('Database schema initialized. No user data was imported.');
