import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";

export const scrapePicsKCNA = async () => {
  const picSetURLs = await scrapePicSetURLs();
  console.log("NEW PIC SET URLS");
  console.log(picSetURLs);
};

export const scrapePicSetURLs = async () => {
  const { picListURL } = CONFIG;

  try {
    const kcna = new NORK({ url: picListURL });
    const html = await kcna.getHTML();
    const picSetListArray = await parsePicSetList(html);

    const picSetURLs = [];
    return picSetURLs;
  } catch (e) {
    console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    return null;
  }
};

export const parsePicSetList = async (html) => {
  console.log("PIC SET LIST HTML");
  console.log(html);

  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE LIST HTML ");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "parseArticleList";
    throw error;
  }
};
