import { describe, it, expect } from "vitest";
import { optimizeImageUrl } from "@/lib/image-url";

describe("optimizeImageUrl", () => {
  it("añade f_auto,q_auto a URLs de Cloudinary sin transformaciones", () => {
    const url = "https://res.cloudinary.com/red-solidaria/image/upload/v1712345678/campanas/donacion.jpg";
    expect(optimizeImageUrl(url)).toBe(
      "https://res.cloudinary.com/red-solidaria/image/upload/f_auto,q_auto/v1712345678/campanas/donacion.jpg",
    );
  });

  it("añade w_ cuando se pide ancho", () => {
    const url = "https://res.cloudinary.com/red-solidaria/image/upload/v1712345678/mascota.jpg";
    expect(optimizeImageUrl(url, { width: 640 })).toBe(
      "https://res.cloudinary.com/red-solidaria/image/upload/f_auto,q_auto,w_640/v1712345678/mascota.jpg",
    );
  });

  it("no duplica transformaciones existentes", () => {
    const url = "https://res.cloudinary.com/red-solidaria/image/upload/w_800/v1712345678/foto.jpg";
    const result = optimizeImageUrl(url, { width: 800 });
    expect(result).toBe(
      "https://res.cloudinary.com/red-solidaria/image/upload/w_800,f_auto,q_auto/v1712345678/foto.jpg",
    );
  });

  it("deja intactas las URLs que no son de Cloudinary (Unsplash, relativas)", () => {
    const unsplash = "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80";
    expect(optimizeImageUrl(unsplash, { width: 400 })).toBe(unsplash);
    expect(optimizeImageUrl("/uploads/local.jpg")).toBe("/uploads/local.jpg");
  });

  it("devuelve cadena vacía para null/undefined", () => {
    expect(optimizeImageUrl(null)).toBe("");
    expect(optimizeImageUrl(undefined)).toBe("");
  });
});
