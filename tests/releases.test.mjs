import assert from "node:assert/strict";
import test from "node:test";
import { fetchReleases, packageFiles } from "../static/releases.js";

const repo = "DUMMY/releases";
const release = (tag_name, extra = {}) => ({
	tag_name,
	draft: false,
	prerelease: false,
	...extra,
});
const response = (body, headers = {}) =>
	new Response(JSON.stringify(body), { headers });

test("load the newest stable release for each exact project slug", async () => {
	const calls = [];
	const latest = await fetchReleases(
		repo,
		["sample", "other"],
		async (url, options) => {
			calls.push({ url, options });
			return response([
				release("sample-aaaaaaa", { prerelease: true }),
				release("sample-bbbbbbb", { draft: true }),
				release("sample-extra-ccccccc"),
				release("sample-ddddddd"),
				release("sample-eeeeeee"),
				release("other-fffffff"),
			]);
		},
	);
	assert.equal(latest.get("sample").tag_name, "sample-ddddddd");
	assert.equal(latest.get("other").tag_name, "other-fffffff");
	assert.equal(calls.length, 1);
	assert.equal(
		calls[0].url,
		`https://api.github.com/repos/${repo}/releases?per_page=100&page=1`,
	);
	assert.equal(calls[0].options.cache, "no-store");
	assert.equal(calls[0].options.credentials, "omit");
	assert.equal(calls[0].options.headers.Authorization, undefined);
});

test("follow pagination for a project absent from the first page", async () => {
	const calls = [];
	const latest = await fetchReleases(
		repo,
		["sample", "other", "missing"],
		async (url) => {
			calls.push(url);
			return calls.length === 1
				? response([release("sample-aaaaaaa")], {
						link: '<https://api.github.com/repos/DUMMY/releases/releases?page=2>; rel="next"',
					})
				: response([release("other-bbbbbbb")]);
		},
	);
	assert.equal(calls.length, 2);
	assert.match(calls[1], /page=2$/);
	assert.equal(latest.get("other").tag_name, "other-bbbbbbb");
	assert.equal(latest.has("missing"), false);
});

test("stop pagination once every requested project is found", async () => {
	let calls = 0;
	await fetchReleases(repo, ["sample"], async () => {
		calls++;
		return response([release("sample-aaaaaaa")], {
			link: '<https://api.github.com/next>; rel="next"',
		});
	});
	assert.equal(calls, 1);
});

test("do not convert API failures or malformed responses into missing releases", async () => {
	for (const status of [403, 404, 500]) {
		await assert.rejects(
			fetchReleases(repo, ["sample"], async () => new Response("", { status })),
			new RegExp(`HTTP ${status}`),
		);
	}
	await assert.rejects(
		fetchReleases(
			repo,
			["sample"],
			async () =>
				new Response("", {
					status: 403,
					headers: { "x-ratelimit-remaining": "0" },
				}),
		),
		/request limit/,
	);
	await assert.rejects(
		fetchReleases(repo, ["sample"], async () => response({})),
		/invalid release list/,
	);
	await assert.rejects(
		fetchReleases(repo, ["sample"], async () => {
			throw new TypeError("DUMMY offline");
		}),
		/DUMMY offline/,
	);
});

test("preserve package variants, compound extensions, sizes and platform groups", () => {
	const asset = (name) => ({
		name,
		state: "uploaded",
		size: 1048576,
		browser_download_url: `https://github.com/${repo}/releases/download/sample-aaaaaaa/${name}`,
	});
	const groups = packageFiles(
		[
			asset("Sample_v1.2.3-amd64-Linux.tar.gz"),
			asset("Sample_v1.2.3-amd64-Linux_CLI.zip"),
			asset("Sample_v1.2.3-arm64-iOS_Simulator.zip"),
			asset("Sample_v1.2.3-amd64-Windows.exe"),
			{ ...asset("Sample_v1.2.3-arm64-macOS.zip"), state: "new" },
			{
				...asset("Sample_v1.2.3-arm64-Android.apk"),
				browser_download_url: "javascript:alert(1)",
			},
			{
				...asset("Sample_v1.2.3-arm64-Android.apk"),
				browser_download_url: "https://example.com/file.apk",
			},
			asset("checksums.txt"),
		],
		repo,
	);
	assert.deepEqual(
		[...groups.keys()],
		["Linux", "Windows", "Android", "macOS", "Others"],
	);
	assert.deepEqual(
		groups.get("Linux").map((file) => file.text),
		["CLI · amd64 · zip", "amd64 · tar.gz"],
	);
	assert.equal(groups.get("Linux")[0].size, "1.0 MiB");
	assert.equal(groups.get("Others")[0].text, "iOS · Simulator · arm64 · zip");
	assert.equal(groups.get("Windows").length, 1);
	assert.equal(groups.get("macOS").length, 0);
	assert.equal(groups.get("Android").length, 0);
});
