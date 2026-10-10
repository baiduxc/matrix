import fs from "node:fs";
import path from "node:path";

const [slug, title = slug] = process.argv.slice(2);
if (!slug || /\.mdx$/i.test(slug)) {
	console.error('Usage: pnpm new-post <slug> ["Article title"] (.md only)');
	process.exit(1);
}
const directory = path.resolve("src/content/posts");
const file = path.resolve(
	directory,
	slug.endsWith(".md") ? slug : `${slug}.md`,
);
if (
	!file.startsWith(`${directory}${path.sep}`) ||
	slug.split(/[\\/]/).includes("..")
) {
	console.error("Choose a filename inside src/content/posts.");
	process.exit(1);
}
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
fs.mkdirSync(path.dirname(file), { recursive: true });
try {
	fs.writeFileSync(
		file,
		`---\ntitle: ${JSON.stringify(title)}\npublished: ${date}\ndescription: ""\nimage: ""\ntags: []\ncategory: ""\ndraft: false\n---\n\n`,
		{ flag: "wx" },
	);
	console.log(`Created ${path.relative(process.cwd(), file)}`);
} catch (error) {
	if (error.code === "EEXIST") console.error("This article already exists.");
	else throw error;
	process.exitCode = 1;
}
