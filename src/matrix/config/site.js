// Public configuration: edit this file to personalize your site.
// API credentials belong in .env.local or your hosting provider's secret settings.
export const siteMeta = {
	title: "Matrix 博客",
	owner: "Your Name",
	url: "https://example.com",
	description: "AI、技术开发与创造。欢迎来到我的数字世界。",
	brand: "MATRIX",
	tagline: "AI × ENGINEERING",
	soundEnabled: true, // Set false to disable click, typing and beam sounds.
	heroTitle: "欢迎来到我的数字世界",
	heroSubtitle: "AI 前沿 / 系统拆解 / 开发实践",
	github: "https://github.com/your-username",
	favicon: "/favicon.svg",
	themeName: "Matrix",
	themeRepository: "https://github.com/baiduxc/matrix",
	filingNumber: "", // Leave empty to hide. Only displayed on the homepage.
	filingUrl: "https://beian.miit.gov.cn/",
	articleLicense: {
		name: "CC BY-NC-SA 4.0",
		url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
	},
	about: {
		lead: "追问原理。连接更大的世界。",
		description: "关注 AI 与技术开发，记录探索、实验与创造。",
		principles: ["THINK DEEPER", "BUILD IN PUBLIC", "STAY HUMAN"],
		signature: "连接想法与技术",
	},
	projectPage: {
		title: "构建自己的世界",
		description: "从一行代码，到一个真实可用的产品。这里是我的独立实验室。",
	},
	projects:
		/** @type {{name: string, kind: string, url: string, description: string, tag: string}[]} */ ([]),
};
