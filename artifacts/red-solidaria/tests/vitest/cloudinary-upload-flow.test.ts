import { expect, it, vi } from "vitest";
import { uploadImageToCloudinary, UploadError } from "@/lib/cloudinary-upload";

it("uploads the selected image with exactly the signed parameters and retains its public ID", async () => {
  const signature = { cloudName: "test-cloud", apiKey: "public-test-key", timestamp: "123", publicId: "test-id", folder: "campaign-evidence", allowedFormats: "jpg,png,webp", signature: "test-signature" };
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(signature), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ secure_url: "https://res.cloudinary.com/test-cloud/image/upload/photo.jpg", public_id: "campaign-evidence/test-id" }), { status: 200 }));
  vi.stubGlobal("fetch", request);
  const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
  const saved = await uploadImageToCloudinary(file, "/api/uploads/admin-signature");
  expect(request.mock.calls[0][0]).toBe("/api/uploads/admin-signature");
  expect(request.mock.calls[1][0]).toBe("https://api.cloudinary.com/v1_1/test-cloud/image/upload");
  const form = request.mock.calls[1][1].body as FormData;
  expect(form.get("file")).toBe(file);
  expect(form.get("allowed_formats")).toBe(signature.allowedFormats);
  expect(form.get("folder")).toBe(signature.folder);
  expect(form.get("signature")).toBe(signature.signature);
  expect(form.has("max_bytes")).toBe(false);
  expect(saved.publicId).toBe("campaign-evidence/test-id");
});

it("a signature rate limit stops the upload and shows the actual cause", async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Demasiadas acciones administrativas. Por favor espera." }), { status: 429 }));
  vi.stubGlobal("fetch", request);
  try {
    await uploadImageToCloudinary(new File(["image"], "photo.jpg", { type: "image/jpeg" }), "/api/uploads/admin-signature");
    throw new Error("must reject");
  } catch (error) {
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).kind).toBe("rate_limit");
    expect((error as UploadError).message).toContain("Demasiadas acciones administrativas");
  }
  expect(request).toHaveBeenCalledTimes(1);
});

it("missing image configuration is visible instead of being hidden by a generic 503", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Cloudinary no está configurado." }), { status: 503 })));
  await expect(uploadImageToCloudinary(new File(["image"], "photo.jpg", { type: "image/jpeg" }), "/api/uploads/admin-signature")).rejects.toThrow("Cloudinary no está configurado.");
});
