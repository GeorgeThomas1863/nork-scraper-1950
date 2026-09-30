//trimmed KCNA category archive page (page 1 of "top"): paging vars, POST form, two article items
export const archiveListHTML = `
<html><head>
<script>
  var total = 533; var cur_page = 1; var per_page = 15; var page_cnt = 36;
</script>
</head><body>
<main>
  <div class="article">
    <h5 class="block">
      <a href="/en/article/detail/aaaa1111bbbb2222cccc3333dddd4444">  Kim Jong Un   Inspects Factory </a>
      <span><nobr>[2026.9.8.]</nobr></span>
    </h5>
  </div>
  <div class="article">
    <h5 class="block">
      <a href="/en/article/detail/eeee5555ffff6666aaaa7777bbbb8888">Second Story</a>
      <span><nobr>[2026.9.9.]</nobr></span>
    </h5>
  </div>
</main>
<form id="article_form" method="POST" action="/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4">
  <input type="hidden" name="page_num" value="1">
  <input type="hidden" name="cnt_per_page" value="15">
  <input type="hidden" name="keyword" value="">
  <input type="hidden" name="_csrf" value="tok-123-abc">
</form>
</body></html>`;

//what KCNA returns for a POST without a valid session: HTTP 200 with no article links
export const emptyArchiveHTML = `<html><body><main></main></body></html>`;
