import { describe, expect, it } from "vitest";

import { isValidBotToken, parseTelegramUpdate, publicWebhookBase, splitTelegramText } from "@/lib/telegram-rules";

describe("publicWebhookBase", () => {
  it("maps the login-protected editor preview to the public dev address", () => {
    expect(publicWebhookBase("https://id-preview--13a89fad-99fc.lovable.app")).toBe(
      "https://project--13a89fad-99fc-dev.lovable.app",
    );
  });
  it("keeps a published address", () => {
    expect(publicWebhookBase("https://javobchi.lovable.app")).toBe("https://javobchi.lovable.app");
  });
  it("rejects addresses Telegram cannot reach", () => {
    expect(publicWebhookBase("http://localhost:8080")).toBeNull();
  });
});

describe("isValidBotToken", () => {
  it("accepts a BotFather token", () => {
    expect(isValidBotToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
  });
  it("rejects random text", () => {
    expect(isValidBotToken("my-bot")).toBe(false);
  });
});

describe("parseTelegramUpdate", () => {
  const base = { update_id: 10, message: { chat: { id: 55, type: "private" }, from: { first_name: "Ali", username: "ali_t" } } };

  it("reads a private text message", () => {
    const r = parseTelegramUpdate({ ...base, message: { ...base.message, text: "Narxi qancha?" } });
    expect(r).toMatchObject({ chatId: "55", contactName: "Ali", username: "ali_t", text: "Narxi qancha?" });
  });
  it("reads a voice note", () => {
    const r = parseTelegramUpdate({ ...base, message: { ...base.message, voice: { file_id: "F1", file_size: 900 } } });
    expect(r?.voice?.fileId).toBe("F1");
  });
  it("ignores group chats", () => {
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: -5, type: "group" }, text: "hi" } })).toBeNull();
  });
});

describe("splitTelegramText", () => {
  it("splits long answers under the 4096 limit", () => {
    const parts = splitTelegramText("a ".repeat(5000));
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.length <= 4096)).toBe(true);
  });
});
