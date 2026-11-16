import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("build matching English and Korean pages with working navigation", (t) => {
	const output = mkdtempSync(join(tmpdir(), "parksnoopy-site-"));
	t.after(() => rmSync(output, { recursive: true, force: true }));
	execFileSync(
		process.env.HUGO_BINARY || "hugo",
		["--gc", "--minify", "--panicOnWarning", "--destination", output],
		{ cwd: root, stdio: "pipe" },
	);
	const pages = (language) =>
		readdirSync(join(root, "content", language), { recursive: true })
			.filter((path) => path.endsWith(".md"))
			.sort();
	assert.deepEqual(pages("en"), pages("kr"));
	assert.ok(pages("en").length > 0);
	for (const path of pages("en")) {
		const route = path.replace(/(?:_index)?\.md$/, "");
		const suffix = route && !route.endsWith("/") ? `${route}/` : route;
		for (const [directory, language, prefix] of [
			["en", "en", "/"],
			["kr", "ko", "/ko/"],
		]) {
			const source = readFileSync(
				join(root, "content", directory, path),
				"utf8",
			);
			assert.doesNotMatch(source, /Lorem ipsum|Sample Tool|Duis aute|Sed ut/i);
			if (language === "ko") assert.match(source, /[가-힣]/);
			const html = readFileSync(
				join(output, prefix, suffix, "index.html"),
				"utf8",
			);
			assert.match(html, new RegExp(`<html lang=["']?${language}["' >]`));
			assert.ok(html.includes(`href=${prefix}portfolio/`));
			assert.ok(html.includes(`href=${prefix}posts/`));
			assert.ok(html.includes(`href=${prefix}tools/`));
			assert.ok(html.includes(`href=${prefix}releases/`));
			for (const translation of ["/", "/ko/"]) {
				assert.ok(html.includes(`href=${translation}${suffix}`));
			}
			assert.match(html, /hreflang=en-US/);
			assert.match(html, /hreflang=ko-KR/);
			for (const [, href] of html.matchAll(
				/<a\b[^>]*\bhref=["']?([^\s"'>]+)/g,
			)) {
				const target = new URL(
					href,
					`https://parksnoopy.github.io${prefix}${suffix}`,
				);
				if (target.origin !== "https://parksnoopy.github.io") continue;
				const file = decodeURIComponent(target.pathname);
				assert.ok(
					existsSync(
						join(output, file, file.endsWith("/") ? "index.html" : ""),
					),
					`${prefix}${suffix}: broken link ${href}`,
				);
			}
		}
	}
	for (const prefix of ["", "ko/"]) {
		for (const sample of ["sample-tool-2", "sample-tool-3"]) {
			assert.equal(existsSync(join(output, prefix, "tools", sample)), false);
		}
	}
	for (const tool of ["qr-share", "qr-share-twoway"]) {
		assert.ok(existsSync(join(output, "tools", tool, "app", "index.html")));
		assert.equal(existsSync(join(output, "ko", "tools", tool, "app")), false);
	}
});
