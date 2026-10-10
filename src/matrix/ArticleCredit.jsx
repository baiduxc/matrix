import { siteMeta } from "./config/site.js";
export function ArticleCredit({ post, onCopy = null, copied = false }) {
	const address = post.sourceLink || new URL(post.url, siteMeta.url).href;
	return (
		<section
			className="article-credit"
			aria-label="文章版权与地址"
			data-pagefind-ignore
		>
			<span className="credit-watermark" aria-hidden="true">
				CC
			</span>
			<div className="credit-heading">
				<h2>{post.title}</h2>
				{onCopy && (
					<button type="button" onClick={onCopy}>
						{copied ? "已复制 ✓" : "复制地址"}
					</button>
				)}
			</div>
			<a className="credit-address" href={address}>
				{address}
			</a>
			<dl>
				<div>
					<dt>作者</dt>
					<dd>{post.author || siteMeta.owner}</dd>
				</div>
				<div>
					<dt>发布于</dt>
					<dd>
						<time dateTime={post.date}>{post.date}</time>
					</dd>
				</div>
				<div>
					<dt>许可协议</dt>
					<dd>
						{post.licenseUrl ? (
							<a
								href={post.licenseUrl}
								target="_blank"
								rel="noopener noreferrer"
							>
								{post.licenseName}
							</a>
						) : (
							post.licenseName
						)}
					</dd>
				</div>
			</dl>
			<p>
				除另有声明外，本文采用上述许可协议。转载或改编请注明作者与原文地址，并遵守许可条款。
			</p>
		</section>
	);
}
