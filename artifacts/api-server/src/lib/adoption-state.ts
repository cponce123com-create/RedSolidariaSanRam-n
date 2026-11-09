/** Resolve a decision without undoing a manual withdrawal or another adoption. */
export function adoptionPetStatus(currentPet: string, previousRequest: string, nextRequest: string, others: string[]): string {
  if (nextRequest === "approved") return "adopted";
  if (nextRequest === "in-process") return "in-process";
  if (others.includes("approved")) return "adopted";
  if (others.includes("in-process")) return "in-process";
  if (["approved", "in-process"].includes(previousRequest) && ["adopted", "in-process"].includes(currentPet)) return "available";
  return currentPet;
}
