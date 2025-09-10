import CONFIG from "../../config/config.js";
import KCNA from "../../models/kcna.js";

//get article urls
export const scrapeArticlesKCNA = async () => {
  const { articleTypeUrlArr } = CONFIG;

  for (const type of articleTypeUrlArr) {
    const url = CONFIG[type];
    const kcna = new KCNA({ url });
    //list html
    const html = await kcna.getHTML();
    const articleListData = await parseArticleList(html);
    // console.log("ARTICLE URL");
    // console.log(url);
  }
};

const parseArticleList = async (html) => {
    console.log("PARSE ARTICLE LIST");
    console.log(html);
}


