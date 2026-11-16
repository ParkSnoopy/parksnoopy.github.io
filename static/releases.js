const platforms = ["Linux", "Windows", "Android", "macOS", "Others"];
const messages = {
	en: {
		limit: "GitHub's request limit was reached. Please try again later.",
		http: (status) => `Could not load releases from GitHub (HTTP ${status}).`,
		invalid: "GitHub returned an invalid release list.",
		empty: "No release yet.",
		unavailable: "Not available",
		others: "Others",
		loading: "Loading releases…",
		timeout: "GitHub took too long to respond.",
		offline: "Could not connect to GitHub.",
		github: "View releases on GitHub",
		retry: "Retry",
	},
	ko: {
		limit: "GitHub 요청 한도에 도달했습니다. 나중에 다시 시도하세요.",
		http: (status) =>
			`GitHub에서 릴리스를 불러오지 못했습니다 (HTTP ${status}).`,
		invalid: "GitHub에서 잘못된 릴리스 목록을 반환했습니다.",
		empty: "아직 릴리스가 없습니다.",
		unavailable: "미제공",
		others: "기타",
		loading: "릴리스를 불러오는 중…",
		timeout: "GitHub 응답 시간이 초과되었습니다.",
		offline: "GitHub에 연결하지 못했습니다.",
		github: "GitHub에서 릴리스 보기",
		retry: "다시 시도",
	},
};

// GitHub returns releases newest first. Keep the existing stable <slug>-<SHA> track.
export async function fetchReleases(
	repo,
	slugs,
	fetcher = fetch,
	language = "en",
) {
	const text = messages[language] || messages.en;
	const latest = new Map();
	for (let page = 1; ; page++) {
		const response = await fetcher(
			`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
			{
				headers: { Accept: "application/vnd.github+json" },
				credentials: "omit",
				cache: "no-store",
				signal: AbortSignal.timeout(15000),
			},
		);
		if (!response.ok) {
			if (
				response.status === 429 ||
				(response.status === 403 &&
					response.headers.get("x-ratelimit-remaining") === "0")
			) {
				throw new Error(text.limit);
			}
			throw new Error(text.http(response.status));
		}
		const releases = await response.json();
		if (!Array.isArray(releases)) throw new Error(text.invalid);
		for (const release of releases) {
			if (
				release.draft ||
				release.prerelease ||
				typeof release.tag_name !== "string"
			)
				continue;
			const slug = release.tag_name.replace(/-[0-9a-f]{7,40}$/, "");
			if (slugs.includes(slug) && !latest.has(slug)) latest.set(slug, release);
		}
		if (
			latest.size === slugs.length ||
			!/<[^>]+>;\s*rel="next"/.test(response.headers.get("link") || "")
		) {
			return latest;
		}
	}
}

export function packageFiles(assets, repo) {
	const groups = new Map(platforms.map((platform) => [platform, []]));
	for (const asset of [...assets].sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		const match = /^.+-([^-]+)-([A-Za-z]+)(?:_([A-Za-z]+))?\.(.+)$/.exec(
			asset.name,
		);
		if (!match || asset.state !== "uploaded") continue;
		const [, arch, platform, variant, extension] = match;
		const group =
			platforms.includes(platform) && platform !== "Others"
				? platform
				: "Others";
		// Do not turn API-provided text into markup or accept non-GitHub download URLs.
		let url;
		try {
			url = new URL(asset.browser_download_url);
		} catch {
			continue;
		}
		if (
			url.origin !== "https://github.com" ||
			!url.pathname.startsWith(`/${repo}/releases/download/`)
		)
			continue;
		groups.get(group).push({
			text: [group === "Others" ? platform : null, variant, arch, extension]
				.filter(Boolean)
				.join(" · "),
			size: `${(asset.size / 1048576).toFixed(1)} MiB`,
			url: url.href,
		});
	}
	return groups;
}

function renderRelease(section, release, repo, text) {
	section.querySelector(".release-meta").textContent = release
		? `${release.name?.match(/v[0-9][^ ]*/)?.[0] || release.tag_name} · ${release.published_at.slice(0, 10)}`
		: text.empty;
	const list = section.querySelector(".platforms");
	const rows = [];
	for (const [platform, packages] of packageFiles(
		release?.assets || [],
		repo,
	)) {
		const row = document.createElement("li");
		const label = document.createElement("span");
		label.className = "platform";
		label.textContent = platform === "Others" ? text.others : platform;
		const files = document.createElement("span");
		files.className = "files";
		for (const file of packages) {
			const link = document.createElement("a");
			link.className = "dl";
			link.href = file.url;
			link.download = "";
			link.textContent = `${file.text} `;
			const size = document.createElement("small");
			size.textContent = file.size;
			link.append(size);
			files.append(link);
		}
		if (!packages.length) {
			const unavailable = document.createElement("span");
			unavailable.className = "dl disabled";
			unavailable.setAttribute("aria-disabled", "true");
			unavailable.textContent = text.unavailable;
			files.append(unavailable);
		}
		row.append(label, files);
		rows.push(row);
	}
	list.replaceChildren(...rows);
	list.hidden = false;
}

export async function loadReleases(root) {
	const repo = root.dataset.releaseRepo;
	const language = root.dataset.language;
	const text = messages[language] || messages.en;
	const sections = [...root.querySelectorAll("[data-project]")];
	const status = root.querySelector("[data-release-status]");
	root.setAttribute("aria-busy", "true");
	status.hidden = false;
	status.textContent = text.loading;
	try {
		const releases = await fetchReleases(
			repo,
			sections.map((section) => section.dataset.project),
			fetch,
			language,
		);
		for (const section of sections)
			renderRelease(section, releases.get(section.dataset.project), repo, text);
		status.textContent = "";
		status.hidden = true;
	} catch (error) {
		const message =
			error.name === "TimeoutError"
				? text.timeout
				: error instanceof TypeError
					? text.offline
					: error.message;
		status.textContent = `${message} `;
		const github = document.createElement("a");
		github.href = `https://github.com/${repo}/releases`;
		github.textContent = text.github;
		const retry = document.createElement("button");
		retry.type = "button";
		retry.textContent = text.retry;
		retry.addEventListener("click", () => loadReleases(root), { once: true });
		status.append(github, " ", retry);
	} finally {
		root.setAttribute("aria-busy", "false");
	}
}

if (typeof document !== "undefined") {
	const root = document.querySelector("[data-release-repo]");
	if (root) loadReleases(root);
}
