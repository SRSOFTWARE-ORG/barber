import { test, expect } from "../playwright-fixture";

/**
 * E2E: a troca de idioma por perfil persiste após recarregar e ao navegar
 * por várias rotas (BottomNav, Serviços, Promoções, Galeria, Perfil, Fatura).
 *
 * Estratégia: força o override de idioma no localStorage (mesma chave usada
 * pelo LanguageContext) e verifica que os rótulos do BottomNav refletem o
 * idioma escolhido em todas as rotas, mesmo após reload.
 */
const LS_KEY = "app_lang_override_v1";

// Rótulos do BottomNav por idioma (nav.home / nav.profile).
const LABELS = {
  en: { home: "Home", profile: "Profile" },
  es: { home: "Inicio", profile: "Perfil" },
} as const;

const ROUTES = ["/", "/services", "/promos", "/gallery", "/profile", "/fatura"];

async function setLang(page: import("@playwright/test").Page, lang: string) {
  await page.goto("/");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [LS_KEY, lang]);
}

test.describe("Persistência de idioma por perfil", () => {
  test("idioma escolhido persiste após reload em todas as rotas (EN)", async ({ page }) => {
    await setLang(page, "en");

    for (const route of ROUTES) {
      await page.goto(route);
      await page.reload(); // garante que persistiu após recarregar
      const nav = page.getByRole("navigation");
      await expect(nav.getByText(LABELS.en.home, { exact: true })).toBeVisible();
      await expect(nav.getByText(LABELS.en.profile, { exact: true })).toBeVisible();
    }
  });

  test("trocar para ES reflete imediatamente e ao navegar", async ({ page }) => {
    await setLang(page, "es");
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByText(LABELS.es.home, { exact: true })).toBeVisible();

    // Navega por rotas e confirma que o idioma se mantém.
    for (const route of ["/services", "/profile"]) {
      await page.goto(route);
      await expect(nav.getByText(LABELS.es.profile, { exact: true })).toBeVisible();
    }
  });

  test("idioma não suportado cai no fallback seguro (EN) sem quebrar a UI", async ({ page }) => {
    // Perfil/localStorage com idioma legado inválido não deve deixar a UI sem tradução.
    await setLang(page, "fr");
    await page.goto("/");
    await page.reload();
    const nav = page.getByRole("navigation");
    await expect(nav.getByText(LABELS.en.home, { exact: true })).toBeVisible();
    await expect(nav.getByText(LABELS.en.profile, { exact: true })).toBeVisible();
  });
});

