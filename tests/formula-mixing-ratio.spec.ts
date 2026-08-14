import { test, expect, type Page } from "@playwright/test";

const PAGE_PATH = "/tools/formula-mixing-ratio";

async function gotoFresh(page: Page) {
  await page.goto(PAGE_PATH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function gotoFreshOnDate(page: Page, isoDate: string) {
  await page.clock.setFixedTime(new Date(isoDate));
  await page.goto(PAGE_PATH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test.describe("簡易版", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("TC-S01: デフォルト値で正しい結果が表示される", async ({ page }) => {
    await expect(page.locator("#simple-result-hot")).toHaveText("39.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("100.3");
  });

  test("TC-S02: 入力値変更でリアルタイムに再計算される", async ({ page }) => {
    await page.locator("#simple-total").selectOption("200");
    await expect(page.locator("#simple-result-hot")).toHaveText("56.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("143.3");
  });

  test("TC-S07: 出来上がり量は20ml刻みのプルダウンになっている", async ({ page }) => {
    const select = page.locator("#simple-total");
    await expect(select).toHaveJSProperty("tagName", "SELECT");
    const values = await select.locator("option").allTextContents();
    expect(values).toEqual([
      "20", "40", "60", "80", "100", "120", "140", "160", "180",
      "200", "220", "240", "260", "280", "300",
    ]);
    await expect(select).toHaveValue("140");
  });

  test("TC-S03: お湯が湯冷まし以下の温度でエラーになる", async ({ page }) => {
    await page.locator("#simple-hot").fill("20");
    await expect(page.locator("#simple-error")).toBeVisible();
    await expect(page.locator("#simple-error span")).toHaveText(
      "お湯の温度は湯冷ましの温度より高くしてください。",
    );
    await expect(page.locator("#simple-result-hot")).toHaveText("-");
    await expect(page.locator("#simple-result-cool")).toHaveText("-");
  });

  test("TC-S04: お湯が70℃未満でエラーになる", async ({ page }) => {
    await page.locator("#simple-hot").fill("69");
    await expect(page.locator("#simple-error")).toBeVisible();
    await expect(page.locator("#simple-error span")).toHaveText(
      "調乳のお湯は70℃以上にしてください。",
    );
    await expect(page.locator("#simple-result-hot")).toHaveText("-");
    await expect(page.locator("#simple-result-cool")).toHaveText("-");
  });

  test("TC-S05: お湯が70〜74℃でもエラーにならず結果が計算される", async ({ page }) => {
    await page.locator("#simple-hot").fill("72");
    await expect(page.locator("#simple-error")).toBeHidden();
    await expect(page.locator("#simple-result-hot")).toHaveText("45.8");
    await expect(page.locator("#simple-result-cool")).toHaveText("94.2");
  });

  test("TC-S06: お湯が75℃以上ではエラーが表示されない", async ({ page }) => {
    await expect(page.locator("#simple-error")).toBeHidden();
  });

  test("TC-S08: メーカー規定のプルダウンが用意されている", async ({ page }) => {
    const select = page.locator("#simple-regulation");
    await expect(select).toHaveJSProperty("tagName", "SELECT");
    const labels = await select.locator("option").allTextContents();
    expect(labels).toEqual(["なし", "1/2以上", "2/3以上"]);
    await expect(select).toHaveValue("");
    await expect(page.locator("#simple-cooling-info")).toBeHidden();
  });

  test("TC-S10: 通常計算で既に規定を満たす場合は追加冷却案内が出ない", async ({ page }) => {
    await page.locator("#simple-target").fill("70");
    await page.locator("#simple-regulation").selectOption("2/3");

    await expect(page.locator("#simple-result-hot")).toHaveText("116.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("23.3");
    await expect(page.locator("#simple-cooling-info")).toBeHidden();
  });

  test("TC-S11: 計算の根拠セクションは初期状態で閉じており、開くと計算式等が表示される", async ({
    page,
  }) => {
    const details = page.locator("#simple-rationale");
    await expect(details).toHaveJSProperty("open", false);

    await details.locator("summary").click();
    await expect(details).toHaveJSProperty("open", true);
    await expect(details).toContainText("出来上がり量");
    await expect(details).toContainText("B13010");
    await expect(details).toContainText("東京都水道局");
  });
});

test.describe("簡易版（メーカー規定・追加冷却、8月に日付固定）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshOnDate(page, "2026-08-15T00:00:00");
  });

  test("TC-S09: 規定未達の場合はお湯量が引き上げられ、追加冷却の案内が表示される", async ({
    page,
  }) => {
    await page.locator("#simple-regulation").selectOption("1/2");

    await expect(page.locator("#simple-result-hot")).toHaveText("70.0");
    await expect(page.locator("#simple-result-cool")).toHaveText("70.0");

    const infoEl = page.locator("#simple-cooling-info");
    await expect(infoEl).toBeVisible();
    await expect(page.locator("#simple-cooling-result-temp")).toHaveText("50.0");
    await expect(page.locator("#simple-cooling-diff")).toHaveText("13.0");
    await expect(page.locator("#simple-cooling-tap-temp")).toHaveText("25.2");
    await expect(page.locator("#simple-cooling-tap-minutes")).toHaveText("2.0");
    await expect(page.locator("#simple-cooling-ice-minutes")).toHaveText("1.6");
  });
});

test.describe("入力値の永続化", () => {
  test("TC-P01: 簡易版の入力値がリロード後も保持される", async ({ page }) => {
    await gotoFresh(page);
    await page.locator("#simple-total").selectOption("200");
    await page.reload();

    await expect(page.locator("#simple-total")).toHaveValue("200");
    await expect(page.locator("#simple-result-hot")).toHaveText("56.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("143.3");
  });
});
