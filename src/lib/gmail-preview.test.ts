import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as GmailPreviewModule from "./gmail-preview";

const { decodeBase64UrlUtf8, extractEmailBodiesFromPayload } = (await import(
  new URL("./gmail-preview.ts", import.meta.url).href
)) as typeof GmailPreviewModule;

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("decodeBase64UrlUtf8", () => {
  it("returns an empty string for blank inputs", () => {
    assert.equal(decodeBase64UrlUtf8(""), "");
    assert.equal(decodeBase64UrlUtf8("   \n\t "), "");
  });

  it("decodes Base64URL UTF-8 strings containing accents, emojis, and URL-safe characters", () => {
    const original = "Café mañana — ¡Oferta especial! 🚀🔥✅ /?=&+";
    const encoded = encodeBase64Url(original);

    assert.equal(encoded.includes("+"), false);
    assert.equal(encoded.includes("/"), false);
    assert.equal(encoded.includes("="), false);
    assert.equal(decodeBase64UrlUtf8(encoded), original);
  });

  it("handles padded and line-wrapped Base64URL payloads", () => {
    const original = "Resumen semanal: 100% verificación ñáéíóú €";
    const paddedBase64Url = Buffer.from(original, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const wrapped = `${paddedBase64Url.slice(0, 12)}\r\n${paddedBase64Url.slice(12)}`;

    assert.equal(decodeBase64UrlUtf8(wrapped), original);
  });
});

describe("extractEmailBodiesFromPayload", () => {
  it("returns null bodies when payload is missing or has no body parts", () => {
    assert.deepEqual(extractEmailBodiesFromPayload(undefined), {
      textBody: null,
      htmlBody: null,
    });
    assert.deepEqual(
      extractEmailBodiesFromPayload({ mimeType: "multipart/mixed", parts: [] }),
      {
        textBody: null,
        htmlBody: null,
      },
    );
  });

  it("extracts direct text/plain and text/html payloads", () => {
    assert.deepEqual(
      extractEmailBodiesFromPayload({
        mimeType: "text/plain; charset=utf-8",
        body: { data: encodeBase64Url("Hello plain world") },
      }),
      {
        textBody: "Hello plain world",
        htmlBody: null,
      },
    );

    assert.deepEqual(
      extractEmailBodiesFromPayload({
        mimeType: "text/html",
        body: { data: encodeBase64Url("<p>Hello HTML</p>") },
      }),
      {
        textBody: null,
        htmlBody: "<p>Hello HTML</p>",
      },
    );
  });

  it("recursively extracts text/plain and text/html inside nested multipart/* trees and skips attachments", () => {
    const result = extractEmailBodiesFromPayload({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [
            {
              mimeType: "multipart/alternative",
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: encodeBase64Url("Hola 👋 texto plano con acentos"),
                  },
                },
                {
                  mimeType: "text/html",
                  body: {
                    data: encodeBase64Url(
                      "<div><h1>Hola 👋</h1><p>Versión HTML</p></div>",
                    ),
                  },
                },
              ],
            },
            {
              mimeType: "image/png",
              filename: "logo.png",
              body: { attachmentId: "att-1", size: 1024 },
            },
          ],
        },
        {
          mimeType: "text/plain",
          filename: "notes.txt",
          headers: [
            { name: "Content-Disposition", value: 'attachment; filename="notes.txt"' },
          ],
          body: {
            data: encodeBase64Url("Attachment text should be ignored"),
          },
        },
      ],
    });

    assert.deepEqual(result, {
      textBody: "Hola 👋 texto plano con acentos",
      htmlBody: "<div><h1>Hola 👋</h1><p>Versión HTML</p></div>",
    });
  });
});
