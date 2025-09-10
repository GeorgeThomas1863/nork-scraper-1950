import CONFIG from "../../config/config.js";

//get article urls
export const scrapeArticlesKCNA = async () => {
  const { articleTypeUrlArr } = CONFIG;

  for (const type of articleTypeUrlArr) {
    const url = CONFIG[type];
    console.log("ARTICLE URL");
    console.log(url);
    // const articleUrls = await scrapeArticleUrls(url);
  }
};
