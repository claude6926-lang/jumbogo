// Load the intended server environment using the approved deployment tooling.
const {retryPaymentEmails}=await import('../src/lib/server/payment-email');
console.log(await retryPaymentEmails());
export {};
