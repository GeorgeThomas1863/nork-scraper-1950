// Trimmed from real KCNA gallery detail pages fetched 2026-09-28 (bug 5):
//   http://www.kcna.kp/en/gallery/detail/e5853b58a9f50651db72719c7a39fcb6
//   http://www.kcna.kp/en/gallery/detail/90cb015a4c372ff0af6743daf82bdf3c
// Both pages carry the same picture set title, which itself contains an
// unescaped double quote. KCNA does not HTML-entity-escape it inside the
// alt="" attribute, so the attribute value is truncated by the parser to ""
// and the rest of the title splinters into bogus boolean attributes. The
// <title> tag holds the same text outside any attribute, so it survives
// intact and is used as a fallback.
export const quotedTitleGalleryDetailHTML = `
<html>
<head><title>KCNA | "Complete Collection of Kim Jong Il's Works" Published</title></head>
<body>
<main class="">
	<div class="gallery">
		<div class="slider">
			<div class="item">
				<div class="thumbnail-img">
					<img class="img-responsive" src="/photo/9f8dfd1724f738833fded03a1ed41f298d0948dfe720e4a5db87ffe8ba1cb187"  alt=""Complete Collection of Kim Jong Il's Works" Published">
				</div>
			</div>
		</div>
	</div>
</main>
</body>
</html>`

// Confirms neither real bug 4 detail page has any date element on the page
// at all (fetched 2026-09-28, http://www.kcna.kp/en/gallery/detail/6cc18ebab621338a4ce3a6fe3d514764
// and .../496d8a773f45057fd99963be55220c6a): no .publish-time, no nobr,
// anywhere in the document. Trimmed structure below matches both real pages.
export const noDateGalleryDetailHTML = `
<main class="">
	<div class="gallery">
		<div class="slider">
			<div class="item">
				<div class="thumbnail-img">
					<img class="img-responsive" src="/photo/983c74764d50d46eed473d67779f45ba009bb8c1fa55a11d0bbd735a01ecb592"  alt="President Kim Il Sung, Peerless Patriot">
				</div>
			</div>
			<div class="item">
				<div class="thumbnail-img">
					<img class="img-responsive" src="/photo/983c74764d50d46eed473d67779f45ba90363172d40fe12373ec7a328285905f"  alt="President Kim Il Sung, Peerless Patriot">
				</div>
			</div>
		</div>
	</div>
</main>`
