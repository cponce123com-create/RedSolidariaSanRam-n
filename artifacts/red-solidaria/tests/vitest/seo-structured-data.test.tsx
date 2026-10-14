// FE-09: datos estructurados y canonical del componente SEO.
//
// Lo que se fija aquí es el comportamiento observable en <head>:
//   - el JSON-LD se publica y, al pasar a una página que no lo define, se
//     RETIRA (si no, la siguiente heredaría los datos de la anterior);
//   - no se declaran alternates de idioma apuntando a la misma URL (el sitio se
//     sirve en una sola URL), solo `x-default`;
//   - el canonical sale de la URL pública configurada.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SEO from "@/components/shared/SEO";

const jsonLdScript = () =>
  document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');

const alternates = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]')].map((el) =>
    el.getAttribute("hreflang"),
  );

describe("SEO · datos estructurados (FE-09)", () => {
  it("publica el JSON-LD serializado", () => {
    render(<SEO title="Inicio" jsonLd={{ "@context": "https://schema.org", "@type": "NGO" }} />);

    const script = jsonLdScript();
    expect(script).not.toBeNull();
    expect(JSON.parse(script!.textContent!)).toMatchObject({ "@type": "NGO" });
  });

  it("retira el JSON-LD cuando la página siguiente no lo define", () => {
    const first = render(
      <SEO title="Inicio" jsonLd={{ "@context": "https://schema.org", "@type": "NGO" }} />,
    );
    expect(jsonLdScript()).not.toBeNull();

    first.unmount();
    render(<SEO title="Contacto" />);

    expect(jsonLdScript()).toBeNull();
  });

  it("no declara hreflang de idiomas apuntando a la misma URL", () => {
    render(<SEO title="Campañas" url="/campanas" />);

    expect(alternates()).toEqual(["x-default"]);
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute("href")).toMatch(/\/campanas$/);
  });

  it("no deja el canonical de la página anterior", () => {
    const first = render(<SEO title="A" url="/campanas" />);
    first.unmount();
    render(<SEO title="B" url="/adopciones" />);

    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute("href")).toMatch(/\/adopciones$/);
    expect(document.title).toContain("B");
  });
});
