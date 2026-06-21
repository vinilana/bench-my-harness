import { isValidLoginEmail } from "../../src/auth/validation.js";

if (!isValidLoginEmail("user@example.com")) {
  throw new Error("expected valid email");
}

if (isValidLoginEmail("user@localhost")) {
  throw new Error("expected missing domain suffix to be invalid");
}
