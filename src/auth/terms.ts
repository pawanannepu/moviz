/**
 * The terms version stamped on a new profile at sign up (spec 0005, AC-12).
 * It is the date the legal pages last changed, so the two can never drift
 * (spec 0014, AC-5). Profiles created before spec 0014 shipped keep
 * `pre-launch`.
 */
export { LEGAL_UPDATED_ON as TERMS_VERSION } from "@/legal/operator";
