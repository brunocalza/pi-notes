import { describe, it, expect } from "vitest";
import { isValidTag, normalizeTag, validateTag } from "./tags";

// ── isValidTag ────────────────────────────────────────────────────────────────

describe("isValidTag", () => {
  describe("valid flat tags", () => {
    it.each([
      "rust",
      "distributed-systems",
      "distributed systems",
      "tokio-runtime",
      "web3 storage",
      "a",
      "abc123",
    ])("accepts %s", (tag) => expect(isValidTag(tag)).toBe(true));
  });

  describe("valid hierarchical tags", () => {
    it.each([
      "language/rust",
      "topic/distributed-systems",
      "topic/distributed systems",
      "programming/rust async",
      "knowledge/note-taking",
    ])("accepts %s", (tag) => expect(isValidTag(tag)).toBe(true));
  });

  describe("invalid separator combinations", () => {
    it.each(["-rust", "rust-", "rust--", "rust//", "/rust", "rust/"])("rejects %s", (tag) =>
      expect(isValidTag(tag)).toBe(false)
    );
  });

  describe("invalid namespace structures", () => {
    it("rejects rust//tokio", () => expect(isValidTag("rust//tokio")).toBe(false));
    it("rejects /rust/tokio", () => expect(isValidTag("/rust/tokio")).toBe(false));
    it("rejects rust/tokio/", () => expect(isValidTag("rust/tokio/")).toBe(false));
  });

  describe("invalid characters", () => {
    it.each(["Rust", "rust_tag", "café"])("rejects %s", (tag) =>
      expect(isValidTag(tag)).toBe(false)
    );
  });

  describe("invalid space usage", () => {
    it("rejects double spaces", () => expect(isValidTag("rust  async")).toBe(false));
    it("rejects leading space", () => expect(isValidTag(" rust")).toBe(false));
    it("rejects trailing space", () => expect(isValidTag("rust ")).toBe(false));
    it("rejects space at start of segment", () => expect(isValidTag("lang/ rust")).toBe(false));
    it("rejects space at end of segment", () => expect(isValidTag("lang /rust")).toBe(false));
  });

  describe("length limits", () => {
    it("rejects empty string", () => expect(isValidTag("")).toBe(false));
    it("rejects 51-char tag", () => expect(isValidTag("a".repeat(51))).toBe(false));
    it("accepts 50-char tag", () => expect(isValidTag("a".repeat(50))).toBe(true));
  });
});

// ── normalizeTag ──────────────────────────────────────────────────────────────

describe("normalizeTag", () => {
  it("lowercases and preserves single spaces", () => {
    expect(normalizeTag("Rust Async Runtime")).toBe("rust async runtime");
  });

  it("trims and collapses multiple spaces to one", () => {
    expect(normalizeTag("  hello  world  ")).toBe("hello world");
  });

  it("collapses consecutive hyphens", () => {
    expect(normalizeTag("rust--async")).toBe("rust-async");
  });

  it("strips leading #", () => {
    expect(normalizeTag("#rust")).toBe("rust");
  });

  it("lowercases input", () => {
    expect(normalizeTag("Rust")).toBe("rust");
  });

  it("preserves / hierarchy", () => {
    expect(normalizeTag("language/rust")).toBe("language/rust");
  });

  it("handles mixed case with hierarchy and spaces", () => {
    expect(normalizeTag("Topic/Distributed Systems")).toBe("topic/distributed systems");
  });
});

// ── validateTag ───────────────────────────────────────────────────────────────

describe("validateTag", () => {
  it("returns valid for a well-formed tag", () => {
    const r = validateTag("rust");
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.normalized).toBe("rust");
  });

  it("returns valid for hierarchical tag", () => {
    const r = validateTag("language/rust");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("language/rust");
  });

  it("accepts single space between words", () => {
    const r = validateTag("rust async");
    expect(r.normalized).toBe("rust async");
    expect(r.valid).toBe(true);
  });

  it("accepts space within a namespace segment", () => {
    const r = validateTag("topic/distributed systems");
    expect(r.normalized).toBe("topic/distributed systems");
    expect(r.valid).toBe(true);
  });

  it("normalizes multiple spaces before validating", () => {
    const r = validateTag("  rust  async  ");
    expect(r.normalized).toBe("rust async");
    expect(r.valid).toBe(true);
  });

  it("reports uppercase error even though normalized form is valid", () => {
    const r = validateTag("Rust Async");
    expect(r.normalized).toBe("rust async");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("uppercase letters are not allowed");
  });

  it("reports tag is empty", () => {
    const r = validateTag("");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("tag is empty");
  });

  it("reports tag is empty for whitespace-only input", () => {
    const r = validateTag("   ");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("tag is empty");
  });

  it("reports tag exceeds 50 characters", () => {
    const r = validateTag("a".repeat(51));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("tag exceeds 50 characters");
  });

  it("reports uppercase letters are not allowed", () => {
    const r = validateTag("Rust");
    expect(r.errors).toContain("uppercase letters are not allowed");
  });

  it("normalizes consecutive hyphens to single hyphen (valid)", () => {
    const r = validateTag("rust--async");
    expect(r.normalized).toBe("rust-async");
    expect(r.valid).toBe(true);
  });

  it("reports only lowercase letters allowed for disallowed chars", () => {
    const r = validateTag("rust_async");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(
      "only lowercase letters, numbers, hyphens, spaces, and / are allowed"
    );
  });

  it("reports empty namespace segment for //", () => {
    const r = validateTag("rust//tokio");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("empty namespace segment");
  });

  it("reports cannot start or end with separator for leading /", () => {
    const r = validateTag("/rust");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("tag cannot start or end with a separator");
  });

  it("reports cannot start or end with separator for trailing /", () => {
    const r = validateTag("rust/");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("tag cannot start or end with a separator");
  });
});
