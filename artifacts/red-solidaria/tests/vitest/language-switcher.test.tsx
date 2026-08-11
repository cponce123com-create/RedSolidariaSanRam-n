import { describe, it, expect, beforeAll } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { renderWithProviders } from "./test-utils";
import i18n from "@/lib/i18n";

describe("LanguageSwitcher", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("es");
  });

  it("cambia el idioma activo y sincroniza <html lang>", async () => {
    const user = userEvent.setup();
    // En la app lo fija main.tsx al arrancar; en jsdom partimos sin atributo.
    document.documentElement.lang = "es";
    renderWithProviders(<LanguageSwitcher />);

    expect(document.documentElement.lang).toBe("es");

    await user.click(screen.getByRole("button", { name: "EN" }));
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(i18n.language).toBe("en");
    // Persistencia de la preferencia
    expect(window.localStorage.getItem("rs_lang")).toBe("en");

    await user.click(screen.getByRole("button", { name: "ES" }));
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    expect(window.localStorage.getItem("rs_lang")).toBe("es");
  });
});
