import { test, expect, type Page } from "@playwright/test";

const PAGE_PATH = "/tools/formula-mixing-ratio";

async function gotoFresh(page: Page) {
  await page.goto(PAGE_PATH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function openDetailTab(page: Page) {
  await page.locator("#tab-detail").click();
}

test.describe("簡易版", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("TC-S01: デフォルト値で正しい結果が表示される", async ({ page }) => {
    await expect(page.locator("#simple-result-hot")).toHaveText("46.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("93.3");
  });

  test("TC-S02: 入力値変更でリアルタイムに再計算される", async ({ page }) => {
    await page.locator("#simple-total").fill("200");
    await expect(page.locator("#simple-result-hot")).toHaveText("66.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("133.3");
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

  test("TC-S05: お湯が70〜74℃で警告が表示され、結果も表示される", async ({ page }) => {
    await page.locator("#simple-hot").fill("72");
    await expect(page.locator("#simple-error")).toBeHidden();
    await expect(page.locator("#simple-warning")).toBeVisible();
    await expect(page.locator("#simple-warning span")).toHaveText(
      "調乳では75℃以上のお湯を使うことが推奨されています。",
    );
    await expect(page.locator("#simple-result-hot")).toHaveText("53.8");
    await expect(page.locator("#simple-result-cool")).toHaveText("86.2");
  });

  test("TC-S06: お湯が75℃以上ではエラー・警告いずれも表示されない", async ({ page }) => {
    await expect(page.locator("#simple-error")).toBeHidden();
    await expect(page.locator("#simple-warning")).toBeHidden();
  });
});

test.describe("詳細版", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    await openDetailTab(page);
  });

  test("TC-D01: デフォルト値で正しい結果が表示される", async ({ page }) => {
    await expect(page.locator("#detail-result-hot")).toHaveText("55.4");
    await expect(page.locator("#detail-result-cool")).toHaveText("84.6");
  });

  test("TC-D02: 室温同期チェックボックスは初期状態でチェック済み・入力欄は無効化されている", async ({
    page,
  }) => {
    await expect(page.locator("#detail-powder-temp-sync")).toBeChecked();
    await expect(page.locator("#detail-bottle-temp-sync")).toBeChecked();
    await expect(page.locator("#detail-powder-temp")).toBeDisabled();
    await expect(page.locator("#detail-bottle-temp")).toBeDisabled();
  });

  test("TC-D03: 室温を変更するとチェック中の項目が自動追従する", async ({ page }) => {
    await page.locator("#detail-room-temp").fill("30");
    await expect(page.locator("#detail-powder-temp")).toHaveValue("30");
    await expect(page.locator("#detail-bottle-temp")).toHaveValue("30");
    await expect(page.locator("#detail-result-hot")).toHaveText("52.5");
    await expect(page.locator("#detail-result-cool")).toHaveText("87.5");
  });

  test("TC-D04: チェックを外すと編集可能になり、以後は室温変更の影響を受けない", async ({
    page,
  }) => {
    await page.locator("#detail-powder-temp-sync").uncheck();
    await expect(page.locator("#detail-powder-temp")).toBeEnabled();
    await page.locator("#detail-powder-temp").fill("15");

    await page.locator("#detail-room-temp").fill("35");
    await expect(page.locator("#detail-powder-temp")).toHaveValue("15");
    await expect(page.locator("#detail-bottle-temp")).toHaveValue("35");
  });

  test("TC-D05: 哺乳瓶の材質を変更すると結果が再計算される", async ({ page }) => {
    const defaultHot = await page.locator("#detail-result-hot").textContent();
    await page.locator("#detail-bottle-material").selectOption({ label: "ガラス" });
    await expect(page.locator("#detail-result-hot")).not.toHaveText(defaultHot ?? "");
  });

  test("TC-D06: お湯が70℃未満でエラーになる", async ({ page }) => {
    await page.locator("#detail-hot").fill("65");
    await expect(page.locator("#detail-error")).toBeVisible();
    await expect(page.locator("#detail-error span")).toHaveText(
      "調乳のお湯は70℃以上にしてください。",
    );
    await expect(page.locator("#detail-result-hot")).toHaveText("-");
    await expect(page.locator("#detail-result-cool")).toHaveText("-");
  });
});

test.describe("入力値の永続化", () => {
  test("TC-P01: 簡易版の入力値がリロード後も保持される", async ({ page }) => {
    await gotoFresh(page);
    await page.locator("#simple-total").fill("200");
    await page.reload();

    await expect(page.locator("#simple-total")).toHaveValue("200");
    await expect(page.locator("#simple-result-hot")).toHaveText("66.7");
    await expect(page.locator("#simple-result-cool")).toHaveText("133.3");
  });

  test("TC-P02: 詳細版のチェックボックス状態がリロード後も保持される", async ({ page }) => {
    await gotoFresh(page);
    await openDetailTab(page);
    await page.locator("#detail-powder-temp-sync").uncheck();
    await page.reload();
    await openDetailTab(page);

    await expect(page.locator("#detail-powder-temp-sync")).not.toBeChecked();
    await expect(page.locator("#detail-powder-temp")).toBeEnabled();
  });
});
