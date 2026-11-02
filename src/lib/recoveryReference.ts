import { authStorage } from "./authStorage";
import { createRecoveryReference } from "./interviewRecoveryReference";
export const recoveryReference = createRecoveryReference(authStorage);
