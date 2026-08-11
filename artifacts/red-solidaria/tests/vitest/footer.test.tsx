import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";
import { renderWithProviders } from "./test-utils";

describe("Footer", () => {
  it("renderiza los enlaces sociales con iconos SVG inline (sin depender de iconos de marca de lucide)", () => {
    renderWithProviders(<Footer />);

    // El setup fuerza idioma "es": los aria-labels vienen de los locales.
    const facebook = screen.getByRole("link", { name: "Facebook de Red Solidaria San Ramón" });
    const instagram = screen.getByRole("link", { name: "Instagram de Red Solidaria San Ramón" });

    expect(facebook).toHaveAttribute("href", "https://facebook.com/redsolidariasanramon");
    expect(facebook).toHaveAttribute("target", "_blank");
    expect(instagram).toHaveAttribute("href", "https://instagram.com/redsolidariasanramon");
    expect(instagram).toHaveAttribute("target", "_blank");

    // Los iconos son SVGs inline propios (lucide eliminó Facebook/Instagram en v1.x),
    // con el mismo estilo de trazo que los iconos de lucide.
    const facebookSvg = facebook.querySelector("svg");
    const instagramSvg = instagram.querySelector("svg");
    expect(facebookSvg).toBeInTheDocument();
    expect(instagramSvg).toBeInTheDocument();
    expect(facebookSvg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(facebookSvg).toHaveAttribute("stroke", "currentColor");
    expect(facebookSvg?.querySelector("path")).not.toBeNull();
    expect(instagramSvg?.querySelector("rect")).not.toBeNull();
  });

  it("marca los iconos sociales como aria-hidden (el aria-label vive en el enlace)", () => {
    renderWithProviders(<Footer />);

    const facebook = screen.getByRole("link", { name: "Facebook de Red Solidaria San Ramón" });
    expect(facebook.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
