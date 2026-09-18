import { customerLogin } from "./src/modules/auth/auth.service.js";
try {
  const r = await customerLogin("customer@jood.com", "Customer@12345", false, undefined);
  console.log("OK", JSON.stringify(r, null, 2));
} catch (e) {
  console.log("ERROR_NAME:", e?.name);
  console.log("ERROR_CODE:", e?.errorCode);
  console.log("ERROR_MESSAGE:", e?.message);
  console.log("STACK:", e?.stack);
}
process.exit(0);
