// Minimal shims for libraries expecting Node globals in the browser
// Fixes: ReferenceError: global is not defined
(window as any).global = window as any;
// Optional: some libs check process.env
(window as any).process = (window as any).process || { env: {} };
